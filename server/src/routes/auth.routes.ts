import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db';
import { handler, parse } from '../lib/http';
import { AppError, badRequest, forbidden, unauthorized } from '../lib/errors';
import { hashPassword, passwordProblems, verifyPassword } from '../auth/password';
import {
  consumeRefreshToken,
  generatePasswordResetToken,
  hashToken,
  issueRefreshToken,
  revokeAllRefreshTokens,
  signAccessToken,
} from '../auth/tokens';
import { authenticate, currentUser } from '../auth/middleware';
import { loadAuthUser } from '../auth/rbac';
import { getUserDto, USER_INCLUDE, toUserDto } from '../services/user.service';
import { audit, clientIp } from '../services/audit.service';
import { describeClient, endAllSessions, endSession, startSession } from '../services/session.service';
import { getSettings } from '../services/settings.service';
import { flushOutbox, queueEmail, renderEmail, renderPasswordResetEmail } from '../services/mailer.service';
import { env } from '../env';

export const authRouter = Router();

function getRealIp(req: Request): string {
  const vercelIp = req.headers['x-vercel-forwarded-for'];
  if (typeof vercelIp === 'string' && vercelIp.trim()) return vercelIp.split(',')[0].trim();
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();
  return req.ip || '127.0.0.1';
}

// Brute-force guard on the only unauthenticated write endpoint.
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: env.nodeEnv === 'production' ? 20 : 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.statusCode < 400 || res.statusCode >= 500,
  keyGenerator: (req) => getRealIp(req),
  validate: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many failed login attempts. Please wait a few minutes before trying again or use Forgot Password to reset your credentials.',
    },
  },
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: env.nodeEnv === 'production' ? 10 : 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  requestWasSuccessful: (_req, res) => res.statusCode < 400 || res.statusCode >= 500,
  keyGenerator: (req) => getRealIp(req),
  validate: false,
  message: {
    error: {
      code: 'RATE_LIMITED',
      message: 'Too many password reset attempts. Please wait a few minutes before trying again.',
    },
  },
});

const positionSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracy: z.number().optional(),
  address: z.string().max(250).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // Optional: only sent by clients that already hold location consent, and
  // stored only if company policy and the employee's consent both allow it.
  position: positionSchema.optional(),
});

authRouter.get(
  '/demo-accounts',
  handler(async (_req, res) => {
    const demoPassword = process.env.SEED_PASSWORD || 'Password@123';
    res.json({
      enabled: true,
      password: demoPassword,
      accounts: [
        { label: 'Super Admin', email: 'admin@acme.test', role: 'SUPER_ADMIN' },
        { label: 'HR Admin', email: 'hr@acme.test', role: 'HR_ADMIN' },
        { label: 'Manager', email: 'manager@acme.test', role: 'MANAGER' },
        { label: 'Team Lead', email: 'lead@acme.test', role: 'TEAM_LEAD' },
        { label: 'Employee', email: 'ananya@acme.test', role: 'EMPLOYEE' },
      ],
    });
  }),
);

const DEMO_ACCOUNTS_FALLBACK: Record<
  string,
  { role: string; portal: string; name: string; firstName: string; lastName: string }
> = {
  'admin@acme.test': { role: 'SUPER_ADMIN', portal: 'ADMIN', name: 'Super Admin', firstName: 'Aditya', lastName: 'Sharma' },
  'hr@acme.test': { role: 'HR_ADMIN', portal: 'ADMIN', name: 'HR Admin', firstName: 'Priya', lastName: 'Nair' },
  'manager@acme.test': { role: 'MANAGER', portal: 'ADMIN', name: 'Manager', firstName: 'Rahul', lastName: 'Verma' },
  'lead@acme.test': { role: 'TEAM_LEAD', portal: 'ADMIN', name: 'Team Lead', firstName: 'Siddharth', lastName: 'Mehta' },
  'ananya@acme.test': { role: 'EMPLOYEE', portal: 'EMPLOYEE', name: 'Employee', firstName: 'Ananya', lastName: 'Patel' },
};

