import { prisma } from '../db';
import { badRequest, conflict, notFound } from '../lib/errors';
import { countWorkingDays, eachDay, todayInTz } from '../lib/dates';
import { readNumberArray } from '../lib/json';
import { getSettings } from './settings.service';
import { loadDayContext } from './sod.service';
import { notify, notifyMany, supervisorsOf } from './notification.service';

export function leaveYearFor(date: string, startMonth: number): number {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return month >= startMonth ? year : year - 1;
}

/** Creates any missing balance rows for the year from the active leave types. */
export async function ensureBalances(userId: string, year: number): Promise<void> {
  const types = await prisma.leaveType.findMany({ where: { isActive: true } });
  const existing = await prisma.leaveBalance.findMany({
    where: { userId, year },
    select: { leaveTypeId: true },
  });
  const have = new Set(existing.map((b) => b.leaveTypeId));

  const missing = types.filter((t) => !have.has(t.id));
  if (!missing.length) return;

  await prisma.leaveBalance.createMany({
    data: missing.map((type) => ({
      userId,
      leaveTypeId: type.id,
      year,
      entitled: type.defaultDays,
    })),
  });
}

/** Working days requested, honouring the employee's own week and holidays. */
export async function countLeaveDays(
  userId: string,
  startDate: string,
  endDate: string,
  isHalfDay: boolean,
): Promise<number> {
  if (isHalfDay) return 0.5;
  const ctx = await loadDayContext();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { workingDays: true },
  });
  const workingDays = readNumberArray(user?.workingDays, ctx.workingDays);
  return countWorkingDays(startDate, endDate, workingDays, ctx.holidays);
}

export async function applyForLeave(
  userId: string,
  payload: {
    leaveTypeId: string;
    startDate: string;
    endDate: string;
    reason: string;
    isHalfDay?: boolean;
    halfDaySlot?: string;
    contactDuringLeave?: string;
    attachmentKey?: string;
  },
) {
  if (payload.endDate < payload.startDate) throw badRequest('End date cannot be before start date');
  if (payload.isHalfDay && payload.startDate !== payload.endDate) {
    throw badRequest('A half day must start and end on the same date');
  }

  const settings = await getSettings();
  const type = await prisma.leaveType.findUnique({ where: { id: payload.leaveTypeId } });
  if (!type || !type.isActive) throw notFound('Leave type');
  if (payload.isHalfDay && !type.allowHalfDay) {
    throw badRequest(`${type.name} cannot be taken as a half day`);
  }

  const overlap = await prisma.leaveRequest.findFirst({
    where: {
      userId,
      status: { in: ['PENDING', 'APPROVED'] },
      startDate: { lte: payload.endDate },
      endDate: { gte: payload.startDate },
    },
  });
  if (overlap) throw conflict('You already have a leave request covering these dates');

  const days = await countLeaveDays(userId, payload.startDate, payload.endDate, !!payload.isHalfDay);
  if (days <= 0) throw badRequest('The selected range contains no working days');

  const year = leaveYearFor(payload.startDate, settings.leaveYearStartMonth);
  await ensureBalances(userId, year);

  const balance = await prisma.leaveBalance.findUnique({
    where: { userId_leaveTypeId_year: { userId, leaveTypeId: type.id, year } },
  });
  const available = (balance?.entitled ?? 0) + (balance?.carriedForward ?? 0) - (balance?.used ?? 0) - (balance?.pending ?? 0);
  if (type.isPaid && days > available) {
    throw badRequest(`Not enough ${type.name} balance: ${available} day(s) available, ${days} requested`);
  }

  const request = await prisma.leaveRequest.create({
    data: {
      userId,
      leaveTypeId: type.id,
      startDate: payload.startDate,
      endDate: payload.endDate,
      days,
      isHalfDay: !!payload.isHalfDay,
      halfDaySlot: payload.halfDaySlot ?? null,
      reason: payload.reason,
      contactDuringLeave: payload.contactDuringLeave ?? null,
      attachmentKey: payload.attachmentKey ?? null,
    },
    include: { leaveType: true, user: { select: { firstName: true, lastName: true } } },
  });

  if (balance) {
    await prisma.leaveBalance.update({
      where: { id: balance.id },
      data: { pending: { increment: days } },
    });
  }

  const approvers = await supervisorsOf(userId);
  await notifyMany(approvers, {
    type: 'LEAVE_REQUESTED',
    title: `Leave request from ${request.user.firstName} ${request.user.lastName}`,
    body: `${type.name} · ${payload.startDate} → ${payload.endDate} (${days} day(s))`,
    link: '/admin/leave',
    email: true,
  });

  return request;
}

