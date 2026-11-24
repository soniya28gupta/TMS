import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { handler, paginated, parse, skipTake } from '../lib/http';
import { DATE_RE, addDays, minutesToHours, todayInTz } from '../lib/dates';
import { notFound } from '../lib/errors';
import { ATTENDANCE_STATUS } from '../constants';
import { authenticate, currentUser, requirePermission } from '../auth/middleware';
import { assertCanTouchUser, userScopeFilter } from '../auth/rbac';
import { checkIn, checkOut, todayAttendance } from '../services/attendance.service';
import { canSeeCoordinates, redactLocation } from '../services/geo.service';
import { getSettings } from '../services/settings.service';
import { clientIp, auditFromRequest } from '../services/audit.service';
import { notify, notifyMany, supervisorsOf } from '../services/notification.service';

export const attendanceRouter = Router();
attendanceRouter.use(authenticate);

attendanceRouter.get(
  '/today',
  handler(async (req, res) => {
    const user = currentUser(req);
    const [record, settings] = await Promise.all([todayAttendance(user.id), getSettings()]);
    res.json({
      data: record,
      today: todayInTz(settings.timezone),
      canCheckIn: !record?.checkInAt,
      canCheckOut: !!record?.checkInAt && !record?.checkOutAt,
    });
  }),
);

const positionSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().nonnegative().optional(),
  address: z.string().max(250).optional(),
});

attendanceRouter.post(
  '/check-in',
  requirePermission('attendance.mark'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = parse(
      z.object({
        workMode: z.string().optional(),
        note: z.string().max(300).optional(),
        position: positionSchema.optional(),
      }),
      req.body ?? {},
    );
    const record = await checkIn(user.id, { ip: clientIp(req), ...body });
    res.json({ data: record, locationCaptured: record.checkInLatitude !== null });
  }),
);

attendanceRouter.post(
  '/check-out',
  requirePermission('attendance.mark'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = parse(
      z.object({ note: z.string().max(300).optional(), position: positionSchema.optional() }),
      req.body ?? {},
    );
    const record = await checkOut(user.id, { ip: clientIp(req), ...body });
    const workedHours =
      record.workedMinutes > 0
        ? minutesToHours(record.workedMinutes)
        : record.checkInAt && record.checkOutAt
          ? Math.max(0.01, Math.round(((record.checkOutAt.getTime() - record.checkInAt.getTime()) / 3600000) * 100) / 100)
          : 0;
    res.json({
      data: record,
      workedHours,
      locationCaptured: record.checkOutLatitude !== null,
    });
  }),
);

attendanceRouter.get(
  '/',
  handler(async (req, res) => {
    const user = currentUser(req);
    const settings = await getSettings();
    const today = todayInTz(settings.timezone);
    const q = parse(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(31),
        userId: z.string().optional(),
        from: z.string().regex(DATE_RE).default(addDays(today, -30)),
        to: z.string().regex(DATE_RE).default(today),
        status: z.string().optional(),
      }),
      req.query,
    );

    const scopeWhere = q.userId
      ? (await assertCanTouchUser(user, 'attendance.read', q.userId), { userId: q.userId })
      : await userScopeFilter(user, 'attendance.read');

    const where = {
      ...scopeWhere,
      date: { gte: q.from, lte: q.to },
      ...(q.status && q.status.trim() ? { status: { in: q.status.split(',').filter(Boolean) } } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.attendance.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        },
        orderBy: [{ date: 'desc' }],
        ...skipTake(q.page, q.pageSize),
      }),
      prisma.attendance.count({ where }),
    ]);

    const summary = await prisma.attendance.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
      _sum: { workedMinutes: true },
    });

    // Coordinates are stripped for anyone without location rights over that
    // employee; the "was it captured / inside the geofence" signals survive.
    const visible = rows.map((row) =>
      redactLocation(row as unknown as Record<string, unknown>, canSeeCoordinates(user, row.userId, true)),
    );

    res.json({
      ...paginated(visible, total, q.page, q.pageSize),
      summary: Object.fromEntries(
        summary.map((s) => [s.status, { count: s._count._all, minutes: s._sum.workedMinutes ?? 0 }]),
      ),
    });
  }),
);

/** Admin edit of a single day (manual entry / fixing a bad punch). */
attendanceRouter.patch(
  '/:id',
  requirePermission('attendance.manage'),
  handler(async (req, res) => {
    const body = parse(
      z.object({
        checkInAt: z.string().datetime().nullable().optional(),
        checkOutAt: z.string().datetime().nullable().optional(),
        status: z.enum(ATTENDANCE_STATUS).optional(),
        note: z.string().max(300).optional(),
      }),
      req.body,
    );

    const existing = await prisma.attendance.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Attendance record');

    const checkInAt = body.checkInAt === undefined ? existing.checkInAt : body.checkInAt ? new Date(body.checkInAt) : null;
    const checkOutAt = body.checkOutAt === undefined ? existing.checkOutAt : body.checkOutAt ? new Date(body.checkOutAt) : null;
    const workedMinutes =
      checkInAt && checkOutAt
        ? Math.max(0, Math.round((checkOutAt.getTime() - checkInAt.getTime()) / 60000))
        : 0;

    const updated = await prisma.attendance.update({
      where: { id: req.params.id },
      data: {
        checkInAt,
        checkOutAt,
        workedMinutes,
        status: body.status ?? existing.status,
        note: body.note ?? existing.note,
        isManual: true,
      },
    });
    await auditFromRequest(req, {
      action: 'attendance.manual_edit',
      entity: 'Attendance',
      entityId: updated.id,
      meta: body,
    });
    res.json({ data: updated });
  }),
);

