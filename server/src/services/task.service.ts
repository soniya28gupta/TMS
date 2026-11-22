import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import {
  CLOSED_TASK_STATUSES,
  OPEN_TASK_STATUSES,
  TASK_TRANSITIONS,
  type TaskStatus,
} from '../constants';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors';
import { readStringArray } from '../lib/json';
import { requireScope, visibleUserIds, type AuthUser } from '../auth/rbac';
import { notify } from './notification.service';

export const TASK_INCLUDE = {
  assignee: {
    select: { id: true, firstName: true, lastName: true, employeeCode: true, avatarUrl: true },
  },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  reviewedBy: { select: { id: true, firstName: true, lastName: true } },
  department: { select: { id: true, name: true } },
  team: { select: { id: true, name: true } },
  _count: { select: { comments: true, attachments: true, subtasks: true } },
} satisfies Prisma.TaskInclude;

type TaskWithIncludes = Prisma.TaskGetPayload<{ include: typeof TASK_INCLUDE }>;

export function toTaskDto(task: TaskWithIncludes) {
  return {
    id: task.id,
    code: task.code,
    title: task.title,
    description: task.description,
    priority: task.priority,
    status: task.status,
    /** What the UI badges: overdue wins over the workflow state visually. */
    displayStatus: task.isOverdue && !CLOSED_TASK_STATUSES.includes(task.status as TaskStatus)
      ? 'OVERDUE'
      : task.status,
    isOverdue: task.isOverdue,
    progress: task.progress,
    estimatedHours: task.estimatedHours,
    actualHours: task.actualHours,
    startDate: task.startDate,
    dueDate: task.dueDate,
    acceptedAt: task.acceptedAt,
    startedAt: task.startedAt,
    submittedAt: task.submittedAt,
    completedAt: task.completedAt,
    blockedReason: task.blockedReason,
    blockedAt: task.blockedAt,
    reviewNotes: task.reviewNotes,
    reviewedAt: task.reviewedAt,
    reviewRounds: task.reviewRounds,
    tags: readStringArray(task.tags),
    assignee: task.assignee,
    createdBy: task.createdBy,
    reviewedBy: task.reviewedBy,
    department: task.department,
    team: task.team,
    parentTaskId: task.parentTaskId,
    recurringTaskId: task.recurringTaskId,
    counts: task._count,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
}

/** Sequential, human-friendly codes (TSK-000042) with a small retry window. */
export async function nextTaskCode(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await prisma.setting.findUnique({ where: { key: 'taskSequence' } });
    const next = Number(current?.value ?? '0') + 1;
    try {
      await prisma.setting.upsert({
        where: { key: 'taskSequence' },
        create: { key: 'taskSequence', value: String(next) },
        update: { value: String(next) },
      });
      const code = `TSK-${String(next).padStart(6, '0')}`;
      const clash = await prisma.task.findUnique({ where: { code }, select: { id: true } });
      if (!clash) return code;
    } catch {
      /* retry */
    }
  }
  return `TSK-${Date.now().toString(36).toUpperCase()}`;
}

export async function logActivity(input: {
  taskId: string;
  actorId?: string | null;
  type: string;
  fromValue?: string | null;
  toValue?: string | null;
  note?: string | null;
}): Promise<void> {
  await prisma.taskActivity.create({
    data: {
      taskId: input.taskId,
      actorId: input.actorId ?? null,
      type: input.type,
      fromValue: input.fromValue ?? null,
      toValue: input.toValue ?? null,
      note: input.note ?? null,
    },
  });
}

export function assertTransition(from: string, to: string): void {
  if (from === to) return;
  const allowed = TASK_TRANSITIONS[from as TaskStatus];
  if (!allowed) throw badRequest(`Unknown task status: ${from}`);
  if (!allowed.includes(to as TaskStatus)) {
    throw conflict(`Cannot move a task from ${from} to ${to}`, { from, to, allowed });
  }
}

