import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../db';
import { handler, paginated, parse, skipTake } from '../lib/http';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { DATE_RE, addDays, todayInTz } from '../lib/dates';
import { writeJson } from '../lib/json';
import { EMPLOYMENT_TYPE, USER_STATUS, WORK_MODE } from '../constants';
import { authenticate, currentUser, requirePermission } from '../auth/middleware';
import { assertCanTouchUser, can, requireScope, visibleUserIds } from '../auth/rbac';
import { USER_INCLUDE, nextEmployeeCode, toUserDto } from '../services/user.service';
import { hashPassword, passwordProblems } from '../auth/password';
import { revokeAllRefreshTokens } from '../auth/tokens';
import { auditFromRequest } from '../services/audit.service';
import {
  ancestorIdsFromPath,
  buildOrgChart,
  isInReportingLine,
  rebuildAllPaths,
  rebuildSubtreePaths,
  setManager,
  subtreeUserIds,
} from '../services/hierarchy.service';
import { canHirePosition } from '../positions';
import { ensureBalances } from '../services/leave.service';
import { getSettings } from '../services/settings.service';
import { notify } from '../services/notification.service';

export const employeesRouter = Router();
employeesRouter.use(authenticate);

// ---------------------------------------------------------------------------
// Self-service profile (available to every role)
// ---------------------------------------------------------------------------

const selfUpdateSchema = z.object({
  phone: z.string().max(30).nullable().optional(),
  address: z.string().max(500).nullable().optional(),
  dateOfBirth: z.string().datetime().nullable().optional(),
  gender: z.string().max(30).nullable().optional(),
  emergencyContactName: z.string().max(120).nullable().optional(),
  emergencyContactPhone: z.string().max(30).nullable().optional(),
  avatarUrl: z.string().max(500).nullable().optional(),
});

employeesRouter.patch(
  '/me',
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = parse(selfUpdateSchema, req.body);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...body,
        dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : body.dateOfBirth,
      },
      include: USER_INCLUDE,
    });
    res.json({ data: toUserDto(updated) });
  }),
);

// ---------------------------------------------------------------------------
// Organisation hierarchy (CEO → Manager → Employee)
// ---------------------------------------------------------------------------

/**
 * The org chart, trimmed to what the caller may see. A Manager gets their own
 * branch, the CEO and HR get the whole tree.
 */
employeesRouter.get(
  '/org-chart',
  requirePermission('employee.hierarchy.read'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const q = parse(z.object({ rootId: z.string().optional() }), req.query);

    const scope = requireScope(user, 'employee.read');
    const visible = await visibleUserIds(user, scope);

    if (q.rootId && visible && !visible.includes(q.rootId)) {
      throw forbidden('That employee is outside your access scope');
    }

    const roots = await buildOrgChart(visible, q.rootId);
    res.json({ data: roots, scope, viewerId: user.id });
  }),
);

/** The chain of managers above an employee, closest last. */
employeesRouter.get(
  '/:id/reporting-line',
  handler(async (req, res) => {
    const user = currentUser(req);
    await assertCanTouchUser(user, 'employee.read', req.params.id);

    const employee = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: { id: true, hierarchyPath: true },
    });
    if (!employee) throw notFound('Employee');

    const ancestorIds = ancestorIdsFromPath(employee.hierarchyPath, employee.id);
    const managers = ancestorIds.length
      ? await prisma.user.findMany({
          where: { id: { in: ancestorIds } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeCode: true,
            designation: true,
            hierarchyDepth: true,
            role: { select: { key: true, name: true } },
          },
        })
      : [];

    const [directReports, totalReports] = await Promise.all([
      prisma.user.count({ where: { managerId: employee.id, status: 'ACTIVE' } }),
      subtreeUserIds(employee.id).then((ids) => Math.max(0, ids.length - 1)),
    ]);

    res.json({
      chain: managers.sort((a, b) => a.hierarchyDepth - b.hierarchyDepth),
      directReports,
      totalReports,
    });
  }),
);

/** Moves an employee under a different manager, rejecting loops. */
employeesRouter.post(
  '/:id/manager',
  requirePermission('employee.hierarchy.manage'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = parse(z.object({ managerId: z.string().nullable() }), req.body);
    await assertCanTouchUser(user, 'employee.read', req.params.id);
    if (body.managerId) await assertCanTouchUser(user, 'employee.read', body.managerId);

    await setManager(req.params.id, body.managerId);
    await auditFromRequest(req, {
      action: 'employee.set_manager',
      entity: 'User',
      entityId: req.params.id,
      meta: { managerId: body.managerId },
    });

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: req.params.id },
      include: USER_INCLUDE,
    });
    res.json({ data: toUserDto(updated) });
  }),
);

