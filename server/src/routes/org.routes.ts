import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { handler, paginated, parse, skipTake } from '../lib/http';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { DATE_RE } from '../lib/dates';
import { ALL_PERMISSIONS, LOCATION_PRECISION, PERMISSION_CATALOGUE } from '../constants';
import { authenticate, currentUser, requirePermission } from '../auth/middleware';
import { can } from '../auth/rbac';
import { getSettings, updateSettings } from '../services/settings.service';
import { auditFromRequest } from '../services/audit.service';

export const orgRouter = Router();
orgRouter.use(authenticate);

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

orgRouter.get(
  '/departments',
  handler(async (_req, res) => {
    const rows = await prisma.department.findMany({
      include: {
        head: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { users: true, teams: true } },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ data: rows });
  }),
);

orgRouter.post(
  '/departments',
  requirePermission('org.manage'),
  handler(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().min(2).max(80),
        code: z.string().min(2).max(10),
        description: z.string().max(500).optional(),
        headId: z.string().optional(),
      }),
      req.body,
    );
    const created = await prisma.department.create({ data: { ...body, code: body.code.toUpperCase() } });
    await auditFromRequest(req, { action: 'department.create', entity: 'Department', entityId: created.id });
    res.status(201).json({ data: created });
  }),
);

orgRouter.patch(
  '/departments/:id',
  requirePermission('org.manage'),
  handler(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().min(2).max(80).optional(),
        description: z.string().max(500).nullable().optional(),
        headId: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
      }),
      req.body,
    );
    const updated = await prisma.department.update({ where: { id: req.params.id }, data: body });
    res.json({ data: updated });
  }),
);

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

orgRouter.get(
  '/teams',
  handler(async (req, res) => {
    const q = parse(z.object({ departmentId: z.string().optional() }), req.query);
    const rows = await prisma.team.findMany({
      where: q.departmentId ? { departmentId: q.departmentId } : {},
      include: {
        department: { select: { id: true, name: true } },
        leader: { select: { id: true, firstName: true, lastName: true } },
        members: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
    res.json({ data: rows });
  }),
);

orgRouter.post(
  '/teams',
  requirePermission('org.manage'),
  handler(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().min(2).max(80),
        departmentId: z.string().min(1),
        description: z.string().max(500).optional(),
        leaderId: z.string().optional(),
        memberIds: z.array(z.string()).optional(),
      }),
      req.body,
    );

    const { memberIds, ...data } = body;
    const created = await prisma.team.create({ data });
    if (memberIds?.length) {
      await prisma.teamMember.createMany({
        data: memberIds.map((userId) => ({ teamId: created.id, userId })),
      });
    }
    await auditFromRequest(req, { action: 'team.create', entity: 'Team', entityId: created.id });
    res.status(201).json({ data: created });
  }),
);

orgRouter.patch(
  '/teams/:id',
  requirePermission('org.manage'),
  handler(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().min(2).max(80).optional(),
        description: z.string().max(500).nullable().optional(),
        leaderId: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
        memberIds: z.array(z.string()).optional(),
      }),
      req.body,
    );

    const { memberIds, ...data } = body;
    const updated = await prisma.team.update({ where: { id: req.params.id }, data });
    if (memberIds) {
      await prisma.teamMember.deleteMany({ where: { teamId: updated.id } });
      if (memberIds.length) {
        await prisma.teamMember.createMany({
          data: memberIds.map((userId) => ({ teamId: updated.id, userId })),
        });
      }
    }
    res.json({ data: updated });
  }),
);

// ---------------------------------------------------------------------------
// Roles & permissions
// ---------------------------------------------------------------------------

orgRouter.get(
  '/roles',
  handler(async (_req, res) => {
    const roles = await prisma.role.findMany({
      include: { permissions: true, _count: { select: { users: true } } },
      orderBy: { rank: 'asc' },
    });
    res.json({
      data: roles.map((role) => ({
        id: role.id,
        key: role.key,
        name: role.name,
        description: role.description,
        portal: role.portal,
        rank: role.rank,
        isSystem: role.isSystem,
        userCount: role._count.users,
        permissions: role.permissions.map((p) => p.permission),
      })),
      catalogue: PERMISSION_CATALOGUE,
    });
  }),
);