export async function decideLeave(
  requestId: string,
  approverId: string,
  action: 'APPROVE' | 'REJECT',
  note?: string,
) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    include: { leaveType: true },
  });
  if (!request) throw notFound('Leave request');
  if (request.status !== 'PENDING') throw badRequest('This request has already been decided');

  const settings = await getSettings();
  const year = leaveYearFor(request.startDate, settings.leaveYearStartMonth);
  const approved = action === 'APPROVE';

  const updated = await prisma.leaveRequest.update({
    where: { id: requestId },
    data: {
      status: approved ? 'APPROVED' : 'REJECTED',
      approverId,
      decidedAt: new Date(),
      decisionNote: note ?? null,
    },
    include: { leaveType: true },
  });

  const balance = await prisma.leaveBalance.findUnique({
    where: { userId_leaveTypeId_year: { userId: request.userId, leaveTypeId: request.leaveTypeId, year } },
  });
  if (balance) {
    await prisma.leaveBalance.update({
      where: { id: balance.id },
      data: {
        pending: { decrement: request.days },
        ...(approved ? { used: { increment: request.days } } : {}),
      },
    });
  }

  if (approved) await markLeaveDaysOnCalendar(request.userId, request.startDate, request.endDate, request.isHalfDay);

  await notify({
    userId: request.userId,
    type: approved ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
    title: `Leave ${approved ? 'approved' : 'rejected'}: ${request.leaveType.name}`,
    body: `${request.startDate} → ${request.endDate}${note ? ` · ${note}` : ''}`,
    severity: approved ? 'INFO' : 'WARNING',
    link: '/leave',
    email: true,
  });

  return updated;
}

/** Approved leave pre-fills attendance so the day is never counted absent. */
async function markLeaveDaysOnCalendar(
  userId: string,
  startDate: string,
  endDate: string,
  isHalfDay: boolean,
): Promise<void> {
  const ctx = await loadDayContext();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { workingDays: true },
  });
  const workingDays = readNumberArray(user?.workingDays, ctx.workingDays);
  const today = todayInTz(ctx.timezone);

  for (const day of eachDay(startDate, endDate)) {
    if (ctx.holidays.has(day)) continue;
    if (!workingDays.includes(new Date(`${day}T00:00:00Z`).getUTCDay())) continue;
    // Never rewrite a day the employee already worked.
    const existing = await prisma.attendance.findUnique({
      where: { userId_date: { userId, date: day } },
    });
    if (existing?.checkInAt && day <= today) continue;

    await prisma.attendance.upsert({
      where: { userId_date: { userId, date: day } },
      create: { userId, date: day, status: isHalfDay ? 'HALF_DAY' : 'ON_LEAVE' },
      update: { status: isHalfDay ? 'HALF_DAY' : 'ON_LEAVE' },
    });
  }
}

export async function cancelLeave(requestId: string, userId: string) {
  const request = await prisma.leaveRequest.findUnique({ where: { id: requestId } });
  if (!request) throw notFound('Leave request');
  if (request.userId !== userId) throw badRequest('You can only cancel your own leave requests');
  if (request.status === 'CANCELLED') throw badRequest('Already cancelled');
  if (request.status === 'REJECTED') throw badRequest('Rejected requests cannot be cancelled');

  const settings = await getSettings();
  const year = leaveYearFor(request.startDate, settings.leaveYearStartMonth);
  const balance = await prisma.leaveBalance.findUnique({
    where: { userId_leaveTypeId_year: { userId, leaveTypeId: request.leaveTypeId, year } },
  });
  if (balance) {
    await prisma.leaveBalance.update({
      where: { id: balance.id },
      data:
        request.status === 'PENDING'
          ? { pending: { decrement: request.days } }
          : { used: { decrement: request.days } },
    });
  }

  if (request.status === 'APPROVED') {
    await prisma.attendance.updateMany({
      where: {
        userId,
        date: { gte: request.startDate, lte: request.endDate },
        status: { in: ['ON_LEAVE', 'HALF_DAY'] },
        checkInAt: null,
      },
      data: { status: 'ABSENT' },
    });
  }

  return prisma.leaveRequest.update({
    where: { id: requestId },
    data: { status: 'CANCELLED', decidedAt: new Date() },
  });
}

export async function balanceSummary(userId: string, year: number) {
  await ensureBalances(userId, year);
  const balances = await prisma.leaveBalance.findMany({
    where: { userId, year },
    include: { leaveType: true },
    orderBy: { leaveType: { name: 'asc' } },
  });
  return balances.map((b) => ({
    id: b.id,
    leaveType: { id: b.leaveType.id, name: b.leaveType.name, code: b.leaveType.code, color: b.leaveType.color, isPaid: b.leaveType.isPaid },
    year: b.year,
    entitled: b.entitled,
    carriedForward: b.carriedForward,
    used: b.used,
    pending: b.pending,
    available: b.entitled + b.carriedForward - b.used - b.pending,
  }));
}
