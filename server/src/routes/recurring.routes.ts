import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { handler, parse } from '../lib/http';
import { notFound } from '../lib/errors';
import { writeJson } from '../lib/json';
import { TASK_PRIORITY } from '../constants';
import { authenticate, currentUser, requirePermission } from '../auth/middleware';
import { auditFromRequest } from '../services/audit.service';
import { materialiseRecurringTasks } from '../jobs/recurring.job';

export const recurringRouter = Router();
recurringRouter.use(authenticate);

const recurringSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(4000).optional(),
  priority: z.enum(TASK_PRIORITY).default('MEDIUM'),
  assigneeId: z.string().optional(),
  teamId: z.string().optional(),
  departmentId: z.string().optional(),
  frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime().optional(),
  dueAfterDays: z.number().int().min(0).max(365).default(0),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).default('18:00'),
  estimatedHours: z.number().min(0).max(100).optional(),
  skipHolidays: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

recurringRouter.get(
  '/',
  requirePermission('task.recurring.manage'),
  handler(async (_req, res) => {
    const rows = await prisma.recurringTask.findMany({
      include: {
        assignee: { select: { id: true, firstName: true, lastName: true } },
        team: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        _count: { select: { generatedTasks: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: rows });
  }),
);

recurringRouter.post(
  '/',
  requirePermission('task.recurring.manage'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = parse(recurringSchema, req.body);

    const created = await prisma.recurringTask.create({
      data: {
        ...body,
        daysOfWeek: writeJson(body.daysOfWeek ?? [1, 2, 3, 4, 5]),
        startDate: new Date(body.startDate),
        endDate: body.endDate ? new Date(body.endDate) : null,
        createdById: user.id,
      },
    });
    await auditFromRequest(req, {
      action: 'recurring.create',
      entity: 'RecurringTask',
      entityId: created.id,
    });
    res.status(201).json({ data: created });
  }),
);

recurringRouter.patch(
  '/:id',
  requirePermission('task.recurring.manage'),
  handler(async (req, res) => {
    const body = parse(recurringSchema.partial(), req.body);
    const existing = await prisma.recurringTask.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Recurring task');

    const { daysOfWeek, startDate, endDate, ...rest } = body;
    const data: Prisma.RecurringTaskUncheckedUpdateInput = { ...rest };
    if (daysOfWeek) data.daysOfWeek = writeJson(daysOfWeek);
    if (startDate) data.startDate = new Date(startDate);
    if (endDate !== undefined) data.endDate = endDate ? new Date(endDate) : null;

    const updated = await prisma.recurringTask.update({ where: { id: req.params.id }, data });
    res.json({ data: updated });
  }),
);

recurringRouter.delete(
  '/:id',
  requirePermission('task.recurring.manage'),
  handler(async (req, res) => {
    await prisma.recurringTask.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ ok: true });
  }),
);

/** Manual trigger — useful for testing the schedule without waiting a day. */
recurringRouter.post(
  '/run-now',
  requirePermission('task.recurring.manage'),
  handler(async (_req, res) => {
    res.json({ data: await materialiseRecurringTasks() });
  }),
);

// ---------------------------------------------------------------------------
// Task templates
// ---------------------------------------------------------------------------

export const templatesRouter = Router();
templatesRouter.use(authenticate);

templatesRouter.get(
  '/',
  handler(async (_req, res) => {
    res.json({ data: await prisma.taskTemplate.findMany({ orderBy: { name: 'asc' } }) });
  }),
);

templatesRouter.post(
  '/',
  requirePermission('task.template.manage'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = parse(
      z.object({
        name: z.string().min(2).max(80),
        title: z.string().min(3).max(200),
        description: z.string().max(4000).optional(),
        priority: z.enum(TASK_PRIORITY).default('MEDIUM'),
        estimatedHours: z.number().min(0).max(1000).optional(),
        checklist: z.array(z.string()).default([]),
        tags: z.array(z.string()).default([]),
      }),
      req.body,
    );

    const created = await prisma.taskTemplate.create({
      data: {
        ...body,
        checklist: writeJson(body.checklist),
        tags: writeJson(body.tags),
        createdById: user.id,
      },
    });
    res.status(201).json({ data: created });
  }),
);

templatesRouter.delete(
  '/:id',
  requirePermission('task.template.manage'),
  handler(async (req, res) => {
    await prisma.taskTemplate.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);
