import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { handler, paginated, parse, skipTake } from '../lib/http';
import { DATE_RE } from '../lib/dates';
import { notFound } from '../lib/errors';
import { authenticate, currentUser, requirePermission } from '../auth/middleware';
import { assertCanTouchUser, userScopeFilter } from '../auth/rbac';
import {
  applyForLeave,
  balanceSummary,
  cancelLeave,
  countLeaveDays,
  decideLeave,
} from '../services/leave.service';
import { auditFromRequest } from '../services/audit.service';

export const leaveRouter = Router();
leaveRouter.use(authenticate);

leaveRouter.get(
  '/types',
  handler(async (_req, res) => {
    res.json({ data: await prisma.leaveType.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }) });
  }),
);

leaveRouter.get(
  '/balance',
  handler(async (req, res) => {
    const user = currentUser(req);
    const q = parse(
      z.object({
        userId: z.string().optional(),
        year: z.coerce.number().int().min(2000).max(2100).default(new Date().getUTCFullYear()),
      }),
      req.query,
    );
    const targetId = q.userId ?? user.id;
    if (targetId !== user.id) await assertCanTouchUser(user, 'leave.read', targetId);
    res.json({ data: await balanceSummary(targetId, q.year) });
  }),
);

leaveRouter.get(
  '/holidays',
  handler(async (req, res) => {
    const q = parse(
      z.object({ year: z.coerce.number().int().optional() }),
      req.query,
    );
    const year = q.year ?? new Date().getUTCFullYear();
    res.json({
      data: await prisma.holiday.findMany({
        where: { date: { gte: `${year}-01-01`, lte: `${year}-12-31` } },
        orderBy: { date: 'asc' },
      }),
    });
  }),
);

/** Preview how many working days a range costs before submitting. */
leaveRouter.get(
  '/estimate',
  handler(async (req, res) => {
    const user = currentUser(req);
    const q = parse(
      z.object({
        startDate: z.string().regex(DATE_RE),
        endDate: z.string().regex(DATE_RE),
        isHalfDay: z.coerce.boolean().default(false),
      }),
      req.query,
    );
    res.json({ days: await countLeaveDays(user.id, q.startDate, q.endDate, q.isHalfDay) });
  }),
);

leaveRouter.get(
  '/',
  handler(async (req, res) => {
    const user = currentUser(req);
    const q = parse(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
        status: z.string().optional(),
        userId: z.string().optional(),
        from: z.string().regex(DATE_RE).optional(),
        to: z.string().regex(DATE_RE).optional(),
      }),
      req.query,
    );

    const scopeWhere = q.userId
      ? (await assertCanTouchUser(user, 'leave.read', q.userId), { userId: q.userId })
      : await userScopeFilter(user, 'leave.read');

    const where = {
      ...scopeWhere,
      ...(q.status ? { status: { in: q.status.split(',') } } : {}),
      ...(q.from ? { endDate: { gte: q.from } } : {}),
      ...(q.to ? { startDate: { lte: q.to } } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.leaveRequest.findMany({
        where,
        include: {
          leaveType: true,
          user: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
          approver: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: [{ createdAt: 'desc' }],
        ...skipTake(q.page, q.pageSize),
      }),
      prisma.leaveRequest.count({ where }),
    ]);

    res.json(paginated(rows, total, q.page, q.pageSize));
  }),
);

leaveRouter.post(
  '/',
  requirePermission('leave.apply'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = parse(
      z.object({
        leaveTypeId: z.string().min(1),
        startDate: z.string().regex(DATE_RE),
        endDate: z.string().regex(DATE_RE),
        reason: z.string().min(5).max(1000),
        isHalfDay: z.boolean().optional(),
        halfDaySlot: z.enum(['FIRST_HALF', 'SECOND_HALF']).optional(),
        contactDuringLeave: z.string().max(120).optional(),
      }),
      req.body,
    );

    const request = await applyForLeave(user.id, body);
    await auditFromRequest(req, {
      action: 'leave.apply',
      entity: 'LeaveRequest',
      entityId: request.id,
      meta: { from: body.startDate, to: body.endDate },
    });
    res.status(201).json({ data: request });
  }),
);

leaveRouter.post(
  '/batch-decide',
  requirePermission('leave.approve'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = parse(
      z.object({
        ids: z.array(z.string()).min(1),
        action: z.enum(['APPROVE', 'REJECT']),
        note: z.string().max(1000).optional(),
      }),
      req.body,
    );

    const results = [];
    for (const id of body.ids) {
      try {
        const request = await prisma.leaveRequest.findUnique({ where: { id } });
        if (!request) continue;
        await assertCanTouchUser(user, 'leave.read', request.userId);
        const updated = await decideLeave(id, user.id, body.action, body.note);
        await auditFromRequest(req, {
          action: `leave.${body.action.toLowerCase()}`,
          entity: 'LeaveRequest',
          entityId: updated.id,
        });
        results.push(updated);
      } catch (e) {
        // continue with other requests
      }
    }
    res.json({ data: results, count: results.length });
  }),
);

leaveRouter.post(
  '/:id/decide',
  requirePermission('leave.approve'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = parse(
      z.object({ action: z.enum(['APPROVE', 'REJECT']), note: z.string().max(1000).optional() }),
      req.body,
    );

    const request = await prisma.leaveRequest.findUnique({ where: { id: req.params.id } });
    if (!request) throw notFound('Leave request');
    await assertCanTouchUser(user, 'leave.read', request.userId);

    const updated = await decideLeave(req.params.id, user.id, body.action, body.note);
    await auditFromRequest(req, {
      action: `leave.${body.action.toLowerCase()}`,
      entity: 'LeaveRequest',
      entityId: updated.id,
    });
    res.json({ data: updated });
  }),
);

leaveRouter.post(
  '/:id/cancel',
  handler(async (req, res) => {
    const user = currentUser(req);
    res.json({ data: await cancelLeave(req.params.id, user.id) });
  }),
);
