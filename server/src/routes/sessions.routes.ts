import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { handler, paginated, parse, skipTake } from '../lib/http';
import { forbidden, notFound } from '../lib/errors';
import { authenticate, currentUser, requirePermission } from '../auth/middleware';
import { assertCanTouchUser, userScopeFilter } from '../auth/rbac';
import { endSession, expireIdleSessions } from '../services/session.service';
import { canSeeCoordinates, redactLocation } from '../services/geo.service';
import { auditFromRequest } from '../services/audit.service';
import { getSettings } from '../services/settings.service';

export const sessionsRouter = Router();
sessionsRouter.use(authenticate);

const USER_SELECT = {
  select: {
    id: true,
    firstName: true,
    lastName: true,
    employeeCode: true,
    department: { select: { name: true } },
    role: { select: { key: true, name: true } },
  },
};

/**
 * Login/logout activity for everyone in the caller's scope.
 * A Manager sees their reporting line; HR and the CEO see everyone.
 */
sessionsRouter.get(
  '/',
  requirePermission('session.read.own'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const q = parse(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
        userId: z.string().optional(),
        activeOnly: z.coerce.boolean().default(false),
      }),
      req.query,
    );

    const scopeWhere = q.userId
      ? (await assertCanTouchUser(user, 'session.read', q.userId), { userId: q.userId })
      : await userScopeFilter(user, 'session.read');

    const where = { ...scopeWhere, ...(q.activeOnly ? { isActive: true } : {}) };

    const [rows, total, activeCount] = await Promise.all([
      prisma.userSession.findMany({
        where,
        include: { user: USER_SELECT },
        orderBy: { loginAt: 'desc' },
        ...skipTake(q.page, q.pageSize),
      }),
      prisma.userSession.count({ where }),
      prisma.userSession.count({ where: { ...scopeWhere, isActive: true } }),
    ]);

    const visible = rows.map((row) =>
      redactLocation(
        row as unknown as Record<string, unknown>,
        canSeeCoordinates(user, row.userId, true),
      ),
    );

    res.json({ ...paginated(visible, total, q.page, q.pageSize), activeCount });
  }),
);

/** Who is signed in right now, one row per employee with a live session. */
sessionsRouter.get(
  '/active',
  requirePermission('session.read.own'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const scopeWhere = await userScopeFilter(user, 'session.read');
    const settings = await getSettings();

    const sessions = await prisma.userSession.findMany({
      where: { ...scopeWhere, isActive: true },
      include: { user: USER_SELECT },
      orderBy: { lastSeenAt: 'desc' },
      take: 200,
    });

    const idleTimeout = Number(settings?.sessionIdleTimeoutMinutes) || 720;
    const idleCutoff = Date.now() - idleTimeout * 60_000;

    res.json({
      data: sessions.map((session) => ({
        id: session.id,
        user: session.user,
        loginAt: session.loginAt,
        lastSeenAt: session.lastSeenAt,
        device: session.device,
        browser: session.browser,
        os: session.os,
        loginLatitude: canSeeCoordinates(user, session.userId, true) ? session.loginLatitude : null,
        loginLongitude: canSeeCoordinates(user, session.userId, true) ? session.loginLongitude : null,
        ip: canSeeCoordinates(user, session.userId, true) ? session.ip : null,
        isCurrent: session.id === user.sessionId,
        isIdle: session.lastSeenAt ? new Date(session.lastSeenAt).getTime() < idleCutoff : false,
      })),
      total: sessions.length,
    });
  }),
);

/** Signs a specific device out. Its refresh tokens die with the session. */
sessionsRouter.post(
  '/:id/revoke',
  requirePermission('session.revoke'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const session = await prisma.userSession.findUnique({
      where: { id: req.params.id },
      select: { userId: true, isActive: true },
    });
    if (!session) throw notFound('Session');
    await assertCanTouchUser(user, 'session.read', session.userId);
    if (!session.isActive) throw forbidden('That session has already ended');

    await endSession(req.params.id, 'REVOKED');
    await auditFromRequest(req, {
      action: 'session.revoke',
      entity: 'UserSession',
      entityId: req.params.id,
      meta: { targetUserId: session.userId },
    });

    res.json({ ok: true });
  }),
);

/** Manual sweep of idle sessions; also runs nightly from the scheduler. */
sessionsRouter.post(
  '/expire-idle',
  requirePermission('session.revoke'),
  handler(async (_req, res) => {
    res.json({ expired: await expireIdleSessions() });
  }),
);