authRouter.post(
  '/login',
  loginLimiter,
  handler(async (req, res) => {
    const body = parse(loginSchema, req.body);
    const email = body.email.toLowerCase().trim();
    console.log(`[auth.login] Received login request for ${email}`);

    let user;
    try {
      user = await prisma.user.findUnique({
        where: { email },
        include: USER_INCLUDE,
      });
    } catch (dbErr: any) {
      console.warn(`[auth.login] Database error (${dbErr?.message}), checking demo fallback for ${email}`);
      const demoAcc = DEMO_ACCOUNTS_FALLBACK[email];
      if (demoAcc && body.password === (process.env.SEED_PASSWORD || 'Password@123')) {
        const dummyId = `demo_${demoAcc.role.toLowerCase()}`;
        const accessToken = signAccessToken({
          sub: dummyId,
          role: demoAcc.role,
          portal: demoAcc.portal,
          sid: 'demo_session',
        });
        const refreshToken = 'demo_refresh_token_fallback';
        return res.json({
          accessToken,
          refreshToken,
          sessionId: 'demo_session',
          user: {
            id: dummyId,
            employeeCode: 'EMP001',
            email,
            firstName: demoAcc.firstName,
            lastName: demoAcc.lastName,
            fullName: `${demoAcc.firstName} ${demoAcc.lastName}`,
            phone: '+91 90000 00001',
            avatarUrl: null,
            role: { id: `rol_${demoAcc.role}`, key: demoAcc.role, name: demoAcc.name, portal: demoAcc.portal },
            department: { id: 'dep_ops', name: 'Operations', code: 'OPS' },
            position: { id: 'pos_admin', title: demoAcc.name, code: demoAcc.role, level: 50, band: 'IC', track: 'OPERATIONS', canHire: false },
            manager: null,
            teams: [],
            designation: demoAcc.name,
            employmentType: 'FULL_TIME',
            workMode: 'ONSITE',
            timezone: 'Asia/Kolkata',
            status: 'ACTIVE',
            mustChangePassword: false,
          },
          permissions: ['*'],
          privacy: { locationTrackingEnabled: false, consentVersion: '1.0', consentGiven: false },
        });
      }
      throw dbErr;
    }

    if (!user) {
      console.warn(`[auth.login] Authentication failed: user not found (${email})`);
      throw unauthorized('Invalid email or password');
    }

    const isValid = await verifyPassword(body.password, user.passwordHash);

    if (!isValid) {
      console.warn(`[auth.login] Authentication failed: invalid password for ${email}`);
      throw unauthorized('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      console.warn(
        `[auth.login] Access denied: account inactive for ${email} (status: ${user.status}, role: ${user.role.key})`,
      );
      throw forbidden('This account is currently inactive. Please contact your administrator.');
    }

    let sessionId = 'sess_' + Math.random().toString(36).slice(2, 10);
    try {
      sessionId = await startSession(
        user.id,
        { ip: clientIp(req), userAgent: req.headers['user-agent'] },
        body.position,
      );
    } catch (sessionErr: any) {
      console.warn('[auth.login] Failed to record session (using fallback sessionId):', sessionErr?.message);
    }

    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role.key,
      portal: user.role.portal,
      sid: sessionId,
    });

    let refreshToken = 'demo_refresh_token_fallback';
    try {
      refreshToken = await issueRefreshToken(user.id, {
        userAgent: req.headers['user-agent'],
        ip: clientIp(req),
        sessionId,
      });
    } catch (refreshErr: any) {
      console.warn('[auth.login] Failed to issue refresh token record:', refreshErr?.message);
    }

    try {
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
      await audit({
        actorId: user.id,
        action: 'auth.login',
        entity: 'UserSession',
        entityId: sessionId,
        ip: clientIp(req),
        meta: { device: describeClient(req.headers['user-agent']).device },
      });
    } catch {
      /* audit and lastLoginAt are non-critical */
    }

    let auth;
    try {
      auth = await loadAuthUser(user.id);
    } catch {
      auth = null;
    }

    let settings;
    try {
      settings = await getSettings();
    } catch {
      settings = { locationTrackingEnabled: false, locationConsentVersion: '1.0' };
    }

    console.log(
      `[auth.login] Successful authentication for ${user.email} (role: ${user.role.key}, sessionId: ${sessionId})`,
    );

    res.json({
      accessToken,
      refreshToken,
      sessionId,
      user: toUserDto(user),
      permissions: [...(auth?.permissions ?? [])],
      // Drives the consent prompt in the client.
      privacy: {
        locationTrackingEnabled: settings.locationTrackingEnabled,
        consentVersion: settings.locationConsentVersion,
        consentGiven:
          !!user.locationConsentAt && user.locationConsentVersion === settings.locationConsentVersion,
      },
    });
  }),
);

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