// ---------------------------------------------------------------------------
// Correction requests
// ---------------------------------------------------------------------------

attendanceRouter.post(
  '/corrections',
  requirePermission('attendance.correction.request'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = parse(
      z.object({
        date: z.string().regex(DATE_RE),
        requestedCheckIn: z.string().datetime().optional(),
        requestedCheckOut: z.string().datetime().optional(),
        requestedStatus: z.enum(ATTENDANCE_STATUS).optional(),
        reason: z.string().min(5).max(1000),
      }),
      req.body,
    );

    const attendance = await prisma.attendance.findUnique({
      where: { userId_date: { userId: user.id, date: body.date } },
    });

    const request = await prisma.attendanceCorrection.create({
      data: {
        userId: user.id,
        attendanceId: attendance?.id ?? null,
        date: body.date,
        requestedCheckIn: body.requestedCheckIn ? new Date(body.requestedCheckIn) : null,
        requestedCheckOut: body.requestedCheckOut ? new Date(body.requestedCheckOut) : null,
        requestedStatus: body.requestedStatus ?? null,
        reason: body.reason,
      },
    });

    await notifyMany(await supervisorsOf(user.id), {
      type: 'ATTENDANCE_CORRECTION_REQUESTED',
      title: `Attendance correction requested by ${user.firstName} ${user.lastName}`,
      body: `${body.date} · ${body.reason.slice(0, 120)}`,
      link: '/admin/attendance',
      email: true,
    });

    res.status(201).json({ data: request });
  }),
);

attendanceRouter.get(
  '/corrections/list',
  handler(async (req, res) => {
    const user = currentUser(req);
    const q = parse(
      z.object({
        status: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
      }),
      req.query,
    );

    const scopeWhere = await userScopeFilter(user, 'attendance.read');
    const where = { ...scopeWhere, ...(q.status ? { status: { in: q.status.split(',') } } : {}) };

    const [rows, total] = await Promise.all([
      prisma.attendanceCorrection.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
          reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: [{ createdAt: 'desc' }],
        ...skipTake(q.page, q.pageSize),
      }),
      prisma.attendanceCorrection.count({ where }),
    ]);

    res.json(paginated(rows, total, q.page, q.pageSize));
  }),
);

attendanceRouter.post(
  '/corrections/:id/decide',
  requirePermission('attendance.correction.review'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = parse(
      z.object({
        action: z.enum(['APPROVE', 'REJECT']),
        note: z.string().max(1000).optional(),
      }),
      req.body,
    );

    const request = await prisma.attendanceCorrection.findUnique({ where: { id: req.params.id } });
    if (!request) throw notFound('Correction request');
    await assertCanTouchUser(user, 'attendance.read', request.userId);

    const approved = body.action === 'APPROVE';
    const updated = await prisma.attendanceCorrection.update({
      where: { id: request.id },
      data: {
        status: approved ? 'APPROVED' : 'REJECTED',
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote: body.note ?? null,
      },
    });

    if (approved) {
      const workedMinutes =
        request.requestedCheckIn && request.requestedCheckOut
          ? Math.max(
              0,
              Math.round(
                (request.requestedCheckOut.getTime() - request.requestedCheckIn.getTime()) / 60000,
              ),
            )
          : 0;
      await prisma.attendance.upsert({
        where: { userId_date: { userId: request.userId, date: request.date } },
        create: {
          userId: request.userId,
          date: request.date,
          checkInAt: request.requestedCheckIn,
          checkOutAt: request.requestedCheckOut,
          workedMinutes,
          status: request.requestedStatus ?? 'PRESENT',
          isManual: true,
          note: 'Corrected on request',
        },
        update: {
          checkInAt: request.requestedCheckIn ?? undefined,
          checkOutAt: request.requestedCheckOut ?? undefined,
          workedMinutes: workedMinutes || undefined,
          status: request.requestedStatus ?? undefined,
          isManual: true,
        },
      });
    }

    await notify({
      userId: request.userId,
      type: 'ATTENDANCE_CORRECTION_REVIEWED',
      title: `Attendance correction ${approved ? 'approved' : 'rejected'} (${request.date})`,
      body: body.note,
      link: '/attendance',
      severity: approved ? 'INFO' : 'WARNING',
      email: true,
    });

    res.json({ data: updated });
  }),
);