/** Timestamps and derived fields that must move together with a status change. */
export function statusSideEffects(to: TaskStatus, now = new Date()): Prisma.TaskUncheckedUpdateInput {
  switch (to) {
    case 'ACCEPTED':
      return { acceptedAt: now, blockedReason: null, blockedAt: null };
    case 'IN_PROGRESS':
      return {
        startedAt: now,
        blockedReason: null,
        blockedAt: null,
        completedAt: null,
        submittedAt: null,
      };
    case 'SUBMITTED_FOR_REVIEW':
      return { submittedAt: now, progress: 100 };
    case 'COMPLETED':
      return { completedAt: now, progress: 100, isOverdue: false, overdueSince: null };
    case 'BLOCKED':
      return { blockedAt: now };
    case 'CANCELLED':
      return { cancelledAt: now, isOverdue: false, overdueSince: null };
    case 'CHANGES_REQUIRED':
      return { completedAt: null, submittedAt: null };
    default:
      return {};
  }
}

/**
 * Prisma `where` fragment limiting tasks to what the actor may see.
 * Team/department scopes include tasks addressed to the team/department itself,
 * not just to individuals, which is how bulk assignment stays visible.
 */
export async function taskScopeFilter(user: AuthUser, base = 'task.read'): Promise<Prisma.TaskWhereInput> {
  const scope = requireScope(user, base);
  if (scope === 'all') return {};

  const ids = await visibleUserIds(user, scope);
  const or: Prisma.TaskWhereInput[] = [{ assigneeId: { in: ids ?? [] } }, { createdById: user.id }];

  if (scope === 'team' && user.teamIds.length) or.push({ teamId: { in: user.teamIds } });
  if (scope === 'department' && user.departmentId) {
    or.push({ departmentId: user.departmentId });
    if (user.teamIds.length) or.push({ teamId: { in: user.teamIds } });
  }
  // `reports` deliberately adds nothing here: a manager's visibility is the
  // people in their line, not every task tagged to a team or department they
  // happen to touch.
  return { OR: or };
}

export async function getTaskForUser(
  user: AuthUser,
  taskId: string,
  base = 'task.read',
): Promise<TaskWithIncludes> {
  const scopeWhere = await taskScopeFilter(user, base);
  const task = await prisma.task.findFirst({
    where: { AND: [{ id: taskId }, scopeWhere] },
    include: TASK_INCLUDE,
  });
  if (!task) throw notFound('Task');
  return task;
}

/** Employees may only drive their own tasks; admin roles need an update scope. */
export async function assertCanUpdateTask(
  user: AuthUser,
  task: { assigneeId: string | null; createdById: string; teamId: string | null; departmentId: string | null },
): Promise<void> {
  if (user.permissions.has('*')) return;
  if (task.assigneeId === user.id && user.permissions.has('task.update.own')) return;
  if (task.createdById === user.id) return;

  const scope = requireScope(user, 'task.update');
  if (scope === 'all') return;
  if (scope === 'team' && task.teamId && user.teamIds.includes(task.teamId)) return;
  if (scope === 'department' && task.departmentId && task.departmentId === user.departmentId) return;
  // For `reports`, membership of the subtree is the only thing that counts,
  // which the visibleUserIds check below already answers.

  const ids = await visibleUserIds(user, scope);
  if (ids && task.assigneeId && ids.includes(task.assigneeId)) return;
  throw forbidden('This task is outside your access scope');
}

/** Recomputes the overdue flag for one task. */
export async function refreshOverdue(taskId: string, now = new Date()): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { id: true, dueDate: true, status: true, isOverdue: true },
  });
  if (!task) return;
  const shouldBeOverdue =
    !!task.dueDate &&
    task.dueDate < now &&
    !CLOSED_TASK_STATUSES.includes(task.status as TaskStatus);
  if (shouldBeOverdue === task.isOverdue) return;
  await prisma.task.update({
    where: { id: taskId },
    data: {
      isOverdue: shouldBeOverdue,
      overdueSince: shouldBeOverdue ? task.dueDate : null,
    },
  });
}

export async function notifyAssignment(
  task: { id: string; code: string; title: string; assigneeId: string | null; dueDate: Date | null },
  reassigned = false,
): Promise<void> {
  if (!task.assigneeId) return;
  await notify({
    userId: task.assigneeId,
    type: reassigned ? 'TASK_REASSIGNED' : 'TASK_ASSIGNED',
    title: `${reassigned ? 'Task reassigned to you' : 'New task assigned'}: ${task.title}`,
    body: `${task.code}${task.dueDate ? ` · due ${task.dueDate.toISOString().slice(0, 10)}` : ''}`,
    link: `/tasks/${task.id}`,
    email: true,
  });
}

export const OPEN_STATUS_LIST = OPEN_TASK_STATUSES;
