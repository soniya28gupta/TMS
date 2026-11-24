import { prisma } from '../db';
import { env } from '../env';
import type { NotificationType } from '../constants';
import { getSettings } from './settings.service';
import { escapeHtml, queueEmail, renderEmail } from './mailer.service';

export type NotifyInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  /** Relative path inside the SPA, e.g. `/tasks/abc123`. */
  link?: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  /** Also queue an email (subject to the global email toggle). */
  email?: boolean;
};

/**
 * Single entry point for every alert in the system.
 * In-app always; email additionally when enabled — the two channels named in
 * the requirements. Adding WhatsApp/Telegram/Slack later means adding a branch
 * here, not touching any caller.
 */
export async function notify(input: NotifyInput): Promise<void> {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      severity: input.severity ?? 'INFO',
    },
  });

  if (!input.email) return;
  const settings = await getSettings();
  if (!settings.emailNotificationsEnabled) return;

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true, firstName: true },
  });
  if (!user) return;

  const bodyHtml = `<p>Hi ${escapeHtml(user.firstName)},</p><p>${escapeHtml(
    input.body ?? input.title,
  )}</p>`;
  await queueEmail({
    to: user.email,
    subject: input.title,
    html: renderEmail(input.title, bodyHtml, input.link ? `${env.appUrl}${input.link}` : undefined),
    text: `${input.title}\n\n${input.body ?? ''}`,
  });

  void notification;
}

export async function notifyMany(
  userIds: string[],
  input: Omit<NotifyInput, 'userId'>,
): Promise<void> {
  const unique = [...new Set(userIds)].filter(Boolean);
  for (const userId of unique) {
    await notify({ ...input, userId });
  }
}

/**
 * Everyone who should hear about an employee's work: their manager, their team
 * leaders, and their department head — de-duplicated, excluding the employee.
 */
export async function supervisorsOf(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      managerId: true,
      department: { select: { headId: true } },
      teamMemberships: { select: { team: { select: { leaderId: true } } } },
    },
  });
  if (!user) return [];

  const ids = new Set<string>();
  if (user.managerId) ids.add(user.managerId);
  user.teamMemberships.forEach((m) => {
    if (m.team.leaderId) ids.add(m.team.leaderId);
  });
  if (user.department?.headId) ids.add(user.department.headId);
  ids.delete(userId);
  return [...ids];
}
