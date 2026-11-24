import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { handler, paginated, parse, skipTake } from '../lib/http';
import { authenticate, currentUser, requirePermission } from '../auth/middleware';
import { visibleUserIds, requireScope } from '../auth/rbac';
import { notifyMany } from '../services/notification.service';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

const NOTIF_CACHE_TTL_MS = 3000;
const notifCache = new Map<string, { expiresAt: number; payload: unknown }>();

function getCachedNotif<T>(key: string): T | null {
  const entry = notifCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    notifCache.delete(key);
    return null;
  }
  return entry.payload as T;
}

function setCachedNotif(key: string, payload: unknown): void {
  if (notifCache.size >= 300) {
    const oldest = notifCache.keys().next().value;
    if (oldest) notifCache.delete(oldest);
  }
  notifCache.set(key, { expiresAt: Date.now() + NOTIF_CACHE_TTL_MS, payload });
}

function invalidateUserNotifCache(userId: string): void {
  for (const key of notifCache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      notifCache.delete(key);
    }
  }
}

notificationsRouter.get(
  '/',
  handler(async (req, res) => {
    const user = currentUser(req);
    const q = parse(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
        unreadOnly: z.coerce.boolean().default(false),
      }),
      req.query,
    );

    const cacheKey = `${user.id}:${q.page}:${q.pageSize}:${q.unreadOnly ? '1' : '0'}`;
    const cached = getCachedNotif(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const where = { userId: user.id, ...(q.unreadOnly ? { isRead: false } : {}) };
    const [rows, total, unread] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q.page, q.pageSize),
        select: {
          id: true,
          type: true,
          title: true,
          body: true,
          link: true,
          isRead: true,
          readAt: true,
          createdAt: true,
        },
      }),
      prisma.notification.count({ where }),
      q.unreadOnly ? prisma.notification.count({ where: { userId: user.id, isRead: false } }) : Promise.resolve(-1),
    ]);

    const payload = {
      ...paginated(rows, total, q.page, q.pageSize),
      unread: unread >= 0 ? unread : total,
    };

    setCachedNotif(cacheKey, payload);
    res.json(payload);
  }),
);

notificationsRouter.get(
  '/unread-count',
  handler(async (req, res) => {
    const user = currentUser(req);
    const cacheKey = `${user.id}:unread`;
    const cached = getCachedNotif<{ count: number }>(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }
    const count = await prisma.notification.count({ where: { userId: user.id, isRead: false } });
    const payload = { count };
    setCachedNotif(cacheKey, payload);
    res.json(payload);
  }),
);

notificationsRouter.post(
  '/:id/read',
  handler(async (req, res) => {
    const user = currentUser(req);
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: user.id },
      data: { isRead: true, readAt: new Date() },
    });
    invalidateUserNotifCache(user.id);
    res.json({ ok: true });
  }),
);

notificationsRouter.post(
  '/read-all',
  handler(async (req, res) => {
    const user = currentUser(req);
    await prisma.notification.updateMany({
      where: { userId: user.id, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    invalidateUserNotifCache(user.id);
    res.json({ ok: true });
  }),
);

/** Company or team announcement. */
notificationsRouter.post(
  '/broadcast',
  requirePermission('notification.broadcast'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = parse(
      z.object({
        title: z.string().min(3).max(200),
        body: z.string().max(2000).optional(),
        departmentId: z.string().optional(),
        teamId: z.string().optional(),
        email: z.boolean().default(false),
      }),
      req.body,
    );

    const scope = requireScope(user, 'employee.read');
    const allowed = await visibleUserIds(user, scope);

    const recipients = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        ...(allowed ? { id: { in: allowed } } : {}),
        ...(body.departmentId ? { departmentId: body.departmentId } : {}),
        ...(body.teamId ? { teamMemberships: { some: { teamId: body.teamId } } } : {}),
      },
      select: { id: true },
    });

    await notifyMany(
      recipients.map((r) => r.id),
      { type: 'ANNOUNCEMENT', title: body.title, body: body.body, email: body.email },
    );

    for (const r of recipients) {
      invalidateUserNotifCache(r.id);
    }

    res.json({ ok: true, sent: recipients.length });
  }),
);