import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { handler, paginated, parse, skipTake } from '../lib/http';
import { authenticate, currentUser, requirePermission } from '../auth/middleware';
import { visibleUserIds, requireScope } from '../auth/rbac';
import { notifyMany } from '../services/notification.service';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

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

    const where = { userId: user.id, ...(q.unreadOnly ? { isRead: false } : {}) };
    const [rows, total, unread] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...skipTake(q.page, q.pageSize),
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId: user.id, isRead: false } }),
    ]);

    res.json({ ...paginated(rows, total, q.page, q.pageSize), unread });
  }),
);

notificationsRouter.get(
  '/unread-count',
  handler(async (req, res) => {
    const user = currentUser(req);
    res.json({ count: await prisma.notification.count({ where: { userId: user.id, isRead: false } }) });
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

    res.json({ ok: true, sent: recipients.length });
  }),
);