orgRouter.post(
  '/roles',
  requirePermission('role.manage'),
  handler(async (req, res) => {
    const body = parse(
      z.object({
        key: z.string().min(2).max(40).regex(/^[A-Z0-9_]+$/, 'Use UPPER_SNAKE_CASE'),
        name: z.string().min(2).max(60),
        description: z.string().max(300).optional(),
        portal: z.enum(['ADMIN', 'EMPLOYEE']),
        rank: z.number().int().min(0).max(999).default(50),
        permissions: z.array(z.string()).default([]),
      }),
      req.body,
    );

    const invalid = body.permissions.filter((p) => p !== '*' && !ALL_PERMISSIONS.includes(p));
    if (invalid.length) throw badRequest(`Unknown permissions: ${invalid.join(', ')}`);

    const role = await prisma.role.create({
      data: {
        key: body.key,
        name: body.name,
        description: body.description,
        portal: body.portal,
        rank: body.rank,
        permissions: { create: body.permissions.map((permission) => ({ permission })) },
      },
    });
    await auditFromRequest(req, { action: 'role.create', entity: 'Role', entityId: role.id });
    res.status(201).json({ data: role });
  }),
);

orgRouter.patch(
  '/roles/:id',
  requirePermission('role.manage'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = parse(
      z.object({
        name: z.string().min(2).max(60).optional(),
        description: z.string().max(300).nullable().optional(),
        rank: z.number().int().min(0).max(999).optional(),
        permissions: z.array(z.string()).optional(),
      }),
      req.body,
    );

    const role = await prisma.role.findUnique({ where: { id: req.params.id } });
    if (!role) throw notFound('Role');
    // The super-admin role must keep its wildcard, or the system can lock itself out.
    if (role.key === 'SUPER_ADMIN' && body.permissions && !body.permissions.includes('*')) {
      throw forbidden('The Super Admin role must keep full access');
    }
    if (body.permissions) {
      const invalid = body.permissions.filter((p) => p !== '*' && !ALL_PERMISSIONS.includes(p));
      if (invalid.length) throw badRequest(`Unknown permissions: ${invalid.join(', ')}`);
    }

    const updated = await prisma.role.update({
      where: { id: role.id },
      data: {
        name: body.name,
        description: body.description,
        rank: body.rank,
        ...(body.permissions
          ? {
              permissions: {
                deleteMany: {},
                create: body.permissions.map((permission) => ({ permission })),
              },
            }
          : {}),
      },
      include: { permissions: true },
    });

    await auditFromRequest(req, {
      action: 'role.update',
      entity: 'Role',
      entityId: role.id,
      meta: { by: user.email, permissions: body.permissions?.length },
    });
    res.json({ data: { ...updated, permissions: updated.permissions.map((p) => p.permission) } });
  }),
);

orgRouter.delete(
  '/roles/:id',
  requirePermission('role.manage'),
  handler(async (req, res) => {
    const role = await prisma.role.findUnique({
      where: { id: req.params.id },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw notFound('Role');
    if (role.isSystem) throw forbidden('System roles cannot be deleted');
    if (role._count.users > 0) throw badRequest('Move the assigned employees to another role first');

    await prisma.role.delete({ where: { id: role.id } });
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Holidays & leave types
// ---------------------------------------------------------------------------

orgRouter.post(
  '/holidays',
  requirePermission('holiday.manage'),
  handler(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().min(2).max(80),
        date: z.string().regex(DATE_RE),
        isOptional: z.boolean().default(false),
        description: z.string().max(300).optional(),
      }),
      req.body,
    );
    const created = await prisma.holiday.create({ data: body });
    res.status(201).json({ data: created });
  }),
);

orgRouter.delete(
  '/holidays/:id',
  requirePermission('holiday.manage'),
  handler(async (req, res) => {
    await prisma.holiday.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }),
);

orgRouter.get(
  '/leave-types',
  requirePermission('leave.manage'),
  handler(async (_req, res) => {
    res.json({ data: await prisma.leaveType.findMany({ orderBy: { name: 'asc' } }) });
  }),
);

orgRouter.post(
  '/leave-types',
  requirePermission('leave.manage'),
  handler(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().min(2).max(60),
        code: z.string().min(1).max(10),
        defaultDays: z.number().min(0).max(365).default(0),
        isPaid: z.boolean().default(true),
        allowHalfDay: z.boolean().default(true),
        carryForward: z.boolean().default(false),
        maxCarryForward: z.number().min(0).max(365).default(0),
        color: z.string().max(20).default('#3b82f6'),
      }),
      req.body,
    );
    const created = await prisma.leaveType.create({ data: { ...body, code: body.code.toUpperCase() } });
    res.status(201).json({ data: created });
  }),
);

orgRouter.patch(
  '/leave-types/:id',
  requirePermission('leave.manage'),
  handler(async (req, res) => {
    const body = parse(
      z.object({
        name: z.string().min(2).max(60).optional(),
        defaultDays: z.number().min(0).max(365).optional(),
        isPaid: z.boolean().optional(),
        allowHalfDay: z.boolean().optional(),
        carryForward: z.boolean().optional(),
        maxCarryForward: z.number().min(0).max(365).optional(),
        color: z.string().max(20).optional(),
        isActive: z.boolean().optional(),
      }),
      req.body,
    );
    res.json({ data: await prisma.leaveType.update({ where: { id: req.params.id }, data: body }) });
  }),
);