/** Repairs every materialised path — safe to run any time. */
employeesRouter.post(
  '/hierarchy/rebuild',
  requirePermission('employee.hierarchy.manage'),
  handler(async (_req, res) => {
    res.json({ updated: await rebuildAllPaths() });
  }),
);

/** Lightweight list for assignment dropdowns, limited to the caller's scope. */
employeesRouter.get(
  '/options',
  handler(async (req, res) => {
    const user = currentUser(req);
    const scope = requireScope(user, 'employee.read');
    const ids = await visibleUserIds(user, scope);

    const rows = await prisma.user.findMany({
      where: { status: 'ACTIVE', ...(ids ? { id: { in: ids } } : {}) },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        designation: true,
        department: { select: { id: true, name: true } },
      },
      orderBy: [{ firstName: 'asc' }],
    });

    res.json({
      data: rows.map((r) => ({
        id: r.id,
        name: `${r.firstName} ${r.lastName}`,
        employeeCode: r.employeeCode,
        designation: r.designation,
        department: r.department,
      })),
    });
  }),
);

// ---------------------------------------------------------------------------
// List / create
// ---------------------------------------------------------------------------

employeesRouter.get(
  '/',
  handler(async (req, res) => {
    const user = currentUser(req);
    const q = parse(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(200).default(20),
        search: z.string().optional(),
        departmentId: z.string().optional(),
        teamId: z.string().optional(),
        roleId: z.string().optional(),
        status: z.string().optional(),
      }),
      req.query,
    );

    const scope = requireScope(user, 'employee.read');
    const ids = await visibleUserIds(user, scope);

    const where: Prisma.UserWhereInput = {
      AND: [
        ids ? { id: { in: ids } } : {},
        q.departmentId ? { departmentId: q.departmentId } : {},
        q.roleId ? { roleId: q.roleId } : {},
        q.status ? { status: { in: q.status.split(',') } } : {},
        q.teamId ? { teamMemberships: { some: { teamId: q.teamId } } } : {},
        q.search
          ? {
              OR: [
                { firstName: { contains: q.search } },
                { lastName: { contains: q.search } },
                { email: { contains: q.search } },
                { employeeCode: { contains: q.search } },
                { designation: { contains: q.search } },
              ],
            }
          : {},
      ],
    };

    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: USER_INCLUDE,
        orderBy: [{ employeeCode: 'asc' }],
        ...skipTake(q.page, q.pageSize),
      }),
      prisma.user.count({ where }),
    ]);

    res.json(paginated(rows.map(toUserDto), total, q.page, q.pageSize));
  }),
);

const createSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email(),
  password: z.string().min(8).optional(),
  employeeCode: z.string().max(20).optional(),
  roleId: z.string().min(1),
  positionId: z.string().min(1),
  departmentId: z.string().optional(),
  managerId: z.string().optional(),
  teamIds: z.array(z.string()).optional(),
  designation: z.string().max(120).optional(),
  phone: z.string().max(30).optional(),
  employmentType: z.enum(EMPLOYMENT_TYPE).default('FULL_TIME'),
  workMode: z.enum(WORK_MODE).default('ONSITE'),
  dateOfJoining: z.string().datetime().optional(),
  shiftStart: z.string().optional(),
  shiftEnd: z.string().optional(),
  workingDays: z.array(z.number().int().min(0).max(6)).optional(),
});

