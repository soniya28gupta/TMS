import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { OPEN_TASK_STATUSES } from '../constants';
import { badRequest, notFound } from '../lib/errors';
import { dayOfWeek, endOfDayUtc, todayInTz } from '../lib/dates';
import { readNumberArray } from '../lib/json';
import { getSettings } from './settings.service';
import { notify } from './notification.service';

export const SOD_INCLUDE = {
  items: {
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: {
      assignedBy: { select: { id: true, firstName: true, lastName: true } },
      attachments: {
        orderBy: { createdAt: 'asc' },
        include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
      },
      task: {
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          priority: true,
          progress: true,
          dueDate: true,
          isOverdue: true,
        },
      },
    },
  },
  user: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
} satisfies Prisma.SodInclude;

type DayContext = {
  timezone: string;
  workingDays: number[];
  holidays: Set<string>;
};

let cachedHolidays: { dates: Set<string>; expiresAt: number } | null = null;

async function getHolidayDates(): Promise<Set<string>> {
  const now = Date.now();
  if (cachedHolidays && cachedHolidays.expiresAt > now) {
    return cachedHolidays.dates;
  }
  const holidays = await prisma.holiday.findMany({ select: { date: true } });
  const dates = new Set(holidays.map((h) => h.date));
  cachedHolidays = { dates, expiresAt: now + 60_000 };
  return dates;
}

export async function loadDayContext(): Promise<DayContext> {
  const [settings, holidays] = await Promise.all([getSettings(), getHolidayDates()]);
  return {
    timezone: settings.timezone,
    workingDays: settings.workingDays,
    holidays,
  };
}

/** Why an employee has no work today, if that's the case. */
export async function nonWorkingReason(
  userId: string,
  date: string,
  ctx: DayContext,
): Promise<string | null> {
  if (ctx.holidays.has(date)) return 'HOLIDAY';

  const leave = await prisma.leaveRequest.findFirst({
    where: {
      userId,
      status: 'APPROVED',
      startDate: { lte: date },
      endDate: { gte: date },
    },
    select: { id: true, isHalfDay: true },
  });
  if (leave && !leave.isHalfDay) return 'ON_LEAVE';

  // SOD, EOD, tasks, and duties can be uploaded 7 days a week (no weekend blocking)
  return null;
}

/**
 * The tasks that make up an employee's day: everything still open and already
 * startable. This is the query behind "Admin assigns four tasks in the morning
 * → they appear under Today's SOD".
 */