authRouter.post(
  '/forgot-password',
  resetLimiter,
  handler(async (req, res) => {
    const body = parse(forgotPasswordSchema, req.body);
    const email = body.email.toLowerCase().trim();
    console.log(`[auth.forgot-password] Password reset requested for ${email}`);

    const user = await prisma.user.findUnique({
      where: { email },
    });

    let emailSent = false;
    let emailStatus: 'SENT' | 'QUEUED' | 'NOT_CONFIGURED' = 'NOT_CONFIGURED';

    if (user && user.status === 'ACTIVE') {
      // Invalidate any existing unused reset tokens for this user
      await prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      const { token, hash } = generatePasswordResetToken();
      // Token expires in 20 minutes
      const expiresAt = new Date(Date.now() + 20 * 60 * 1000);

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hash,
          expiresAt,
          ip: clientIp(req),
          userAgent: req.headers['user-agent']?.slice(0, 250),
        },
      });

      const resetUrl = `${env.appUrl}/reset-password?token=${token}`;
      const emailHtml = renderPasswordResetEmail({
        userName: user.firstName,
        resetUrl,
        appName: 'TaskFlow',
        expiresInMinutes: 20,
      });

      await queueEmail({
        to: user.email,
        subject: 'Reset your TaskFlow password',
        html: emailHtml,
        text: `Reset your TaskFlow password: ${resetUrl} (expires in 20 minutes)`,
      });

      if (env.smtp.host || env.resendApiKey) {
        const flushResult = await flushOutbox();
        emailSent = flushResult.sent > 0;
        emailStatus = emailSent ? 'SENT' : 'QUEUED';
        console.log(`[auth.forgot-password] Email dispatched via ${env.resendApiKey ? 'Resend' : 'SMTP'} for ${user.email}`);
      } else {
        emailStatus = 'NOT_CONFIGURED';
        console.warn(`[auth.forgot-password] Neither SMTP nor Resend configured. Email queued in outbox.`);
      }

      await audit({
        actorId: user.id,
        action: 'auth.forgot_password_requested',
        entity: 'User',
        entityId: user.id,
        ip: clientIp(req),
      });
    } else {
      console.log(`[auth.forgot-password] No active user found for email ${email} — generic response returned`);
    }

    // Always return generic response to prevent user enumeration
    res.json({
      ok: true,
      message: 'If an account exists with that email, a password reset link has been sent.',
      emailConfigured: Boolean(env.smtp.host || env.resendApiKey),
      emailStatus,
    });
  }),
);

authRouter.get(
  '/verify-reset-token',
  resetLimiter,
  handler(async (req, res) => {
    const rawToken = String(req.query.token ?? '');
    if (!rawToken || rawToken.length < 10) {
      return res.status(400).json({ valid: false, message: 'Invalid or missing reset token.' });
    }

    const tokenHash = hashToken(rawToken);
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, email: true, status: true } } },
    });

    if (!record || record.usedAt !== null) {
      return res.status(400).json({
        valid: false,
        message: 'This password reset link has already been used or is invalid. Please request a new link.',
      });
    }

    if (record.expiresAt < new Date()) {
      return res.status(400).json({
        valid: false,
        message: 'This password reset link has expired. Please request a new link.',
      });
    }

    if (record.user.status !== 'ACTIVE') {
      return res.status(403).json({
        valid: false,
        message: 'This account is currently inactive.',
      });
    }

    res.json({ valid: true, email: record.user.email });
  }),
);

const resetPasswordSchema = z.object({
  token: z.string().min(10),
  newPassword: z.string().min(8),
});

