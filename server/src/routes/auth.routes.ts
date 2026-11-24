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
import { getUserDto } from '../services/user.service';
import { audit, clientIp } from '../services/audit.service';
import { describeClient, endAllSessions, endSession, startSession } from '../services/session.service';
import { getSettings } from '../services/settings.service';
import { flushOutbox, queueEmail, renderPasswordResetEmail } from '../services/mailer.service';
import { env } from '../env';

export const authRouter = Router();

const ME_CACHE_TTL_MS = 5000;
const SETTINGS_CACHE_TTL_MS = 15000;
const meCache = new Map<string, { expiresAt: number; payload: unknown }>();
let settingsCache: { expiresAt: number; value: Awaited<ReturnType<typeof getSettings>> } | null = null;

async function getCachedSettings() {
  if (settingsCache && Date.now() < settingsCache.expiresAt) {
    return settingsCache.value;
  }
  const value = await getSettings();
  settingsCache = { expiresAt: Date.now() + SETTINGS_CACHE_TTL_MS, value };
  return value;
}

function getCachedMe(userId: string) {
  const hit = meCache.get(userId);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    meCache.delete(userId);
    return null;
  }
  return hit.payload;
}

function setCachedMe(userId: string, payload: unknown) {
  if (meCache.size >= 300) {
    const oldest = meCache.keys().next().value;
    if (oldest) meCache.delete(oldest);
  }
  meCache.set(userId, { expiresAt: Date.now() + ME_CACHE_TTL_MS, payload });
}

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

authRouter.post(
  '/login',
  loginLimiter,
  handler(async (req, res) => {
    const body = parse(loginSchema, req.body);
    const email = body.email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        role: true,
        department: true,
        position: true,
      },
    });

    if (!user) {
      throw unauthorized('Invalid email or password');
    }

    const isValid = await verifyPassword(body.password, user.passwordHash);
    if (!isValid) {
      throw unauthorized('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw forbidden('This account is currently inactive. Please contact your administrator.');
    }

    let sessionId: string;
    try {
      sessionId = await startSession(
        user.id,
        { ip: clientIp(req), userAgent: req.headers['user-agent'] },
        body.position,
      );
    } catch {
      sessionId = 'sess_' + Math.random().toString(36).slice(2, 10);
    }

    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role.key,
      portal: user.role.portal,
      sid: sessionId,
    });

    const ip = clientIp(req);
    const userAgent = req.headers['user-agent'];

    const [refreshToken, auth, settings, freshUser] = await Promise.all([
      issueRefreshToken(user.id, { userAgent, ip, sessionId }),
      loadAuthUser(user.id),
      getCachedSettings().catch(() => ({ locationTrackingEnabled: false, locationConsentVersion: '1.0' })),
      getUserDto(user.id),
      prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => undefined),
      audit({
        actorId: user.id,
        action: 'auth.login',
        entity: 'UserSession',
        entityId: sessionId,
        ip,
        meta: { device: describeClient(userAgent).device },
      }).catch(() => undefined),
    ]);

    res.json({
      accessToken,
      refreshToken,
      sessionId,
      user: freshUser,
      permissions: [...(auth?.permissions ?? [])],
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

    const user = await prisma.user.findUnique({ where: { email } });

    let emailSent = false;
    let emailStatus: 'SENT' | 'QUEUED' | 'NOT_CONFIGURED' = 'NOT_CONFIGURED';

    if (user && user.status === 'ACTIVE') {
      await prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      const { token, hash } = generatePasswordResetToken();
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
      } else {
        emailStatus = 'NOT_CONFIGURED';
      }

      await audit({
        actorId: user.id,
        action: 'auth.forgot_password_requested',
        entity: 'User',
        entityId: user.id,
        ip: clientIp(req),
      });
    }

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

    await endAllSessions(record.userId, 'PASSWORD_RESET');
    await revokeAllRefreshTokens(record.userId);
    meCache.delete(record.userId);

    await audit({
      actorId: record.userId,
      action: 'auth.password_reset_completed',
      entity: 'User',
      entityId: record.userId,
      ip: clientIp(req),
    });

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

    meCache.delete(user.id);

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
    const cached = getCachedMe(auth.id);
    if (cached) {
      res.json(cached);
      return;
    }

    const [user, settings] = await Promise.all([getUserDto(auth.id), getCachedSettings()]);
    const payload = {
      user,
      permissions: [...auth.permissions],
      sessionId: auth.sessionId ?? null,
      privacy: {
        locationTrackingEnabled: settings.locationTrackingEnabled,
        consentVersion: settings.locationConsentVersion,
        consentGiven:
          !!auth.locationConsentAt && auth.locationConsentVersion === settings.locationConsentVersion,
      },
    };

    setCachedMe(auth.id, payload);
    res.json(payload);
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
    meCache.delete(auth.id);

    await audit({
      actorId: auth.id,
      action: 'auth.email_updated',
      entity: 'User',
      entityId: auth.id,
      ip: clientIp(req),
      meta: { oldEmail: auth.email, newEmail: updated.email },
    });

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
    await endAllSessions(auth.id, 'PASSWORD_CHANGE');
    await revokeAllRefreshTokens(auth.id);
    meCache.delete(auth.id);
    await audit({ actorId: auth.id, action: 'auth.password_changed', entity: 'User', entityId: auth.id });

    res.json({ ok: true });
  }),
);

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
    const settings = await getCachedSettings();
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
    const settings = await getCachedSettings();

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
    meCache.delete(auth.id);

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