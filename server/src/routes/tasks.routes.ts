import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { handler, paginated, parse, skipTake } from '../lib/http';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { writeJson } from '../lib/json';
import {
  TASK_PRIORITY,
  TASK_STATUS,
  TASK_STATUS_FILTERS,
  CLOSED_TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from '../constants';
import { authenticate, currentUser, requirePermission } from '../auth/middleware';
import { can, visibleUserIds, requireScope } from '../auth/rbac';
import {
  TASK_INCLUDE,
  assertCanUpdateTask,
  assertTransition,
  getTaskForUser,
  logActivity,
  nextTaskCode,
  notifyAssignment,
  refreshOverdue,
  statusSideEffects,
  taskScopeFilter,
  toTaskDto,
} from '../services/task.service';
import { notify, notifyMany, supervisorsOf } from '../services/notification.service';
import { auditFromRequest } from '../services/audit.service';
import { persistUpload, uploadTo, deleteStoredFile } from '../services/storage.service';
import { ensureSodForUser } from '../services/sod.service';
import { getSettings } from '../services/settings.service';
import { todayInTz } from '../lib/dates';

export const tasksRouter = Router();
tasksRouter.use(authenticate);

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  status: z.string().optional(),
  priority: z.string().optional(),
  assigneeId: z.string().optional(),
  departmentId: z.string().optional(),
  teamId: z.string().optional(),
  search: z.string().optional(),
  dueFrom: z.string().optional(),
  dueTo: z.string().optional(),
  createdById: z.string().optional(),
  sort: z.enum(['dueDate', 'createdAt', 'priority', 'status', 'progress']).default('dueDate'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

function buildStatusFilter(raw?: string): Prisma.TaskWhereInput {
  if (!raw) return {};
  const values = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (!values.length) return {};

  const wantsOverdue = values.includes('OVERDUE');
  const realStatuses = values.filter((v) => v !== 'OVERDUE' && TASK_STATUS.includes(v as TaskStatus));

  if (wantsOverdue && !realStatuses.length) {
    return { isOverdue: true, status: { notIn: CLOSED_TASK_STATUSES } };
  }
  if (wantsOverdue) {
    return {
      OR: [{ status: { in: realStatuses } }, { isOverdue: true, status: { notIn: CLOSED_TASK_STATUSES } }],
    };
  }
  return { status: { in: realStatuses } };
}

tasksRouter.get(
  '/',
  handler(async (req, res) => {
    const user = currentUser(req);
    const q = parse(listQuery, req.query);
    const scopeWhere = await taskScopeFilter(user);

    const where: Prisma.TaskWhereInput = {
      AND: [
        scopeWhere,
        buildStatusFilter(q.status),
        q.priority ? { priority: { in: q.priority.split(',') } } : {},
        q.assigneeId ? { assigneeId: q.assigneeId } : {},
        q.departmentId ? { departmentId: q.departmentId } : {},
        q.teamId ? { teamId: q.teamId } : {},
        q.createdById ? { createdById: q.createdById } : {},
        q.dueFrom ? { dueDate: { gte: new Date(`${q.dueFrom}T00:00:00.000Z`) } } : {},
        q.dueTo ? { dueDate: { lte: new Date(`${q.dueTo}T23:59:59.999Z`) } } : {},
        q.search
          ? {
              OR: [
                { title: { contains: q.search } },
                { description: { contains: q.search } },
                { code: { contains: q.search } },
              ],
            }
          : {},
      ],
    };

    const orderBy: Prisma.TaskOrderByWithRelationInput =
      q.sort === 'priority' ? { priority: q.order } : { [q.sort]: q.order };

    const [rows, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: TASK_INCLUDE,
        orderBy: [orderBy, { createdAt: 'desc' }],
        ...skipTake(q.page, q.pageSize),
      }),
      prisma.task.count({ where }),
    ]);

    res.json(paginated(rows.map(toTaskDto), total, q.page, q.pageSize));
  }),
);