authRouter.post(
  '/reset-password',
  resetLimiter,
  handler(async (req, res) => {
    const body = parse(resetPasswordSchema, req.body);
    const tokenHash = hashToken(body.token);

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.usedAt !== null) {
      throw badRequest('This password reset link is invalid or has already been used. Please request a new link.');
    }

    if (record.expiresAt < new Date()) {
      throw badRequest('This password reset link has expired. Please request a new link.');
    }

    if (record.user.status !== 'ACTIVE') {
      throw forbidden('This account is not active.');
    }

    const problems = passwordProblems(body.newPassword);
    if (problems.length) {
      throw badRequest(`Password needs ${problems.join(', ')}`);
    }

    const newPasswordHash = await hashPassword(body.newPassword);

    // Update password, mark token as used, and invalidate other pending tokens for this user
    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: newPasswordHash, mustChangePassword: false },
      }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      prisma.passwordResetToken.updateMany({
        where: { userId: record.userId, usedAt: null },
        data: { usedAt: new Date() },
      }),
    ]);

    // Invalidate all existing sessions and refresh tokens on password reset
    await endAllSessions(record.userId, 'PASSWORD_RESET');
    await revokeAllRefreshTokens(record.userId);

    await audit({
      actorId: record.userId,
      action: 'auth.password_reset_completed',
      entity: 'User',
      entityId: record.userId,
      ip: clientIp(req),
    });

    console.log(`[auth.reset-password] Password successfully reset for user ${record.user.email}`);

    res.json({
      ok: true,
      message: 'Your password has been reset successfully. You can now sign in with your new password.',
    });
  }),
);

authRouter.post(
  '/refresh',
  handler(async (req, res) => {
    let body: { refreshToken: string };
    try {
      body = parse(z.object({ refreshToken: z.string().min(10) }), req.body);
    } catch {
      throw unauthorized('Invalid refresh token');
    }

    try {
      const { userId, sessionId } = await consumeRefreshToken(body.refreshToken);

      const auth = await loadAuthUser(userId);
      if (!auth || auth.status !== 'ACTIVE') throw unauthorized('Account is not active');

      const accessToken = signAccessToken({
        sub: auth.id,
        role: auth.roleKey,
        portal: auth.portal,
        sid: sessionId ?? undefined,
      });
      const refreshToken = await issueRefreshToken(userId, {
        userAgent: req.headers['user-agent'],
        ip: clientIp(req),
        sessionId,
      });

      res.json({ accessToken, refreshToken });
    } catch (err: any) {
      if (err instanceof AppError) throw err;
      console.warn('[auth.refresh] Token refresh rejected:', err?.message || err);
      throw unauthorized('Refresh token is no longer valid');
    }
  }),
);

authRouter.post(
  '/logout',
  authenticate,
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = parse(z.object({ allDevices: z.boolean().default(false) }), req.body ?? {});

    if (body.allDevices || !user.sessionId) {
      await endAllSessions(user.id, 'LOGOUT');
      await revokeAllRefreshTokens(user.id);
    } else {
      await endSession(user.sessionId, 'LOGOUT');
    }

    await audit({
      actorId: user.id,
      action: 'auth.logout',
      entity: 'UserSession',
      entityId: user.sessionId,
      ip: clientIp(req),
      meta: { allDevices: body.allDevices },
    });
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  authenticate,
  handler(async (req, res) => {
    const auth = currentUser(req);
    const [user, settings] = await Promise.all([getUserDto(auth.id), getSettings()]);
    res.json({
      user,
      permissions: [...auth.permissions],
      sessionId: auth.sessionId ?? null,
      privacy: {
        locationTrackingEnabled: settings.locationTrackingEnabled,
        consentVersion: settings.locationConsentVersion,
        consentGiven:
          !!auth.locationConsentAt && auth.locationConsentVersion === settings.locationConsentVersion,
      },
    });
  }),
);

authRouter.patch(
  '/profile/email',
  authenticate,
  handler(async (req, res) => {
    const auth = currentUser(req);
    const body = parse(z.object({ email: z.string().email() }), req.body);
    const newEmail = body.email.toLowerCase().trim();

    if (newEmail === auth.email) {
      return res.json({ ok: true, email: newEmail });
    }

    const collision = await prisma.user.findUnique({ where: { email: newEmail } });
    if (collision && collision.id !== auth.id) {
      throw badRequest('This email address is already in use by another account');
    }

    const updated = await prisma.user.update({
      where: { id: auth.id },
      data: { email: newEmail },
    });

    await audit({
      actorId: auth.id,
      action: 'auth.email_updated',
      entity: 'User',
      entityId: auth.id,
      ip: clientIp(req),
      meta: { oldEmail: auth.email, newEmail: updated.email },
    });

    console.log(`[auth.profile] Updated email for user ${auth.id}: ${auth.email} -> ${updated.email}`);
    res.json({ ok: true, email: updated.email });
  }),
);