employeesRouter.post(
  '/',
  requirePermission('employee.create'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = parse(createSchema, req.body);
    const settings = await getSettings();

    const role = await prisma.role.findUnique({ where: { id: body.roleId } });
    if (!role) throw notFound('Role');
    // Only a super admin may mint another super admin.
    if (role.key === 'SUPER_ADMIN' && !user.permissions.has('*')) {
      throw forbidden('Only a Super Admin can create Super Admin accounts');
    }

    // --- Position seniority -------------------------------------------------
    // You may only add someone strictly more junior than yourself. A Super
    // Admin is a system account rather than a position holder, so it bypasses
    // this — everyone else is bound by the catalogue.
    const candidatePosition = await prisma.position.findUnique({ where: { id: body.positionId } });
    if (!candidatePosition || !candidatePosition.isActive) throw notFound('Position');

    const isSystemAdmin = user.permissions.has('*');
    if (!isSystemAdmin) {
      const hirer = await prisma.user.findUnique({
        where: { id: user.id },
        select: { position: true },
      });
      const verdict = canHirePosition(hirer?.position ?? null, candidatePosition);
      if (!verdict.allowed) throw forbidden(verdict.reason!);
    }

    // Clean up empty string values from form submissions
    const cleanManagerId = body.managerId && body.managerId.trim() !== '' ? body.managerId : undefined;
    const cleanDepartmentId = body.departmentId && body.departmentId.trim() !== '' ? body.departmentId : undefined;
    const cleanDesignation = body.designation && body.designation.trim() !== '' ? body.designation : undefined;
    const cleanPhone = body.phone && body.phone.trim() !== '' ? body.phone : undefined;
    const cleanEmployeeCode = body.employeeCode && body.employeeCode.trim() !== '' ? body.employeeCode : undefined;

    // --- Reporting line -----------------------------------------------------
    // A system admin exists to build and repair the org tree, so they may place
    // anyone anywhere — including creating a root such as the CEO, who reports
    // to nobody. Everyone else places hires beneath themselves by default.
    const managerId = cleanManagerId ?? (isSystemAdmin ? null : user.id);

    if (managerId) {
      if (!isSystemAdmin && managerId !== user.id) {
        if (!(await isInReportingLine(user.id, managerId))) {
          throw forbidden('You can only add employees under yourself or someone in your reporting line');
        }
      }

      const manager = await prisma.user.findUnique({
        where: { id: managerId },
        select: { id: true, position: true, firstName: true, lastName: true },
      });
      if (!manager) throw badRequest('That manager does not exist');

      // The chosen manager must outrank the new hire, or the tree would have
      // someone reporting to a junior. Skipped for a system admin, who may be
      // seeding the top of the organisation.
      if (!isSystemAdmin && manager.position && candidatePosition.level <= manager.position.level) {
        throw badRequest(
          `${manager.firstName} ${manager.lastName} holds ${manager.position.title}, which is not senior to ${candidatePosition.title}. Pick a more senior manager.`,
        );
      }
    }

    const password = body.password?.trim() || 'TradeAmplification@123';
    const problems = passwordProblems(password);
    if (problems.length) throw badRequest(`Password needs ${problems.join(', ')}`);

    const created = await prisma.user.create({
      data: {
        employeeCode: cleanEmployeeCode ?? (await nextEmployeeCode()),
        email: body.email.toLowerCase().trim(),
        passwordHash: await hashPassword(password),
        firstName: body.firstName,
        lastName: body.lastName,
        phone: cleanPhone ?? null,
        roleId: body.roleId,
        positionId: candidatePosition.id,
        departmentId: cleanDepartmentId ?? candidatePosition.departmentId ?? null,
        managerId,
        hiredById: user.id,
        designation: cleanDesignation ?? candidatePosition.title,
        employmentType: body.employmentType,
        workMode: body.workMode,
        dateOfJoining: body.dateOfJoining ? new Date(body.dateOfJoining) : new Date(),
        shiftStart: body.shiftStart ?? settings.workStartTime,
        shiftEnd: body.shiftEnd ?? settings.workEndTime,
        workingDays: writeJson(body.workingDays ?? settings.workingDays),
        timezone: settings.timezone,
        mustChangePassword: !body.password,
      },
      include: USER_INCLUDE,
    });

    if (body.teamIds?.length) {
      await prisma.teamMember.createMany({
        data: body.teamIds.map((teamId) => ({ teamId, userId: created.id })),
      });
    }

    // Place the new hire in the reporting tree straight away, otherwise their
    // manager would not see them until the next rebuild.
    await rebuildSubtreePaths(created.id);
    await ensureBalances(created.id, new Date().getUTCFullYear());
    await notify({
      userId: created.id,
      type: 'ANNOUNCEMENT',
      title: 'Welcome aboard',
      body: 'Your account is ready. Your daily plan appears here every morning.',
      link: '/dashboard',
    });
    await auditFromRequest(req, {
      action: 'employee.create',
      entity: 'User',
      entityId: created.id,
      meta: { email: created.email, role: role.key },
    });

    res.status(201).json({
      data: toUserDto(created),
      // Surfaced once so the admin can hand it over; never stored in plain text.
      temporaryPassword: password,
      initialPassword: password,
    });
  }),
);

// ---------------------------------------------------------------------------
// Detail / update
// ---------------------------------------------------------------------------

