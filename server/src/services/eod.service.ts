import type { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { OPEN_TASK_STATUSES } from '../constants';
import { badRequest, notFound } from '../lib/errors';
import { endOfDayUtc, minutesToHours, startOfDayUtc, todayInTz } from '../lib/dates';
import { getSettings } from './settings.service';
import { notify, notifyMany, supervisorsOf } from './notification.service';
import { loadDayContext, nonWorkingReason } from './sod.service';

export const EOD_INCLUDE = {
  items: {
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    include: {
      task: {
        select: { id: true, code: true, title: true, status: true, priority: true, dueDate: true },
      },
    },
  },
  user: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
  reviewedBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.EodInclude;

type DraftItem = {
  taskId: string;
  category: 'COMPLETED' | 'PENDING' | 'BLOCKED';
  titleSnapshot: string;
  statusAtEod: string;
  progressAtEod: number;
  blockerReason: string | null;
  sortOrder: number;
};

/**
 * Builds the EOD draft straight from the day's task data — this is the
 * "EOD automatically pulls task information" requirement. Nothing here asks the
 * employee to retype what the system already knows.
 */
async function buildDraftItems(userId: string, date: string, timezone: string): Promise<DraftItem[]> {
  const dayStart = startOfDayUtc(date, timezone);
  const dayEnd = endOfDayUtc(date, timezone);

  const touchedToday = await prisma.task.findMany({
    where: {
      assigneeId: userId,
      OR: [
        { completedAt: { gte: dayStart, lte: dayEnd } },
        { submittedAt: { gte: dayStart, lte: dayEnd } },
        { status: { in: OPEN_TASK_STATUSES } },
      ],
    },
    orderBy: [{ priority: 'desc' }, { dueDate: 'asc' }],
    select: {
      id: true,
      title: true,
      status: true,
      progress: true,
      blockedReason: true,
      completedAt: true,
      submittedAt: true,
    },
  });

  // Also honour what the employee planned in the morning, even if a task was
  // reassigned during the day — the day's story should stay complete.
  const sod = await prisma.sod.findUnique({
    where: { userId_date: { userId, date } },
    include: { items: { select: { taskId: true, titleSnapshot: true } } },
  });
  const plannedIds = new Set(
    (sod?.items ?? []).map((i) => i.taskId).filter((id): id is string => Boolean(id)),
  );

  const missingPlanned = [...plannedIds].filter((id) => !touchedToday.some((t) => t.id === id));
  const extras = missingPlanned.length
    ? await prisma.task.findMany({
        where: { id: { in: missingPlanned } },
        select: {
          id: true,
          title: true,
          status: true,
          progress: true,
          blockedReason: true,
          completedAt: true,
          submittedAt: true,
        },
      })
    : [];

  const all = [...touchedToday, ...extras];

  return all.map((task, index) => {
    const finishedToday =
      (task.completedAt && task.completedAt >= dayStart && task.completedAt <= dayEnd) ||
      (task.submittedAt && task.submittedAt >= dayStart && task.submittedAt <= dayEnd);

    let category: DraftItem['category'] = 'PENDING';
    if (task.status === 'BLOCKED') category = 'BLOCKED';
    else if (task.status === 'COMPLETED' || task.status === 'SUBMITTED_FOR_REVIEW' || finishedToday) {
      category = 'COMPLETED';
    }

    return {
      taskId: task.id,
      category,
      titleSnapshot: task.title,
      statusAtEod: task.status,
      progressAtEod: task.progress,
      blockerReason: task.status === 'BLOCKED' ? task.blockedReason : null,
      sortOrder: category === 'COMPLETED' ? index : category === 'BLOCKED' ? 200 + index : 100 + index,
    };
  });
}

/** Idempotent: creates today's EOD and refreshes its draft rows until submitted. */
export async function ensureEodForUser(userId: string, date: string, ctx?: Awaited<ReturnType<typeof loadDayContext>>) {
  const context = ctx ?? (await loadDayContext());

  let eod = await prisma.eod.findUnique({
    where: { userId_date: { userId, date } },
    include: EOD_INCLUDE,
  });

  if (!eod) {
    const skipReason = await nonWorkingReason(userId, date, context);
    try {
      eod = await prisma.eod.create({
        data: {
          userId,
          date,
          status: 'PENDING',
          workSummary: skipReason ? null : undefined,
          nextDayPlan: null,
          pendingReason: null,
          blockers: skipReason ? `Non-working day (${skipReason.toLowerCase()})` : null,
        },
        include: EOD_INCLUDE,
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        eod = await prisma.eod.findUnique({
          where: { userId_date: { userId, date } },
          include: EOD_INCLUDE,
        });
      } else {
        throw err;
      }
    }
  }

  if (!eod) throw new Error(`Could not find or create EOD record for user ${userId} on date ${date}`);

  if (eod.status !== 'PENDING' && eod.status !== 'CHANGES_REQUESTED') return eod;

  const draft = await buildDraftItems(userId, date, context.timezone);
  const existingByTask = new Map(
    eod.items.filter((i) => i.taskId).map((i) => [i.taskId as string, i]),
  );

  for (const item of draft) {
    const existing = existingByTask.get(item.taskId);
    if (existing) {
      await prisma.eodItem.update({
        where: { id: existing.id },
        data: {
          category: item.category,
          statusAtEod: item.statusAtEod,
          progressAtEod: item.progressAtEod,
          titleSnapshot: item.titleSnapshot,
          blockerReason: existing.blockerReason ?? item.blockerReason,
        },
      });
      existingByTask.delete(item.taskId);
    } else {
      await prisma.eodItem.create({ data: { eodId: eod.id, ...item } });
    }
  }

  // Rows whose task is no longer part of today drop out (ADDITIONAL rows the
  // employee typed have no taskId and are never in this map).
  const orphaned = [...existingByTask.values()];
  if (orphaned.length) {
    await prisma.eodItem.deleteMany({ where: { id: { in: orphaned.map((o) => o.id) } } });
  }

  return prisma.eod.findUnique({ where: { id: eod.id }, include: EOD_INCLUDE });
}

export async function getOrCreateTodayEod(userId: string) {
  const ctx = await loadDayContext();
  const date = todayInTz(ctx.timezone);
  return ensureEodForUser(userId, date, ctx);
}

export type EodSubmission = {
  workSummary: string;
  pendingReason?: string;
  blockers?: string;
  additionalWork?: string;
  nextDayPlan?: string;
  totalHours?: number;
  items?: {
    id: string;
    category?: 'COMPLETED' | 'PENDING' | 'BLOCKED' | 'ADDITIONAL';
    hoursSpent?: number;
    note?: string;
    blockerReason?: string;
    pendingReason?: string;
  }[];
  extraItems?: {
    title: string;
    note?: string;
    hoursSpent?: number;
    category?: 'COMPLETED' | 'PENDING' | 'BLOCKED' | 'ADDITIONAL';
    pendingReason?: string;
  }[];
};

export async function submitEod(userId: string, date: string, payload: EodSubmission) {
  const ctx = await loadDayContext();
  const eod = await ensureEodForUser(userId, date, ctx);
  if (!eod) throw notFound('EOD');
  if (eod.status === 'SUBMITTED' || eod.status === 'REVIEWED') {
    throw badRequest('EOD for this day is already submitted');
  }

  const ids = new Set(eod.items.map((i) => i.id));
  for (const item of payload.items ?? []) {
    if (!ids.has(item.id)) continue;
    await prisma.eodItem.update({
      where: { id: item.id },
      data: {
        ...(item.category ? { category: item.category as any } : {}),
        hoursSpent: item.hoursSpent ?? null,
        note: item.note ?? null,
        blockerReason: item.pendingReason ?? item.blockerReason ?? null,
      },
    });
  }

  // Work done outside the assigned tasks — custom extra rows typed by employee.
  await prisma.eodItem.deleteMany({ where: { eodId: eod.id, taskId: null } });
  for (const [index, extra] of (payload.extraItems ?? []).entries()) {
    if (!extra.title?.trim()) continue;
    const cat = extra.category ?? 'ADDITIONAL';
    await prisma.eodItem.create({
      data: {
        eodId: eod.id,
        taskId: null,
        titleSnapshot: extra.title.trim(),
        category: cat,
        statusAtEod: cat === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS',
        progressAtEod: cat === 'COMPLETED' ? 100 : 50,
        hoursSpent: extra.hoursSpent ?? null,
        note: extra.note ?? null,
        blockerReason: extra.pendingReason ?? null,
        sortOrder: 300 + index,
      },
    });
  }

  const settings = await getSettings();
  const attendance = await prisma.attendance.findUnique({
    where: { userId_date: { userId, date } },
    select: { workedMinutes: true },
  });

  const updated = await prisma.eod.update({
    where: { id: eod.id },
    data: {
      status: 'SUBMITTED',
      submittedAt: new Date(),
      workSummary: payload.workSummary,
      pendingReason: payload.pendingReason ?? null,
      blockers: payload.blockers ?? null,
      additionalWork: payload.additionalWork ?? null,
      nextDayPlan: payload.nextDayPlan ?? null,
      totalHours: payload.totalHours ?? minutesToHours(attendance?.workedMinutes ?? 0),
      reviewNotes: null,
    },
    include: EOD_INCLUDE,
  });

  if (settings.requireEodReview) {
    const supervisors = await supervisorsOf(userId);
    await notifyMany(supervisors, {
      type: 'EOD_REVIEW_REQUIRED',
      title: `EOD submitted by ${updated.user.firstName} ${updated.user.lastName}`,
      body: `${date} · ${updated.items.length} item(s) awaiting your review`,
      link: `/admin/eod?date=${date}`,
      email: true,
    });
  }

  return updated;
}

export async function reviewEod(
  eodId: string,
  reviewerId: string,
  action: 'APPROVE' | 'REQUEST_CHANGES',
  notes?: string,
) {
  const eod = await prisma.eod.findUnique({ where: { id: eodId }, select: { id: true, userId: true, date: true, status: true } });
  if (!eod) throw notFound('EOD');
  if (eod.status === 'PENDING') throw badRequest('This EOD has not been submitted yet');

  const approved = action === 'APPROVE';
  const updated = await prisma.eod.update({
    where: { id: eodId },
    data: {
      status: approved ? 'REVIEWED' : 'CHANGES_REQUESTED',
      reviewedById: reviewerId,
      reviewedAt: new Date(),
      reviewNotes: notes ?? null,
    },
    include: EOD_INCLUDE,
  });

  await notify({
    userId: eod.userId,
    type: 'EOD_REVIEWED',
    title: approved ? `EOD for ${eod.date} approved` : `Changes requested on your EOD (${eod.date})`,
    body: notes,
    link: `/eod?date=${eod.date}`,
    severity: approved ? 'INFO' : 'WARNING',
    email: true,
  });

  return updated;
}