/** Adjust an employee's entitlement for a leave year. */
orgRouter.post(
  '/leave-balances',
  requirePermission('leave.manage'),
  handler(async (req, res) => {
    const body = parse(
      z.object({
        userId: z.string().min(1),
        leaveTypeId: z.string().min(1),
        year: z.number().int(),
        entitled: z.number().min(0).max(365).optional(),
        carriedForward: z.number().min(0).max(365).optional(),
      }),
      req.body,
    );

    const updated = await prisma.leaveBalance.upsert({
      where: {
        userId_leaveTypeId_year: {
          userId: body.userId,
          leaveTypeId: body.leaveTypeId,
          year: body.year,
        },
      },
      create: {
        userId: body.userId,
        leaveTypeId: body.leaveTypeId,
        year: body.year,
        entitled: body.entitled ?? 0,
        carriedForward: body.carriedForward ?? 0,
      },
      update: { entitled: body.entitled, carriedForward: body.carriedForward },
    });
    await auditFromRequest(req, { action: 'leave.balance_adjust', entity: 'LeaveBalance', entityId: updated.id, meta: body });
    res.json({ data: updated });
  }),
);

// ---------------------------------------------------------------------------
// Settings & audit
// ---------------------------------------------------------------------------

orgRouter.get(
  '/settings',
  requirePermission('settings.read'),
  handler(async (_req, res) => {
    res.json({ data: await getSettings() });
  }),
);

orgRouter.patch(
  '/settings',
  requirePermission('settings.manage'),
  handler(async (req, res) => {
    const body = parse(
      z.object({
        companyName: z.string().min(1).max(120).optional(),
        timezone: z.string().min(1).max(60).optional(),
        workingDays: z.array(z.number().int().min(0).max(6)).optional(),
        workStartTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        workEndTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        lateGraceMinutes: z.number().int().min(0).max(240).optional(),
        halfDayAfterMinutes: z.number().int().min(0).max(1440).optional(),
        fullDayMinutes: z.number().int().min(0).max(1440).optional(),
        sodGenerateTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        sodReminderTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        eodReminderTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        eodMissingCheckTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        dayCloseTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
        autoAcceptTasks: z.boolean().optional(),
        requireEodReview: z.boolean().optional(),
        emailNotificationsEnabled: z.boolean().optional(),
        leaveYearStartMonth: z.number().int().min(1).max(12).optional(),
        // Privacy policy fields need the dedicated permission, checked below.
        locationTrackingEnabled: z.boolean().optional(),
        locationPrecision: z.enum(LOCATION_PRECISION).optional(),
        locationRetentionDays: z.number().int().min(1).max(3650).optional(),
        sessionRetentionDays: z.number().int().min(1).max(3650).optional(),
        locationConsentVersion: z.string().min(1).max(20).optional(),
        officeLatitude: z.number().min(-90).max(90).optional(),
        officeLongitude: z.number().min(-180).max(180).optional(),
        officeRadiusMeters: z.number().int().min(0).max(100_000).optional(),
        sessionIdleTimeoutMinutes: z.number().int().min(5).max(20_160).optional(),
      }),
      req.body,
    );

    const PRIVACY_KEYS = [
      'locationTrackingEnabled',
      'locationPrecision',
      'locationRetentionDays',
      'sessionRetentionDays',
      'locationConsentVersion',
      'officeLatitude',
      'officeLongitude',
      'officeRadiusMeters',
    ];
    const touchesPrivacy = PRIVACY_KEYS.some((key) => key in body);
    if (touchesPrivacy && !can(currentUser(req), 'privacy.manage')) {
      throw forbidden('Missing permission: privacy.manage');
    }

    const updated = await updateSettings(body);
    await auditFromRequest(req, { action: 'settings.update', entity: 'Setting', meta: body });
    // Cron expressions are rebuilt from settings on the next tick.
    res.json({ data: updated, note: 'Reminder schedules apply from the next scheduler cycle.' });
  }),
);

orgRouter.get(
  '/audit',
  requirePermission('audit.read'),
  handler(async (req, res) => {
    const q = parse(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(50),
        entity: z.string().optional(),
        action: z.string().optional(),
        actorId: z.string().optional(),
      }),
      req.query,
    );

    const where = {
      ...(q.entity ? { entity: q.entity } : {}),
      ...(q.action ? { action: { contains: q.action } } : {}),
      ...(q.actorId ? { actorId: q.actorId } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        ...skipTake(q.page, q.pageSize),
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json(paginated(rows, total, q.page, q.pageSize));
  }),
);