employeesRouter.get(
  '/:id',
  handler(async (req, res) => {
    const user = currentUser(req);
    await assertCanTouchUser(user, 'employee.read', req.params.id);
    const employee = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: USER_INCLUDE,
    });
    if (!employee) throw notFound('Employee');

    const [taskStats, leaveBalances] = await Promise.all([
      prisma.task.groupBy({
        by: ['status'],
        where: { assigneeId: employee.id },
        _count: { _all: true },
      }),
      prisma.leaveBalance.findMany({
        where: { userId: employee.id, year: new Date().getUTCFullYear() },
        include: { leaveType: { select: { name: true, code: true, color: true } } },
      }),
    ]);

    res.json({
      data: toUserDto(employee),
      taskStats: Object.fromEntries(taskStats.map((s) => [s.status, s._count._all])),
      leaveBalances,
    });
  }),
);

const adminUpdateSchema = createSchema.partial().omit({ password: true, email: true }).extend({
  email: z.string().email().optional(),
  status: z.enum(USER_STATUS).optional(),
});

employeesRouter.patch(
  '/:id',
  requirePermission('employee.update.all'),
  handler(async (req, res) => {
    const user = currentUser(req);
    await assertCanTouchUser(user, 'employee.read', req.params.id);
    const body = parse(adminUpdateSchema, req.body);

    if (body.roleId) {
      const role = await prisma.role.findUnique({ where: { id: body.roleId } });
      if (role?.key === 'SUPER_ADMIN' && !user.permissions.has('*')) {
        throw forbidden('Only a Super Admin can grant the Super Admin role');
      }
    }
    const { teamIds, workingDays, dateOfJoining, managerId, ...rest } = body;

    // Reporting-line changes go through the hierarchy service so the
    // materialised paths stay correct and loops are rejected.
    if (managerId !== undefined) {
      await setManager(req.params.id, managerId ?? null);
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...rest,
        ...(dateOfJoining ? { dateOfJoining: new Date(dateOfJoining) } : {}),
        ...(workingDays ? { workingDays: writeJson(workingDays) } : {}),
      },
      include: USER_INCLUDE,
    });

    if (teamIds) {
      await prisma.teamMember.deleteMany({ where: { userId: updated.id } });
      if (teamIds.length) {
        await prisma.teamMember.createMany({
          data: teamIds.map((teamId) => ({ teamId, userId: updated.id })),
        });
      }
    }

    await auditFromRequest(req, {
      action: 'employee.update',
      entity: 'User',
      entityId: updated.id,
      meta: body,
    });
    res.json({ data: toUserDto(updated) });
  }),
);

employeesRouter.post(
  '/:id/status',
  requirePermission('employee.deactivate'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = parse(z.object({ status: z.enum(USER_STATUS) }), req.body);
    if (req.params.id === user.id) throw badRequest('You cannot change your own account status');

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        status: body.status,
        deactivatedAt: body.status === 'ACTIVE' ? null : new Date(),
      },
      include: USER_INCLUDE,
    });
    // A deactivated account must lose its live sessions immediately.
    if (body.status !== 'ACTIVE') await revokeAllRefreshTokens(updated.id);

    await auditFromRequest(req, {
      action: 'employee.status',
      entity: 'User',
      entityId: updated.id,
      meta: body,
    });
    res.json({ data: toUserDto(updated) });
  }),
);

employeesRouter.delete(
  '/:id',
  requirePermission('employee.deactivate'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const targetId = req.params.id;
    if (targetId === user.id) throw badRequest('You cannot delete your own account');
    await assertCanTouchUser(user, 'employee.read', targetId);

    const employee = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, firstName: true, lastName: true, email: true, managerId: true },
    });
    if (!employee) throw notFound('Employee');

    // Reassign direct reports to the deleted employee's manager
    await prisma.user.updateMany({
      where: { managerId: targetId },
      data: { managerId: employee.managerId ?? null },
    });

    // Revoke tokens and sessions
    await revokeAllRefreshTokens(targetId);

    // Clean up dependent child records
    await prisma.teamMember.deleteMany({ where: { userId: targetId } });
    await prisma.userSession.deleteMany({ where: { userId: targetId } });
    await prisma.notification.deleteMany({ where: { userId: targetId } });
    await prisma.leaveBalance.deleteMany({ where: { userId: targetId } });
    await prisma.leaveRequest.deleteMany({ where: { userId: targetId } });
    await prisma.attendance.deleteMany({ where: { userId: targetId } });
    await prisma.dailyWorkRecord.deleteMany({ where: { userId: targetId } });
    await prisma.sod.deleteMany({ where: { userId: targetId } });
    await prisma.eod.deleteMany({ where: { userId: targetId } });
    await prisma.task.updateMany({ where: { assigneeId: targetId }, data: { assigneeId: null } });

    await prisma.user.delete({ where: { id: targetId } });

    await auditFromRequest(req, {
      action: 'employee.delete',
      entity: 'User',
      entityId: targetId,
      meta: { email: employee.email, name: `${employee.firstName} ${employee.lastName}` },
    });

    res.json({ ok: true, message: 'Employee deleted successfully' });
  }),
);

