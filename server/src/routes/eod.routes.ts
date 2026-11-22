import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { handler, paginated, parse, skipTake } from '../lib/http';
import { DATE_RE } from '../lib/dates';
import { notFound } from '../lib/errors';
import { authenticate, currentUser, requirePermission } from '../auth/middleware';
import { assertCanTouchUser, userScopeFilter } from '../auth/rbac';
import { EOD_INCLUDE, ensureEodForUser, getOrCreateTodayEod, reviewEod, submitEod } from '../services/eod.service';

export const eodRouter = Router();
eodRouter.use(authenticate);

const dateParam = z.string().regex(DATE_RE, 'Expected YYYY-MM-DD');

/** Pre-filled EOD for the signed-in employee — tasks are pulled automatically. */
eodRouter.get(
  '/today',
  handler(async (req, res) => {
    const user = currentUser(req);
    res.json({ data: await getOrCreateTodayEod(user.id) });
  }),
);

eodRouter.get(
  '/history',
  handler(async (req, res) => {
    const user = currentUser(req);
    const q = parse(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
        userId: z.string().optional(),
        from: dateParam.optional(),
        to: dateParam.optional(),
        status: z.string().optional(),
      }),
      req.query,
    );

    const scopeWhere = q.userId
      ? (await assertCanTouchUser(user, 'eod.read', q.userId), { userId: q.userId })
      : await userScopeFilter(user, 'eod.read');

    const where = {
      ...scopeWhere,
      ...(q.from || q.to ? { date: { gte: q.from ?? '0000-01-01', lte: q.to ?? '9999-12-31' } } : {}),
      ...(q.status ? { status: { in: q.status.split(',') } } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.eod.findMany({
        where,
        include: EOD_INCLUDE,
        orderBy: [{ date: 'desc' }],
        ...skipTake(q.page, q.pageSize),
      }),
      prisma.eod.count({ where }),
    ]);

    res.json(paginated(rows, total, q.page, q.pageSize));
  }),
);

/** Admin review queue: submissions still waiting on a decision. */
eodRouter.get(
  '/review-queue',
  requirePermission('eod.review'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const scopeWhere = await userScopeFilter(user, 'eod.read');
    const rows = await prisma.eod.findMany({
      where: { ...scopeWhere, status: 'SUBMITTED' },
      include: EOD_INCLUDE,
      orderBy: [{ date: 'desc' }],
      take: 100,
    });
    res.json({ data: rows });
  }),
);

eodRouter.get(
  '/:date',
  handler(async (req, res) => {
    const user = currentUser(req);
    const date = parse(dateParam, req.params.date);
    const targetUserId = typeof req.query.userId === 'string' ? req.query.userId : user.id;
    if (targetUserId !== user.id) await assertCanTouchUser(user, 'eod.read', targetUserId);

    const eod = await ensureEodForUser(targetUserId, date);
    if (!eod) throw notFound('EOD');
    res.json({ data: eod });
  }),
);

const submitSchema = z.object({
  workSummary: z.string().min(1, 'Write a short summary of the day').max(4000),
  pendingReason: z.string().max(2000).optional(),
  blockers: z.string().max(2000).optional(),
  additionalWork: z.string().max(2000).optional(),
  nextDayPlan: z.string().max(2000).optional(),
  totalHours: z.number().min(0).max(24).optional(),
  items: z
    .array(
      z.object({
        id: z.string(),
        category: z.enum(['COMPLETED', 'PENDING', 'BLOCKED', 'ADDITIONAL']).optional(),
        hoursSpent: z.number().min(0).max(24).optional(),
        note: z.string().max(1000).optional(),
        blockerReason: z.string().max(1000).optional(),
        pendingReason: z.string().max(1000).optional(),
      }),
    )
    .optional(),
  extraItems: z
    .array(
      z.object({
        title: z.string().min(1).max(200),
        note: z.string().max(1000).optional(),
        hoursSpent: z.number().min(0).max(24).optional(),
        category: z.enum(['COMPLETED', 'PENDING', 'BLOCKED', 'ADDITIONAL']).optional(),
        pendingReason: z.string().max(1000).optional(),
      }),
    )
    .optional(),
});

eodRouter.post(
  '/:date/submit',
  handler(async (req, res) => {
    const user = currentUser(req);
    const date = parse(dateParam, req.params.date);
    const body = parse(submitSchema, req.body);
    res.json({ data: await submitEod(user.id, date, body) });
  }),
);

eodRouter.post(
  '/:id/review',
  requirePermission('eod.review'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = parse(
      z.object({
        action: z.enum(['APPROVE', 'REQUEST_CHANGES']),
        notes: z.string().max(2000).optional(),
      }),
      req.body,
    );

    const eod = await prisma.eod.findUnique({ where: { id: req.params.id }, select: { userId: true } });
    if (!eod) throw notFound('EOD');
    await assertCanTouchUser(user, 'eod.read', eod.userId);

    res.json({ data: await reviewEod(req.params.id, user.id, body.action, body.notes) });
  }),
);
