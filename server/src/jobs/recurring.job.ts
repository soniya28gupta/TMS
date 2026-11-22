import { prisma } from '../db';
import { addDays, dayOfMonth, dayOfWeek, todayInTz, zonedToUtc } from '../lib/dates';
import { readNumberArray } from '../lib/json';
import { getSettings } from '../services/settings.service';
import { loadDayContext } from '../services/sod.service';
import { nextTaskCode, logActivity, notifyAssignment } from '../services/task.service';

/** True when a template is due to fire on the given calendar day. */
function isDue(
  template: { frequency: string; daysOfWeek: string; dayOfMonth: number | null },
  date: string,
): boolean {
  const dow = dayOfWeek(date);
  switch (template.frequency) {
    case 'DAILY':
    case 'WEEKLY': {
      const days = readNumberArray(template.daysOfWeek, [1, 2, 3, 4, 5]);
      return days.includes(dow);
    }
    case 'MONTHLY': {
      if (!template.dayOfMonth) return false;
      const dom = dayOfMonth(date);
      if (dom === template.dayOfMonth) return true;
      // A 31st schedule still fires on the last day of a shorter month.
      const tomorrow = addDays(date, 1);
      return template.dayOfMonth > dom && dayOfMonth(tomorrow) === 1;
    }
    default:
      return false;
  }
}

async function resolveTargets(template: {
  assigneeId: string | null;
  teamId: string | null;
  departmentId: string | null;
}): Promise<string[]> {
  if (template.assigneeId) return [template.assigneeId];
  if (template.teamId) {
    const members = await prisma.teamMember.findMany({
      where: { teamId: template.teamId, user: { status: 'ACTIVE' } },
      select: { userId: true },
    });
    return members.map((m) => m.userId);
  }
  if (template.departmentId) {
    const people = await prisma.user.findMany({
      where: { departmentId: template.departmentId, status: 'ACTIVE' },
      select: { id: true },
    });
    return people.map((p) => p.id);
  }
  return [];
}

/**
 * Turns recurring templates into real tasks for `date`.
 * `lastRunDate` on the template makes this idempotent — running it twice in a
 * day creates nothing the second time.
 */
export async function materialiseRecurringTasks(
  date?: string,
): Promise<{ created: number; templates: number }> {
  const settings = await getSettings();
  const ctx = await loadDayContext();
  const day = date ?? todayInTz(settings.timezone);

  const templates = await prisma.recurringTask.findMany({
    where: {
      isActive: true,
      startDate: { lte: new Date(`${day}T23:59:59.999Z`) },
      OR: [{ endDate: null }, { endDate: { gte: new Date(`${day}T00:00:00.000Z`) } }],
      NOT: { lastRunDate: day },
    },
  });

  let created = 0;
  let fired = 0;

  for (const template of templates) {
    if (!isDue(template, day)) continue;
    if (template.skipHolidays && ctx.holidays.has(day)) continue;

    const targets = await resolveTargets(template);
    if (!targets.length) {
      await prisma.recurringTask.update({
        where: { id: template.id },
        data: { lastRunDate: day },
      });
      continue;
    }

    const dueDate = zonedToUtc(addDays(day, template.dueAfterDays), template.dueTime, settings.timezone);

    for (const assigneeId of targets) {
      const assignee = await prisma.user.findUnique({
        where: { id: assigneeId },
        select: { departmentId: true },
      });

      const task = await prisma.task.create({
        data: {
          code: await nextTaskCode(),
          title: template.title,
          description: template.description,
          priority: template.priority,
          status: 'ASSIGNED',
          assigneeId,
          createdById: template.createdById,
          departmentId: template.departmentId ?? assignee?.departmentId ?? null,
          teamId: template.teamId,
          startDate: zonedToUtc(day, '09:00', settings.timezone),
          dueDate,
          estimatedHours: template.estimatedHours,
          recurringTaskId: template.id,
          tags: JSON.stringify(['recurring']),
        },
      });

      await logActivity({
        taskId: task.id,
        actorId: null,
        type: 'SYSTEM',
        toValue: 'ASSIGNED',
        note: `Generated from recurring schedule "${template.title}"`,
      });
      await notifyAssignment(task);
      created += 1;
    }

    await prisma.recurringTask.update({ where: { id: template.id }, data: { lastRunDate: day } });
    fired += 1;
  }

  return { created, templates: fired };
}
