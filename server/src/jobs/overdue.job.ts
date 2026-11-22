import { prisma } from '../db';
import { CLOSED_TASK_STATUSES } from '../constants';
import { notify, notifyMany, supervisorsOf } from '../services/notification.service';

/**
 * Flips `isOverdue` on tasks whose deadline has passed and alerts the assignee
 * plus their supervisors. Runs hourly, so a deadline is picked up within the
 * hour without a per-task timer.
 */
export async function scanOverdueTasks(now = new Date()): Promise<{ marked: number; cleared: number }> {
  const newlyOverdue = await prisma.task.findMany({
    where: {
      isOverdue: false,
      dueDate: { lt: now },
      status: { notIn: CLOSED_TASK_STATUSES },
    },
    select: { id: true, code: true, title: true, assigneeId: true, dueDate: true, createdById: true },
    take: 500,
  });

  for (const task of newlyOverdue) {
    await prisma.task.update({
      where: { id: task.id },
      data: { isOverdue: true, overdueSince: task.dueDate },
    });

    if (task.assigneeId) {
      await notify({
        userId: task.assigneeId,
        type: 'TASK_OVERDUE',
        title: `Task overdue: ${task.title}`,
        body: `${task.code} passed its deadline`,
        link: `/tasks/${task.id}`,
        severity: 'CRITICAL',
        email: true,
      });

      const watchers = new Set([task.createdById, ...(await supervisorsOf(task.assigneeId))]);
      watchers.delete(task.assigneeId);
      await notifyMany([...watchers], {
        type: 'TASK_OVERDUE',
        title: `Overdue: ${task.title}`,
        body: task.code,
        link: `/admin/tasks/${task.id}`,
        severity: 'WARNING',
      });
    }
  }

  // A deadline extension or a completion should drop the flag again.
  const cleared = await prisma.task.updateMany({
    where: {
      isOverdue: true,
      OR: [{ dueDate: null }, { dueDate: { gte: now } }, { status: { in: CLOSED_TASK_STATUSES } }],
    },
    data: { isOverdue: false, overdueSince: null },
  });

  return { marked: newlyOverdue.length, cleared: cleared.count };
}

/** One nudge per task per day for deadlines inside the next 24 hours. */
export async function notifyApproachingDeadlines(now = new Date()): Promise<number> {
  const horizon = new Date(now.getTime() + 24 * 3_600_000);
  const dayStart = new Date(now.getTime() - (now.getTime() % 86_400_000));

  const upcoming = await prisma.task.findMany({
    where: {
      dueDate: { gte: now, lte: horizon },
      status: { notIn: [...CLOSED_TASK_STATUSES, 'SUBMITTED_FOR_REVIEW'] },
      assigneeId: { not: null },
    },
    select: { id: true, code: true, title: true, assigneeId: true, dueDate: true },
    take: 500,
  });

  let sent = 0;
  for (const task of upcoming) {
    const already = await prisma.notification.findFirst({
      where: {
        userId: task.assigneeId!,
        type: 'TASK_DUE_SOON',
        link: `/tasks/${task.id}`,
        createdAt: { gte: dayStart },
      },
      select: { id: true },
    });
    if (already) continue;

    await notify({
      userId: task.assigneeId!,
      type: 'TASK_DUE_SOON',
      title: `Due soon: ${task.title}`,
      body: `${task.code} is due ${task.dueDate?.toISOString().slice(0, 16).replace('T', ' ')}`,
      link: `/tasks/${task.id}`,
      severity: 'WARNING',
      email: true,
    });
    sent += 1;
  }
  return sent;
}