/** Everything waiting on the current user's approval. */
tasksRouter.get(
  '/review-queue',
  handler(async (req, res) => {
    const user = currentUser(req);
    if (!can(user, 'task.review')) throw forbidden('Missing permission: task.review');
    const scopeWhere = await taskScopeFilter(user);

    const rows = await prisma.task.findMany({
      where: { AND: [scopeWhere, { status: 'SUBMITTED_FOR_REVIEW' }] },
      include: TASK_INCLUDE,
      orderBy: [{ submittedAt: 'asc' }],
      take: 100,
    });
    res.json({ data: rows.map(toTaskDto) });
  }),
);

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

const safeDateCoerce = z
  .union([z.string(), z.date()])
  .optional()
  .nullable()
  .transform((val) => {
    if (!val) return undefined;
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (!trimmed) return undefined;
      const ddmmyyyy = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(trimmed);
      if (ddmmyyyy) {
        return new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}T00:00:00.000Z`).toISOString();
      }
      const yyyymmdd = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(trimmed);
      if (yyyymmdd) {
        return new Date(`${yyyymmdd[1]}-${yyyymmdd[2]}-${yyyymmdd[3]}T00:00:00.000Z`).toISOString();
      }
      const parsed = new Date(trimmed);
      if (!isNaN(parsed.getTime())) return parsed.toISOString();
      return undefined;
    }
    return val instanceof Date && !isNaN(val.getTime()) ? val.toISOString() : undefined;
  });

const safeNumberCoerce = z
  .union([z.number(), z.string()])
  .optional()
  .nullable()
  .transform((val) => {
    if (val === undefined || val === null || val === '') return undefined;
    const num = Number(val);
    return isNaN(num) ? undefined : num;
  });

const safeStringCoerce = z
  .string()
  .optional()
  .nullable()
  .transform((val) => (val && val.trim() ? val.trim() : undefined));

const createSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional().nullable(),
  priority: z.enum(TASK_PRIORITY).default('MEDIUM'),
  assigneeId: safeStringCoerce,
  assignToTeamId: safeStringCoerce,
  assignToDepartmentId: safeStringCoerce,
  assigneeIds: z.array(z.string()).optional(),
  departmentId: safeStringCoerce,
  teamId: safeStringCoerce,
  startDate: safeDateCoerce,
  dueDate: safeDateCoerce,
  estimatedHours: safeNumberCoerce,
  tags: z.array(z.string()).optional(),
  parentTaskId: safeStringCoerce,
  templateId: safeStringCoerce,
});

async function resolveAssignees(input: z.infer<typeof createSchema>): Promise<string[]> {
  if (input.assigneeIds?.length) return input.assigneeIds;
  if (input.assigneeId) return [input.assigneeId];

  if (input.assignToTeamId) {
    const members = await prisma.teamMember.findMany({
      where: { teamId: input.assignToTeamId, user: { status: 'ACTIVE' } },
      select: { userId: true },
    });
    if (!members.length) throw badRequest('That team has no active members');
    return members.map((m) => m.userId);
  }

  if (input.assignToDepartmentId) {
    const people = await prisma.user.findMany({
      where: { departmentId: input.assignToDepartmentId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!people.length) throw badRequest('That department has no active employees');
    return people.map((p) => p.id);
  }

  return [];
}

tasksRouter.post(
  '/',
  requirePermission('task.create'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = parse(createSchema, req.body);

    const payload = { ...body };
    if (body.templateId) {
      const template = await prisma.taskTemplate.findUnique({ where: { id: body.templateId } });
      if (!template) throw notFound('Task template');
      payload.description = body.description ?? template.description ?? undefined;
      payload.estimatedHours = body.estimatedHours ?? template.estimatedHours ?? undefined;
      if (!req.body?.priority && TASK_PRIORITY.includes(template.priority as TaskPriority)) {
        payload.priority = template.priority as TaskPriority;
      }
    }

    const assignees = await resolveAssignees(payload);
    if (!assignees.length) throw badRequest('Select at least one employee, team or department');

    // A task creator may only assign inside their own scope.
    const scope = requireScope(user, 'task.read');
    const allowed = await visibleUserIds(user, scope);
    if (allowed !== null) {
      const outside = assignees.filter((id) => !allowed.includes(id));
      if (outside.length) throw forbidden('Some selected employees are outside your access scope');
    }

    const settings = await getSettings();
    const created = [];

    for (const assigneeId of assignees) {
      const assignee = await prisma.user.findUnique({
        where: { id: assigneeId },
        select: { id: true, departmentId: true },
      });
      if (!assignee) continue;

      const task = await prisma.task.create({
        data: {
          code: await nextTaskCode(),
          title: payload.title,
          description: payload.description ?? null,
          priority: payload.priority,
          status: settings.autoAcceptTasks ? 'ACCEPTED' : 'ASSIGNED',
          acceptedAt: settings.autoAcceptTasks ? new Date() : null,
          assigneeId,
          createdById: user.id,
          departmentId: payload.departmentId ?? assignee.departmentId,
          teamId: payload.teamId ?? payload.assignToTeamId ?? null,
          startDate: payload.startDate ? new Date(payload.startDate) : null,
          dueDate: payload.dueDate ? new Date(payload.dueDate) : null,
          estimatedHours: payload.estimatedHours ?? null,
          tags: writeJson(payload.tags ?? []),
          parentTaskId: payload.parentTaskId ?? null,
        },
        include: TASK_INCLUDE,
      });

      await logActivity({
        taskId: task.id,
        actorId: user.id,
        type: 'CREATED',
        toValue: task.status,
        note: payload.assignToTeamId || payload.assignToDepartmentId ? 'Bulk assignment' : null,
      });
      await notifyAssignment(task);

      // A task assigned during the working day joins today's plan immediately —
      // the employee does not wait for tomorrow's SOD generation.
      const today = todayInTz(settings.timezone);
      await ensureSodForUser(assigneeId, today).catch(() => undefined);

      created.push(toTaskDto(task));
    }

    await auditFromRequest(req, {
      action: 'task.create',
      entity: 'Task',
      entityId: created[0]?.id,
      meta: { count: created.length, title: payload.title },
    });

    res.status(201).json({ data: created, count: created.length });
  }),
);

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

tasksRouter.get(
  '/:id',
  handler(async (req, res) => {
    const user = currentUser(req);
    const task = await getTaskForUser(user, req.params.id);
    const isAdminPortal = user.portal === 'ADMIN';

    const [comments, attachments, activities, subtasks] = await Promise.all([
      prisma.taskComment.findMany({
        where: { taskId: task.id, ...(isAdminPortal ? {} : { isInternal: false }) },
        include: { author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.taskAttachment.findMany({
        where: { taskId: task.id },
        include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.taskActivity.findMany({
        where: { taskId: task.id },
        include: { actor: { select: { id: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.task.findMany({
        where: { parentTaskId: task.id },
        include: TASK_INCLUDE,
      }),
    ]);

    res.json({
      data: {
        ...toTaskDto(task),
        comments,
        attachments,
        activities,
        subtasks: subtasks.map(toTaskDto),
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  priority: z.enum(TASK_PRIORITY).optional(),
  startDate: safeDateCoerce,
  dueDate: safeDateCoerce,
  estimatedHours: safeNumberCoerce,
  departmentId: safeStringCoerce,
  teamId: safeStringCoerce,
  tags: z.array(z.string()).optional(),
});

tasksRouter.patch(
  '/:id',
  handler(async (req, res) => {
    const user = currentUser(req);
    const task = await getTaskForUser(user, req.params.id);
    await assertCanUpdateTask(user, task);
    const body = parse(updateSchema, req.body);

    const data: Prisma.TaskUpdateInput = {};
    if (body.title !== undefined) data.title = body.title;
    if (body.description !== undefined) data.description = body.description;
    if (body.priority !== undefined) data.priority = body.priority;
    if (body.startDate !== undefined) data.startDate = body.startDate ? new Date(body.startDate) : null;
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    if (body.estimatedHours !== undefined) data.estimatedHours = body.estimatedHours;
    if (body.tags !== undefined) data.tags = writeJson(body.tags);
    if (body.departmentId !== undefined) {
      data.department = body.departmentId ? { connect: { id: body.departmentId } } : { disconnect: true };
    }
    if (body.teamId !== undefined) {
      data.team = body.teamId ? { connect: { id: body.teamId } } : { disconnect: true };
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data,
      include: TASK_INCLUDE,
    });
    await refreshOverdue(task.id);
    await logActivity({
      taskId: task.id,
      actorId: user.id,
      type: 'UPDATED',
      note: Object.keys(body).join(', '),
    });
    await auditFromRequest(req, { action: 'task.update', entity: 'Task', entityId: task.id, meta: body });

    res.json({ data: toTaskDto(updated) });
  }),
);

// ---------------------------------------------------------------------------
// Status / progress
// ---------------------------------------------------------------------------

const statusSchema = z.object({
  status: z.enum(TASK_STATUS),
  note: z.string().max(1000).optional(),
  blockedReason: z.string().max(1000).optional(),
});

tasksRouter.post(
  '/:id/status',
  handler(async (req, res) => {
    const user = currentUser(req);
    const task = await getTaskForUser(user, req.params.id);
    await assertCanUpdateTask(user, task);
    const body = parse(statusSchema, req.body);

    let target: TaskStatus = body.status;

    // Employees without review rights cannot self-approve: "mark completed"
    // becomes "submit for review", which is the workflow in section 9.
    if (target === 'COMPLETED' && !can(user, 'task.review')) {
      target = 'SUBMITTED_FOR_REVIEW';
    }
    if (target === 'BLOCKED' && !body.blockedReason) {
      throw badRequest('A reason is required when blocking a task');
    }

    assertTransition(task.status, target);

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        status: target,
        ...statusSideEffects(target),
        ...(target === 'BLOCKED' ? { blockedReason: body.blockedReason } : {}),
      },
      include: TASK_INCLUDE,
    });

    await logActivity({
      taskId: task.id,
      actorId: user.id,
      type: 'STATUS_CHANGED',
      fromValue: task.status,
      toValue: target,
      note: body.note ?? body.blockedReason ?? null,
    });

    if (target === 'SUBMITTED_FOR_REVIEW') {
      const reviewers = new Set([task.createdById, ...(await supervisorsOf(user.id))]);
      reviewers.delete(user.id);
      await notifyMany([...reviewers], {
        type: 'TASK_REVIEW_REQUIRED',
        title: `Review requested: ${task.title}`,
        body: `${task.code} submitted by ${user.firstName} ${user.lastName}`,
        link: `/admin/tasks/${task.id}`,
        email: true,
      });
    }

    if (target === 'BLOCKED') {
      const watchers = new Set([task.createdById, ...(await supervisorsOf(user.id))]);
      watchers.delete(user.id);
      await notifyMany([...watchers], {
        type: 'TASK_BLOCKED',
        title: `Task blocked: ${task.title}`,
        body: body.blockedReason,
        link: `/admin/tasks/${task.id}`,
        severity: 'WARNING',
        email: true,
      });
    }

    await auditFromRequest(req, {
      action: 'task.status',
      entity: 'Task',
      entityId: task.id,
      meta: { from: task.status, to: target },
    });

    res.json({ data: toTaskDto(updated), appliedStatus: target });
  }),
);

tasksRouter.post(
  '/:id/progress',
  handler(async (req, res) => {
    const user = currentUser(req);
    const task = await getTaskForUser(user, req.params.id);
    await assertCanUpdateTask(user, task);
    const body = parse(
      z.object({
        progress: z.number().int().min(0).max(100),
        hoursSpent: z.number().min(0).max(24).optional(),
        note: z.string().max(1000).optional(),
      }),
      req.body,
    );

    // Reporting progress on an untouched task implicitly starts it.
    const shouldStart =
      body.progress > 0 && (task.status === 'ASSIGNED' || task.status === 'ACCEPTED');

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        progress: body.progress,
        ...(body.hoursSpent ? { actualHours: { increment: body.hoursSpent } } : {}),
        ...(shouldStart ? { status: 'IN_PROGRESS', ...statusSideEffects('IN_PROGRESS') } : {}),
      },
      include: TASK_INCLUDE,
    });

    await logActivity({
      taskId: task.id,
      actorId: user.id,
      type: 'PROGRESS',
      fromValue: String(task.progress),
      toValue: String(body.progress),
      note: body.note ?? null,
    });

    res.json({ data: toTaskDto(updated) });
  }),
);

// ---------------------------------------------------------------------------
// Reassign / review / cancel
// ---------------------------------------------------------------------------

tasksRouter.post(
  '/:id/reassign',
  requirePermission('task.reassign'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const task = await getTaskForUser(user, req.params.id);
    const body = parse(
      z.object({ assigneeId: z.string().min(1), note: z.string().max(1000).optional() }),
      req.body,
    );

    const scope = requireScope(user, 'task.read');
    const allowed = await visibleUserIds(user, scope);
    if (allowed !== null && !allowed.includes(body.assigneeId)) {
      throw forbidden('That employee is outside your access scope');
    }

    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        assigneeId: body.assigneeId,
        status: CLOSED_TASK_STATUSES.includes(task.status as TaskStatus) ? task.status : 'ASSIGNED',
        acceptedAt: null,
      },
      include: TASK_INCLUDE,
    });

    await logActivity({
      taskId: task.id,
      actorId: user.id,
      type: 'ASSIGNED',
      fromValue: task.assigneeId,
      toValue: body.assigneeId,
      note: body.note ?? null,
    });
    await notifyAssignment(updated, true);
    if (task.assigneeId && task.assigneeId !== body.assigneeId) {
      await notify({
        userId: task.assigneeId,
        type: 'TASK_REASSIGNED',
        title: `Task moved to someone else: ${task.title}`,
        body: task.code,
        link: `/tasks/${task.id}`,
      });
    }

    const settings = await getSettings();
    await ensureSodForUser(body.assigneeId, todayInTz(settings.timezone)).catch(() => undefined);
    await auditFromRequest(req, { action: 'task.reassign', entity: 'Task', entityId: task.id, meta: body });

    res.json({ data: toTaskDto(updated) });
  }),
);

tasksRouter.post(
  '/:id/review',
  requirePermission('task.review'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const task = await getTaskForUser(user, req.params.id);
    const body = parse(
      z.object({
        action: z.enum(['APPROVE', 'REQUEST_CHANGES']),
        notes: z.string().max(2000).optional(),
      }),
      req.body,
    );

    if (task.status !== 'SUBMITTED_FOR_REVIEW') {
      throw badRequest('Only tasks submitted for review can be reviewed');
    }
    if (body.action === 'REQUEST_CHANGES' && !body.notes) {
      throw badRequest('Tell the employee what needs to change');
    }

    const target: TaskStatus = body.action === 'APPROVE' ? 'COMPLETED' : 'CHANGES_REQUIRED';
    const updated = await prisma.task.update({
      where: { id: task.id },
      data: {
        status: target,
        ...statusSideEffects(target),
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNotes: body.notes ?? null,
        reviewRounds: { increment: 1 },
        ...(body.action === 'REQUEST_CHANGES' ? { progress: Math.min(task.progress, 90) } : {}),
      },
      include: TASK_INCLUDE,
    });

    await logActivity({
      taskId: task.id,
      actorId: user.id,
      type: 'REVIEW',
      fromValue: task.status,
      toValue: target,
      note: body.notes ?? null,
    });

    if (task.assigneeId) {
      await notify({
        userId: task.assigneeId,
        type: body.action === 'APPROVE' ? 'TASK_APPROVED' : 'TASK_CHANGES_REQUIRED',
        title:
          body.action === 'APPROVE'
            ? `Task approved: ${task.title}`
            : `Changes required: ${task.title}`,
        body: body.notes,
        link: `/tasks/${task.id}`,
        severity: body.action === 'APPROVE' ? 'INFO' : 'WARNING',
        email: true,
      });
    }

    await auditFromRequest(req, {
      action: 'task.review',
      entity: 'Task',
      entityId: task.id,
      meta: { action: body.action },
    });

    res.json({ data: toTaskDto(updated) });
  }),
);

tasksRouter.delete(
  '/:id',
  requirePermission('task.delete'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const task = await getTaskForUser(user, req.params.id);

    // Cancel rather than destroy — history and reports must stay intact.
    const updated = await prisma.task.update({
      where: { id: task.id },
      data: { status: 'CANCELLED', ...statusSideEffects('CANCELLED') },
      include: TASK_INCLUDE,
    });
    await logActivity({ taskId: task.id, actorId: user.id, type: 'STATUS_CHANGED', fromValue: task.status, toValue: 'CANCELLED' });
    await auditFromRequest(req, { action: 'task.cancel', entity: 'Task', entityId: task.id });

    res.json({ data: toTaskDto(updated) });
  }),
);

// ---------------------------------------------------------------------------
// Comments & attachments
// ---------------------------------------------------------------------------

tasksRouter.post(
  '/:id/comments',
  handler(async (req, res) => {
    const user = currentUser(req);
    const task = await getTaskForUser(user, req.params.id);
    const body = parse(
      z.object({ body: z.string().min(1).max(4000), isInternal: z.boolean().default(false) }),
      req.body,
    );

    if (body.isInternal && user.portal !== 'ADMIN') {
      throw forbidden('Only admin-portal users can add internal notes');
    }

    const comment = await prisma.taskComment.create({
      data: { taskId: task.id, authorId: user.id, body: body.body, isInternal: body.isInternal },
      include: { author: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
    });
    await logActivity({ taskId: task.id, actorId: user.id, type: 'COMMENT' });

    const recipients = new Set<string>([task.createdById]);
    if (task.assigneeId) recipients.add(task.assigneeId);
    recipients.delete(user.id);
    if (!body.isInternal) {
      await notifyMany([...recipients], {
        type: 'TASK_COMMENT',
        title: `New comment on ${task.code}`,
        body: `${user.firstName}: ${body.body.slice(0, 120)}`,
        link: `/tasks/${task.id}`,
      });
    }

    res.status(201).json({ data: comment });
  }),
);

tasksRouter.post(
  '/:id/attachments',
  ...uploadTo('tasks'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const task = await getTaskForUser(user, req.params.id);
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (!files.length) throw badRequest('No files uploaded');

    const saved = await Promise.all(
      files.map(async (file) =>
        prisma.taskAttachment.create({
          data: {
            taskId: task.id,
            uploadedById: user.id,
            storageKey: await persistUpload('tasks', file),
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
          },
        }),
      ),
    );
    await logActivity({
      taskId: task.id,
      actorId: user.id,
      type: 'ATTACHMENT',
      note: files.map((f) => f.originalname).join(', '),
    });

    res.status(201).json({ data: saved });
  }),
);

tasksRouter.delete(
  '/:id/attachments/:attachmentId',
  handler(async (req, res) => {
    const user = currentUser(req);
    await getTaskForUser(user, req.params.id);
    const attachment = await prisma.taskAttachment.findUnique({
      where: { id: req.params.attachmentId },
    });
    if (!attachment || attachment.taskId !== req.params.id) throw notFound('Attachment');
    if (attachment.uploadedById !== user.id && user.portal !== 'ADMIN') {
      throw forbidden('You can only remove your own attachments');
    }

    await prisma.taskAttachment.delete({ where: { id: attachment.id } });
    await deleteStoredFile(attachment.storageKey);
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Metadata for filter UIs
// ---------------------------------------------------------------------------

tasksRouter.get(
  '/meta/options',
  handler(async (_req, res) => {
    res.json({
      statuses: TASK_STATUS_FILTERS,
      priorities: TASK_PRIORITY,
    });
  }),
);