export async function todaysTasksFor(userId: string, date: string, timezone: string) {
  const dayEnd = endOfDayUtc(date, timezone);
  return prisma.task.findMany({
    where: {
      assigneeId: userId,
      status: { in: OPEN_TASK_STATUSES },
      OR: [{ startDate: null }, { startDate: { lte: dayEnd } }],
    },
    orderBy: [{ isOverdue: 'desc' }, { priority: 'desc' }, { dueDate: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      priority: true,
      progress: true,
      dueDate: true,
      estimatedHours: true,
    },
  });
}

/**
 * Creates today's SOD if missing and keeps it in step with task assignments
 * until the employee submits it. Idempotent — safe to call from the cron job,
 * from a task assignment, and from the employee opening the page.
 */
export async function ensureSodForUser(userId: string, date: string, ctx?: DayContext) {
  const context = ctx ?? (await loadDayContext());

  let sod = await prisma.sod.findUnique({
    where: { userId_date: { userId, date } },
    include: SOD_INCLUDE,
  });

  const skipReason = await nonWorkingReason(userId, date, context);

  if (!sod) {
    try {
      sod = await prisma.sod.create({
        data: {
          userId,
          date,
          status: skipReason ? 'SKIPPED' : 'PENDING',
          skipReason,
        },
        include: SOD_INCLUDE,
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        sod = await prisma.sod.findUnique({
          where: { userId_date: { userId, date } },
          include: SOD_INCLUDE,
        });
      } else {
        throw err;
      }
    }
  }
  if (!sod) throw new Error(`Could not find or create SOD record for user ${userId} on date ${date}`);

  if (sod.status === 'SKIPPED' && !skipReason) {
    // Leave was cancelled / holiday removed — the day became workable again.
    sod = await prisma.sod.update({
      where: { id: sod.id },
      data: { status: 'PENDING', skipReason: null },
      include: SOD_INCLUDE,
    });
  }

  if (sod.status !== 'PENDING') return sod;

  const tasks = await todaysTasksFor(userId, date, context.timezone);
  const existingTaskIds = new Set(sod.items.map((i) => i.taskId).filter(Boolean) as string[]);

  const toAdd = tasks.filter((t) => !existingTaskIds.has(t.id));
  if (toAdd.length) {
    await prisma.sodItem.createMany({
      data: toAdd.map((task, index) => ({
        sodId: sod!.id,
        taskId: task.id,
        titleSnapshot: task.title,
        prioritySnapshot: task.priority,
        statusSnapshot: task.status,
        progressSnapshot: task.progress,
        plannedHours: task.estimatedHours,
        source: 'AUTO_TASK',
        sortOrder: existingTaskIds.size + index,
      })),
    });
  }

  // Drop rows whose task left the open set (completed, cancelled or
  // reassigned) so the plan reflects reality. Only auto-generated rows are
  // pruned — manager-assigned and self-added entries are never touched here.
  const liveIds = new Set(tasks.map((t) => t.id));
  const stale = sod.items.filter(
    (i) => i.source === 'AUTO_TASK' && i.taskId && !liveIds.has(i.taskId),
  );
  if (stale.length) {
    await prisma.sodItem.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }

  if (!toAdd.length && !stale.length) return sod;
  return prisma.sod.findUnique({ where: { id: sod.id }, include: SOD_INCLUDE });
}

export async function getOrCreateTodaySod(userId: string) {
  const ctx = await loadDayContext();
  const date = todayInTz(ctx.timezone);
  return ensureSodForUser(userId, date, ctx);
}

export type SodSubmission = {
  plannedNote?: string;
  items?: { id?: string; taskId?: string | null; title?: string; plannedOutcome?: string; plannedHours?: number }[];
};

export async function submitSod(userId: string, date: string, payload: SodSubmission) {
  const ctx = await loadDayContext();
  const sod = await ensureSodForUser(userId, date, ctx);
  if (!sod) throw notFound('SOD');
  if (sod.status === 'SUBMITTED') throw badRequest('SOD for this day is already submitted');
  if (sod.status === 'SKIPPED') {
    await prisma.sod.update({
      where: { id: sod.id },
      data: { status: 'PENDING', skipReason: null },
    });
  }

  const known = new Map(sod.items.map((i) => [i.id, i]));

  for (const item of payload.items ?? []) {
    if (item.id && known.has(item.id)) {
      await prisma.sodItem.update({
        where: { id: item.id },
        data: {
          plannedOutcome: item.plannedOutcome ?? null,
          plannedHours: item.plannedHours ?? null,
          isAcknowledged: true,
        },
      });
    } else if (!item.id && item.title) {
      // Employee added planned work with no ticket behind it.
      await prisma.sodItem.create({
        data: {
          sodId: sod.id,
          taskId: null,
          titleSnapshot: item.title,
          prioritySnapshot: 'MEDIUM',
          statusSnapshot: 'ASSIGNED',
          plannedOutcome: item.plannedOutcome ?? null,
          plannedHours: item.plannedHours ?? null,
          isAcknowledged: true,
          source: 'SELF',
          sortOrder: 900,
        },
      });
    }
  }

  // Anything the employee did not touch is still acknowledged by submitting.
  await prisma.sodItem.updateMany({
    where: { sodId: sod.id, isAcknowledged: false },
    data: { isAcknowledged: true },
  });

  const updated = await prisma.sod.update({
    where: { id: sod.id },
    data: {
      status: 'SUBMITTED',
      submittedAt: new Date(),
      plannedNote: payload.plannedNote ?? null,
    },
    include: SOD_INCLUDE,
  });

  await notify({
    userId,
    type: 'SOD_READY',
    title: 'SOD submitted',
    body: `Your plan for ${date} is recorded. ${updated.items.length} item(s).`,
    link: '/sod',
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Bidirectional entries
// ---------------------------------------------------------------------------

export type SodEntryInput = {
  title: string;
  instructions?: string;
  plannedOutcome?: string;
  plannedHours?: number;
  priority?: string;
  dueTime?: string;
};

/**
 * Writes a duty straight onto an employee's daily plan.
 *
 * `source` distinguishes the two directions the requirements call for:
 *   ASSIGNED — a manager or admin sets the duty (`assignedById` is the actor)
 *   SELF     — the employee adds their own entry
 *
 * Unlike the Task module this creates no ticket, no review cycle and no
 * deadline tracking; it is a line on the day's plan, which is what SOD is for.
 */
export async function addSodEntry(
  targetUserId: string,
  date: string,
  entry: SodEntryInput,
  actor: { id: string; name: string },
  source: 'ASSIGNED' | 'SELF',
) {
  const ctx = await loadDayContext();
  const sod = await ensureSodForUser(targetUserId, date, ctx);
  if (!sod) throw notFound('SOD');

  // A manager assigning work to a day that was auto-skipped (weekly off,
  // holiday) reopens it — the instruction wins over the calendar.
  if (sod.status === 'SKIPPED') {
    await prisma.sod.update({
      where: { id: sod.id },
      data: { status: 'PENDING', skipReason: null },
    });
  }

  // Adding to an already-submitted plan is allowed in both directions: work
  // genuinely arrives mid-morning, and blocking only the employee while
  // letting managers write would be an odd asymmetry. Submission is not
  // reversed — the new line simply joins the day, tagged with its source.

  const item = await prisma.sodItem.create({
    data: {
      sodId: sod.id,
      taskId: null,
      titleSnapshot: entry.title,
      prioritySnapshot: entry.priority ?? 'MEDIUM',
      statusSnapshot: 'ASSIGNED',
      progressSnapshot: 0,
      plannedOutcome: entry.plannedOutcome ?? null,
      plannedHours: entry.plannedHours ?? null,
      instructions: entry.instructions ?? null,
      dueTime: entry.dueTime ?? null,
      source,
      status: 'PENDING',
      // Work the employee set for themselves needs no acknowledgement;
      // work handed to them does.
      isAcknowledged: source === 'SELF',
      assignedById: source === 'ASSIGNED' ? actor.id : null,
      assignedAt: source === 'ASSIGNED' ? new Date() : null,
      sortOrder: source === 'ASSIGNED' ? 500 : 900,
    },
  });

  if (source === 'ASSIGNED' && targetUserId !== actor.id) {
    await notify({
      userId: targetUserId,
      type: 'SOD_READY',
      title: `New duty added to your plan: ${entry.title}`,
      body: `${actor.name} added this to your ${date} SOD.${entry.instructions ? ` ${entry.instructions}` : ''}`,
      link: `/sod?date=${date}`,
      email: true,
    });
  }

  return item;
}

/** Assigns the same duty to several employees in one call. */
export async function assignSodEntryToMany(
  userIds: string[],
  date: string,
  entry: SodEntryInput,
  actor: { id: string; name: string },
) {
  const created = [];
  for (const userId of userIds) {
    created.push(await addSodEntry(userId, date, entry, actor, 'ASSIGNED'));
  }
  return created;
}

/** Employees update their own entries; assigners can edit what they assigned. */
export async function updateSodItem(
  itemId: string,
  actorId: string,
  patch: {
    plannedOutcome?: string;
    plannedHours?: number;
    status?: string;
    instructions?: string;
    title?: string;
  },
) {
  const item = await prisma.sodItem.findUnique({
    where: { id: itemId },
    include: { sod: { select: { userId: true, status: true } } },
  });
  if (!item) throw notFound('SOD item');

  const isOwner = item.sod.userId === actorId;
  const isAssigner = item.assignedById === actorId;
  if (!isOwner && !isAssigner) throw badRequest('You cannot edit this SOD item');
  // The title and instructions belong to whoever set the duty.
  if (!isAssigner && (patch.title || patch.instructions)) {
    throw badRequest('Only the person who assigned this can change its wording');
  }

  return prisma.sodItem.update({
    where: { id: itemId },
    data: {
      ...(patch.plannedOutcome !== undefined ? { plannedOutcome: patch.plannedOutcome } : {}),
      ...(patch.plannedHours !== undefined ? { plannedHours: patch.plannedHours } : {}),
      ...(patch.title ? { titleSnapshot: patch.title } : {}),
      ...(patch.instructions !== undefined ? { instructions: patch.instructions } : {}),
      ...(patch.status
        ? {
            status: patch.status,
            completedAt: patch.status === 'DONE' ? new Date() : null,
          }
        : {}),
    },
  });
}

/**
 * Who may see or change files on a SOD line.
 *
 * The owner always can. Anyone else needs SOD read scope over the owner, which
 * resolves through the reporting hierarchy — so a line manager and HR can, a
 * peer in another team cannot.
 */
export async function assertCanAccessSodItem(
  itemId: string,
  actor: { id: string; canReadOthers: boolean },
  visibleUserIds: string[] | null,
): Promise<{ ownerId: string; itemId: string }> {
  const item = await prisma.sodItem.findUnique({
    where: { id: itemId },
    include: { sod: { select: { userId: true } } },
  });
  if (!item) throw notFound('SOD item');

  const ownerId = item.sod.userId;
  if (ownerId === actor.id) return { ownerId, itemId };

  const inScope = visibleUserIds === null || visibleUserIds.includes(ownerId);
  if (!actor.canReadOthers || !inScope) {
    throw badRequest('That SOD entry is outside your access scope');
  }
  return { ownerId, itemId };
}

export async function deleteSodItem(itemId: string, actorId: string, isAdmin: boolean) {
  const item = await prisma.sodItem.findUnique({
    where: { id: itemId },
    include: { sod: { select: { userId: true } } },
  });
  if (!item) throw notFound('SOD item');
  if (item.source === 'AUTO_TASK') {
    throw badRequest('Task-generated entries cannot be removed — close or reassign the task instead');
  }

  const isOwner = item.sod.userId === actorId && item.source === 'SELF';
  const isAssigner = item.assignedById === actorId;
  if (!isOwner && !isAssigner && !isAdmin) throw badRequest('You cannot remove this SOD item');

  await prisma.sodItem.delete({ where: { id: itemId } });
}

/** Nightly/morning bulk generation for every active employee. */
export async function generateSodForAll(date: string): Promise<{ created: number; skipped: number }> {
  const ctx = await loadDayContext();
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });

  let created = 0;
  let skipped = 0;
  for (const user of users) {
    const sod = await ensureSodForUser(user.id, date, ctx);
    if (sod?.status === 'SKIPPED') skipped += 1;
    else created += 1;
  }
  return { created, skipped };
}
