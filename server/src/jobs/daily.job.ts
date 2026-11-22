import { prisma } from '../db';
import { todayInTz } from '../lib/dates';
import { writeJson } from '../lib/json';
import { getSettings } from '../services/settings.service';
import { ensureSodForUser, generateSodForAll, loadDayContext } from '../services/sod.service';
import { ensureEodForUser } from '../services/eod.service';
import { notify, notifyMany, supervisorsOf } from '../services/notification.service';
import { closeAttendanceForDay } from '../services/attendance.service';

/** Morning: build every active employee's plan from their open tasks. */
export async function runSodGeneration(date?: string) {
  const settings = await getSettings();
  const day = date ?? todayInTz(settings.timezone);
  const result = await generateSodForAll(day);

  const pending = await prisma.sod.findMany({
    where: { date: day, status: 'PENDING' },
    select: { userId: true, items: { select: { id: true } } },
  });
  for (const sod of pending) {
    await notify({
      userId: sod.userId,
      type: 'SOD_READY',
      title: 'Your plan for today is ready',
      body: `${sod.items.length} task(s) waiting for your review. Confirm your SOD to start the day.`,
      link: '/sod',
    });
  }
  return { ...result, notified: pending.length };
}

/** Later morning: chase anyone who has not confirmed their plan. */
export async function runSodReminder(date?: string) {
  const settings = await getSettings();
  const day = date ?? todayInTz(settings.timezone);

  const pending = await prisma.sod.findMany({
    where: { date: day, status: 'PENDING' },
    select: { userId: true },
  });
  await notifyMany(
    pending.map((p) => p.userId),
    {
      type: 'SOD_REMINDER',
      title: 'Reminder: confirm your SOD',
      body: `Your plan for ${day} is still unconfirmed.`,
      link: '/sod',
      severity: 'WARNING',
      email: true,
    },
  );
  return { reminded: pending.length };
}

/** Evening: pre-build the EOD draft and ask everyone to submit. */
export async function runEodReminder(date?: string) {
  const settings = await getSettings();
  const ctx = await loadDayContext();
  const day = date ?? todayInTz(settings.timezone);

  const users = await prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });

  let reminded = 0;
  for (const user of users) {
    const sod = await prisma.sod.findUnique({
      where: { userId_date: { userId: user.id, date: day } },
      select: { status: true },
    });
    // Nobody is asked for an EOD on a day they were not expected to work.
    if (sod?.status === 'SKIPPED') continue;

    const eod = await ensureEodForUser(user.id, day, ctx);
    if (!eod || eod.status !== 'PENDING') continue;

    await notify({
      userId: user.id,
      type: 'EOD_REMINDER',
      title: 'Time to submit your EOD',
      body: `${eod.items.length} item(s) are already filled in from your tasks — add your summary and submit.`,
      link: '/eod',
      email: true,
    });
    reminded += 1;
  }
  return { reminded };
}

/** Night: escalate missing EOD submissions to the employee and their manager. */
export async function runEodMissingCheck(date?: string) {
  const settings = await getSettings();
  const day = date ?? todayInTz(settings.timezone);

  const missing = await prisma.eod.findMany({
    where: { date: day, status: 'PENDING' },
    select: { userId: true, user: { select: { firstName: true, lastName: true } } },
  });

  for (const eod of missing) {
    const sod = await prisma.sod.findUnique({
      where: { userId_date: { userId: eod.userId, date: day } },
      select: { status: true },
    });
    if (sod?.status === 'SKIPPED') continue;

    await notify({
      userId: eod.userId,
      type: 'EOD_MISSING',
      title: 'EOD not submitted',
      body: `Your EOD for ${day} is still pending.`,
      link: '/eod',
      severity: 'CRITICAL',
      email: true,
    });
    await notifyMany(await supervisorsOf(eod.userId), {
      type: 'EOD_MISSING',
      title: `EOD missing: ${eod.user.firstName} ${eod.user.lastName}`,
      body: `No EOD submitted for ${day}.`,
      link: `/admin/eod?date=${day}`,
      severity: 'WARNING',
    });
  }
  return { escalated: missing.length };
}

/**
 * End of day: close attendance and write the immutable daily work record that
 * powers the employee work-history view and productivity reports.
 */
export async function runDayClose(date?: string) {
  const settings = await getSettings();
  const day = date ?? todayInTz(settings.timezone);

  const attendanceResult = await closeAttendanceForDay(day);
  const users = await prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });

  let written = 0;
  for (const user of users) {
    const [sod, eod, attendance] = await Promise.all([
      prisma.sod.findUnique({
        where: { userId_date: { userId: user.id, date: day } },
        include: { items: { select: { id: true } } },
      }),
      prisma.eod.findUnique({
        where: { userId_date: { userId: user.id, date: day } },
        include: { items: true },
      }),
      prisma.attendance.findUnique({ where: { userId_date: { userId: user.id, date: day } } }),
    ]);

    const items = eod?.items ?? [];
    const completed = items.filter((i) => i.category === 'COMPLETED').length;
    const pending = items.filter((i) => i.category === 'PENDING').length;
    const blocked = items.filter((i) => i.category === 'BLOCKED').length;
    const progressAvg = items.length
      ? Math.round(items.reduce((sum, i) => sum + i.progressAtEod, 0) / items.length)
      : 0;

    const overdue = await prisma.task.count({
      where: { assigneeId: user.id, isOverdue: true },
    });

    await prisma.dailyWorkRecord.upsert({
      where: { userId_date: { userId: user.id, date: day } },
      create: {
        userId: user.id,
        date: day,
        sodId: sod?.id ?? null,
        eodId: eod?.id ?? null,
        sodStatus: sod?.status ?? 'NONE',
        eodStatus: eod?.status ?? 'NONE',
        attendanceStatus: attendance?.status ?? 'UNKNOWN',
        tasksPlanned: sod?.items.length ?? 0,
        tasksCompleted: completed,
        tasksPending: pending,
        tasksBlocked: blocked,
        tasksOverdue: overdue,
        hoursWorked: eod?.totalHours ?? (attendance?.workedMinutes ?? 0) / 60,
        progressAvg,
        snapshot: writeJson({
          sodSubmittedAt: sod?.submittedAt,
          eodSubmittedAt: eod?.submittedAt,
          workSummary: eod?.workSummary,
          blockers: eod?.blockers,
          nextDayPlan: eod?.nextDayPlan,
        }),
      },
      update: {
        sodStatus: sod?.status ?? 'NONE',
        eodStatus: eod?.status ?? 'NONE',
        attendanceStatus: attendance?.status ?? 'UNKNOWN',
        tasksPlanned: sod?.items.length ?? 0,
        tasksCompleted: completed,
        tasksPending: pending,
        tasksBlocked: blocked,
        tasksOverdue: overdue,
        hoursWorked: eod?.totalHours ?? (attendance?.workedMinutes ?? 0) / 60,
        progressAvg,
      },
    });
    written += 1;
  }

  return { ...attendanceResult, records: written, date: day };
}

/** Pre-creates tomorrow's SOD shells so the morning job has less to do. */
export async function warmNextDay(date: string) {
  const ctx = await loadDayContext();
  const users = await prisma.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
  for (const user of users) {
    await ensureSodForUser(user.id, date, ctx).catch(() => undefined);
  }
}
