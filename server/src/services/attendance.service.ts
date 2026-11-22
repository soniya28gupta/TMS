import { prisma } from '../db';
import { badRequest } from '../lib/errors';
import {
  dayOfWeek,
  minutesBetween,
  timeInTz,
  timeToMinutes,
  todayInTz,
} from '../lib/dates';
import { readNumberArray } from '../lib/json';
import { getSettings } from './settings.service';
import { loadDayContext } from './sod.service';
import { resolvePosition, type RawPosition } from './geo.service';

/** Late = checked in after shift start + configured grace. */
function deriveArrivalStatus(
  checkInTime: string,
  shiftStart: string,
  graceMinutes: number,
  workMode: string,
): string {
  if (workMode === 'REMOTE') return 'WFH';
  return timeToMinutes(checkInTime) > timeToMinutes(shiftStart) + graceMinutes ? 'LATE' : 'PRESENT';
}

export async function checkIn(
  userId: string,
  opts: { ip?: string; workMode?: string; note?: string; position?: RawPosition | null },
) {
  const settings = await getSettings();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { shiftStart: true, timezone: true, workMode: true },
  });

  const tz = user.timezone || settings.timezone;
  const date = todayInTz(tz);
  const now = new Date();

  const existing = await prisma.attendance.findUnique({ where: { userId_date: { userId, date } } });
  if (existing?.checkInAt) throw badRequest('You have already checked in today');

  const workMode = opts.workMode ?? user.workMode;
  const status = deriveArrivalStatus(
    timeInTz(tz, now),
    user.shiftStart || settings.workStartTime,
    settings.lateGraceMinutes,
    workMode,
  );

  // Resolves and validates position with exact coordinate precision
  const location = await resolvePosition(userId, opts.position, { exact: true });
  const geo = {
    locationConsent: location !== null,
    checkInLatitude: location?.latitude ?? null,
    checkInLongitude: location?.longitude ?? null,
    checkInAccuracy: location?.accuracy ?? null,
    checkInAddress: location?.address ?? null,
    checkInDistanceMeters: location?.distanceMeters ?? null,
    checkInWithinGeofence: location?.withinGeofence ?? null,
  };

  return prisma.attendance.upsert({
    where: { userId_date: { userId, date } },
    create: {
      userId,
      date,
      checkInAt: now,
      status,
      workMode,
      checkInIp: opts.ip ?? null,
      note: opts.note ?? null,
      ...geo,
    },
    update: {
      checkInAt: now,
      status,
      workMode,
      checkInIp: opts.ip ?? null,
      note: opts.note ?? null,
      ...geo,
    },
  });
}

export async function checkOut(
  userId: string,
  opts: { ip?: string; note?: string; position?: RawPosition | null },
) {
  const settings = await getSettings();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });
  const tz = user.timezone || settings.timezone;
  const date = todayInTz(tz);
  const now = new Date();

  const record = await prisma.attendance.findUnique({ where: { userId_date: { userId, date } } });
  if (!record?.checkInAt) throw badRequest('You have not checked in today');
  if (record.checkOutAt) throw badRequest('You have already checked out today');

  const workedMinutes = minutesBetween(record.checkInAt, now);
  const status =
    workedMinutes < settings.halfDayAfterMinutes && record.status !== 'WFH'
      ? 'HALF_DAY'
      : record.status;

  const location = await resolvePosition(userId, opts.position, { exact: true });

  return prisma.attendance.update({
    where: { id: record.id },
    data: {
      checkOutAt: now,
      workedMinutes,
      status,
      checkOutIp: opts.ip ?? null,
      note: opts.note ?? record.note,
      ...(location
        ? {
            locationConsent: true,
            checkOutLatitude: location.latitude,
            checkOutLongitude: location.longitude,
            checkOutAccuracy: location.accuracy,
            checkOutAddress: location.address,
            checkOutDistanceMeters: location.distanceMeters,
            checkOutWithinGeofence: location.withinGeofence,
          }
        : {}),
    },
  });
}

export async function todayAttendance(userId: string) {
  const settings = await getSettings();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { timezone: true },
  });
  const date = todayInTz(user.timezone || settings.timezone);
  return prisma.attendance.findUnique({ where: { userId_date: { userId, date } } });
}

/**
 * Day-close pass: anyone who never checked in gets an explicit record so
 * reports never rely on the absence of a row. Weekends, holidays and approved
 * leave are labelled rather than counted as absence.
 */
export async function closeAttendanceForDay(date: string): Promise<{ closed: number; absent: number }> {
  const ctx = await loadDayContext();
  const settings = await getSettings();
  const users = await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, workingDays: true },
  });

  const onLeave = await prisma.leaveRequest.findMany({
    where: { status: 'APPROVED', startDate: { lte: date }, endDate: { gte: date } },
    select: { userId: true, isHalfDay: true },
  });
  const leaveMap = new Map(onLeave.map((l) => [l.userId, l.isHalfDay]));

  let closed = 0;
  let absent = 0;

  for (const user of users) {
    const workingDays = readNumberArray(user.workingDays, ctx.workingDays);
    const record = await prisma.attendance.findUnique({
      where: { userId_date: { userId: user.id, date } },
    });

    // Someone forgot to check out — close the day at shift end rather than
    // leaving an open-ended record.
    if (record?.checkInAt && !record.checkOutAt) {
      const shiftEnd = new Date(record.checkInAt);
      const [h, m] = settings.workEndTime.split(':').map(Number);
      shiftEnd.setHours(h, m, 0, 0);
      const end = shiftEnd > record.checkInAt ? shiftEnd : new Date(record.checkInAt.getTime() + 8 * 3_600_000);
      await prisma.attendance.update({
        where: { id: record.id },
        data: {
          checkOutAt: end,
          workedMinutes: minutesBetween(record.checkInAt, end),
          note: [record.note, 'Auto-closed at shift end'].filter(Boolean).join(' · '),
        },
      });
      closed += 1;
      continue;
    }
    if (record?.checkInAt) continue;

    let status = 'ABSENT';
    if (ctx.holidays.has(date)) status = 'HOLIDAY';
    else if (!workingDays.includes(dayOfWeek(date))) status = 'WEEKEND';
    else if (leaveMap.has(user.id)) status = leaveMap.get(user.id) ? 'HALF_DAY' : 'ON_LEAVE';

    await prisma.attendance.upsert({
      where: { userId_date: { userId: user.id, date } },
      create: { userId: user.id, date, status, workedMinutes: 0 },
      update: { status },
    });
    if (status === 'ABSENT') absent += 1;
  }

  return { closed, absent };
}