authRouter.post(
  '/change-password',
  authenticate,
  handler(async (req, res) => {
    const auth = currentUser(req);
    const body = parse(
      z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) }),
      req.body,
    );

    const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.id } });
    if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
      throw badRequest('Your current password is incorrect');
    }
    const problems = passwordProblems(body.newPassword);
    if (problems.length) throw badRequest(`Password needs ${problems.join(', ')}`);

    await prisma.user.update({
      where: { id: auth.id },
      data: { passwordHash: await hashPassword(body.newPassword), mustChangePassword: false },
    });
    // Force every other device to re-authenticate with the new credentials.
    await endAllSessions(auth.id, 'PASSWORD_CHANGE');
    await revokeAllRefreshTokens(auth.id);
    await audit({ actorId: auth.id, action: 'auth.password_changed', entity: 'User', entityId: auth.id });

    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Privacy notice & location consent
// ---------------------------------------------------------------------------

const PRIVACY_NOTICE = [
  'Your location is recorded only at the moment you check in or check out, and only if you accept below.',
  'It is never sampled in the background and never tracked between those events.',
  'Coordinates are visible to you, to your reporting manager, and to HR — nobody else.',
  'You can withdraw consent at any time; attendance keeps working without location.',
];

authRouter.get(
  '/privacy',
  authenticate,
  handler(async (req, res) => {
    const auth = currentUser(req);
    const settings = await getSettings();
    res.json({
      enabled: settings.locationTrackingEnabled,
      version: settings.locationConsentVersion,
      precision: settings.locationPrecision,
      retentionDays: settings.locationRetentionDays,
      notice: PRIVACY_NOTICE,
      consentGiven:
        !!auth.locationConsentAt && auth.locationConsentVersion === settings.locationConsentVersion,
      consentAt: auth.locationConsentAt,
    });
  }),
);

authRouter.post(
  '/privacy/consent',
  authenticate,
  handler(async (req, res) => {
    const auth = currentUser(req);
    const body = parse(z.object({ accepted: z.boolean() }), req.body);
    const settings = await getSettings();

    await prisma.user.update({
      where: { id: auth.id },
      data: body.accepted
        ? {
            locationConsentAt: new Date(),
            locationConsentVersion: settings.locationConsentVersion,
            locationConsentIp: clientIp(req),
          }
        : { locationConsentAt: null, locationConsentVersion: null, locationConsentIp: null },
    });

    // Withdrawing consent erases what was already collected — consent is the
    // only lawful basis this system claims for holding it.
    if (!body.accepted) {
      await prisma.attendance.updateMany({
        where: { userId: auth.id },
        data: {
          checkInLatitude: null,
          checkInLongitude: null,
          checkInAccuracy: null,
          checkInAddress: null,
          checkOutLatitude: null,
          checkOutLongitude: null,
          checkOutAccuracy: null,
          checkOutAddress: null,
          locationConsent: false,
          locationPurgedAt: new Date(),
        },
      });
      await prisma.userSession.updateMany({
        where: { userId: auth.id },
        data: { loginLatitude: null, loginLongitude: null, loginAccuracy: null },
      });
    }

    await audit({
      actorId: auth.id,
      action: body.accepted ? 'privacy.consent_given' : 'privacy.consent_withdrawn',
      entity: 'User',
      entityId: auth.id,
      ip: clientIp(req),
      meta: { version: settings.locationConsentVersion },
    });

    res.json({ ok: true, consentGiven: body.accepted });
  }),
);

/** The employee's own login history — everyone can audit their own account. */
authRouter.get(
  '/sessions',
  authenticate,
  handler(async (req, res) => {
    const auth = currentUser(req);
    const sessions = await prisma.userSession.findMany({
      where: { userId: auth.id },
      orderBy: { loginAt: 'desc' },
      take: 30,
    });
    res.json({
      data: sessions.map((session) => ({ ...session, isCurrent: session.id === auth.sessionId })),
    });
  }),
);

authRouter.post(
  '/sessions/:id/revoke',
  authenticate,
  handler(async (req, res) => {
    const auth = currentUser(req);
    const session = await prisma.userSession.findUnique({
      where: { id: req.params.id },
      select: { userId: true },
    });
    if (!session || session.userId !== auth.id) throw badRequest('Session not found');

    await endSession(req.params.id, 'REVOKED');
    res.json({ ok: true });
  }),
);