employeesRouter.post(
  '/:id/reset-password',
  requirePermission('employee.resetPassword'),
  handler(async (req, res) => {
    const body = parse(z.object({ newPassword: z.string().min(8) }), req.body);
    const problems = passwordProblems(body.newPassword);
    if (problems.length) throw badRequest(`Password needs ${problems.join(', ')}`);

    await prisma.user.update({
      where: { id: req.params.id },
      data: { passwordHash: await hashPassword(body.newPassword), mustChangePassword: true },
    });
    await revokeAllRefreshTokens(req.params.id);
    await auditFromRequest(req, {
      action: 'employee.reset_password',
      entity: 'User',
      entityId: req.params.id,
    });

    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Work history — Employee → Date → SOD → Tasks → EOD → Review
// ---------------------------------------------------------------------------

employeesRouter.get(
  '/:id/work-history',
  handler(async (req, res) => {
    const user = currentUser(req);
    await assertCanTouchUser(user, 'eod.read', req.params.id);
    const settings = await getSettings();
    const today = todayInTz(settings.timezone);

    const q = parse(
      z.object({
        from: z.string().regex(DATE_RE).default(addDays(today, -13)),
        to: z.string().regex(DATE_RE).default(today),
      }),
      req.query,
    );

    const userId = req.params.id;
    const range = { gte: q.from, lte: q.to };

    const [sods, eods, attendance, employee] = await Promise.all([
      prisma.sod.findMany({
        where: { userId, date: range },
        include: { items: { select: { id: true, titleSnapshot: true, taskId: true, plannedOutcome: true } } },
      }),
      prisma.eod.findMany({
        where: { userId, date: range },
        include: {
          items: {
            select: {
              id: true,
              titleSnapshot: true,
              category: true,
              statusAtEod: true,
              progressAtEod: true,
              hoursSpent: true,
              taskId: true,
            },
          },
          reviewedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.attendance.findMany({ where: { userId, date: range } }),
      prisma.user.findUnique({ where: { id: userId }, include: USER_INCLUDE }),
    ]);

    if (!employee) throw notFound('Employee');

    const sodByDate = new Map(sods.map((s) => [s.date, s]));
    const eodByDate = new Map(eods.map((e) => [e.date, e]));
    const attByDate = new Map(attendance.map((a) => [a.date, a]));

    const dates = new Set([...sodByDate.keys(), ...eodByDate.keys(), ...attByDate.keys()]);
    const days = [...dates]
      .sort((a, b) => (a < b ? 1 : -1))
      .map((date) => {
        const eod = eodByDate.get(date);
        return {
          date,
          attendance: attByDate.get(date) ?? null,
          sod: sodByDate.get(date) ?? null,
          eod: eod ?? null,
          summary: {
            planned: sodByDate.get(date)?.items.length ?? 0,
            completed: eod?.items.filter((i) => i.category === 'COMPLETED').length ?? 0,
            pending: eod?.items.filter((i) => i.category === 'PENDING').length ?? 0,
            blocked: eod?.items.filter((i) => i.category === 'BLOCKED').length ?? 0,
            hours: eod?.totalHours ?? null,
            reviewStatus: eod?.status ?? 'NONE',
          },
        };
      });

    res.json({ employee: toUserDto(employee), from: q.from, to: q.to, days });
  }),
);

/** Anyone with wide employee visibility can pull the reporting tree. */
employeesRouter.get(
  '/:id/reports',
  handler(async (req, res) => {
    const user = currentUser(req);
    if (!can(user, 'employee.read.all') && !can(user, 'employee.read.department')) {
      throw forbidden('Missing permission: employee.read');
    }
    const reports = await prisma.user.findMany({
      where: { managerId: req.params.id, status: 'ACTIVE' },
      include: USER_INCLUDE,
    });
    res.json({ data: reports.map(toUserDto) });
  }),
);
