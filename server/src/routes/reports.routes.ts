import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { handler, parse } from '../lib/http';
import { DATE_RE, addDays, formatDisplayDate, minutesToHours, todayInTz } from '../lib/dates';
import { CLOSED_TASK_STATUSES } from '../constants';
import { authenticate, currentUser, requirePermission } from '../auth/middleware';
import { can, requireScope, visibleUserIds } from '../auth/rbac';
import { getSettings } from '../services/settings.service';
import { sendExport, type Column, type Row } from '../services/export.service';
import { forbidden } from '../lib/errors';

export const reportsRouter = Router();
reportsRouter.use(authenticate);

const baseQuery = z.object({
  from: z.string().regex(DATE_RE).optional(),
  to: z.string().regex(DATE_RE).optional(),
  departmentId: z.string().optional(),
  teamId: z.string().optional(),
  employeeId: z.string().optional(),
  format: z.enum(['json', 'xlsx', 'csv', 'pdf']).default('json'),
});

type ReportScope = {
  from: string;
  to: string;
  userIds: string[];
  format: string;
  label: string;
};

/** Resolves the employee set and date window a report should cover. */
async function resolveScope(req: Request): Promise<ReportScope> {
  const user = currentUser(req);
  const settings = await getSettings();
  const today = todayInTz(settings.timezone);
  const q = parse(baseQuery, req.query);

  if (q.format !== 'json' && !can(user, 'report.export')) {
    throw forbidden('Missing permission: report.export');
  }

  const scope = requireScope(user, 'report.read');
  const allowed = await visibleUserIds(user, scope);

  const people = await prisma.user.findMany({
    where: {
      ...(allowed ? { id: { in: allowed } } : {}),
      ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.teamId ? { teamMemberships: { some: { teamId: q.teamId } } } : {}),
      ...(q.employeeId ? { id: q.employeeId } : {}),
    },
    select: { id: true },
  });

  const from = q.from ?? addDays(today, -29);
  const to = q.to ?? today;

  return {
    from,
    to,
    userIds: people.map((p) => p.id),
    format: q.format,
    label: `${formatDisplayDate(from)} – ${formatDisplayDate(to)}`,
  };
}

async function respond(
  res: Response,
  scope: ReportScope,
  payload: { title: string; columns: Column[]; rows: Row[]; summary?: Record<string, unknown> },
): Promise<void> {
  if (scope.format !== 'json') {
    await sendExport(res, scope.format, { ...payload, subtitle: scope.label });
    return;
  }
  res.json({ ...payload, period: { from: scope.from, to: scope.to }, generatedAt: new Date() });
}

// ---------------------------------------------------------------------------
// Employee task report
// ---------------------------------------------------------------------------

reportsRouter.get(
  '/tasks',
  handler(async (req, res) => {
    const scope = await resolveScope(req);
    const window = {
      gte: new Date(`${scope.from}T00:00:00.000Z`),
      lte: new Date(`${scope.to}T23:59:59.999Z`),
    };

    const employees = await prisma.user.findMany({
      where: { id: { in: scope.userIds } },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        department: { select: { name: true } },
      },
      orderBy: { employeeCode: 'asc' },
    });

    const rows: Row[] = [];
    for (const employee of employees) {
      const [assigned, completed, onTime, overdue, blocked, inReview, hours] = await Promise.all([
        prisma.task.count({ where: { assigneeId: employee.id, createdAt: window } }),
        prisma.task.count({ where: { assigneeId: employee.id, status: 'COMPLETED', completedAt: window } }),
        prisma.task.count({
          where: { assigneeId: employee.id, status: 'COMPLETED', completedAt: window, isOverdue: false },
        }),
        prisma.task.count({
          where: { assigneeId: employee.id, isOverdue: true, status: { notIn: CLOSED_TASK_STATUSES } },
        }),
        prisma.task.count({ where: { assigneeId: employee.id, status: 'BLOCKED' } }),
        prisma.task.count({ where: { assigneeId: employee.id, status: 'SUBMITTED_FOR_REVIEW' } }),
        prisma.task.aggregate({
          where: { assigneeId: employee.id, completedAt: window },
          _sum: { actualHours: true },
        }),
      ]);

      rows.push({
        employeeCode: employee.employeeCode,
        name: `${employee.firstName} ${employee.lastName}`,
        department: employee.department?.name ?? '—',
        assigned,
        completed,
        onTime,
        completionRate: assigned ? `${Math.round((completed / assigned) * 100)}%` : '0%',
        onTimeRate: completed ? `${Math.round((onTime / completed) * 100)}%` : '0%',
        inReview,
        blocked,
        overdue,
        hours: Math.round((hours._sum.actualHours ?? 0) * 10) / 10,
      });
    }

    await respond(res, scope, {
      title: 'Employee Task Report',
      columns: [
        { key: 'employeeCode', header: 'Code', width: 12 },
        { key: 'name', header: 'Employee', width: 24 },
        { key: 'department', header: 'Department', width: 20 },
        { key: 'assigned', header: 'Assigned', width: 12 },
        { key: 'completed', header: 'Completed', width: 12 },
        { key: 'onTime', header: 'On time', width: 12 },
        { key: 'completionRate', header: 'Completion %', width: 14 },
        { key: 'onTimeRate', header: 'On-time %', width: 14 },
        { key: 'inReview', header: 'In review', width: 12 },
        { key: 'blocked', header: 'Blocked', width: 10 },
        { key: 'overdue', header: 'Overdue', width: 10 },
        { key: 'hours', header: 'Hours', width: 10 },
      ],
      rows,
    });
  }),
);

// ---------------------------------------------------------------------------
// SOD / EOD compliance
// ---------------------------------------------------------------------------

reportsRouter.get(
  '/sod',
  handler(async (req, res) => {
    const scope = await resolveScope(req);
    const records = await prisma.sod.findMany({
      where: { userId: { in: scope.userIds }, date: { gte: scope.from, lte: scope.to } },
      include: {
        user: { select: { employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } } },
        items: { select: { id: true } },
      },
      orderBy: [{ date: 'desc' }],
    });

    const rows: Row[] = records.map((sod) => ({
      date: sod.date,
      employeeCode: sod.user.employeeCode,
      name: `${sod.user.firstName} ${sod.user.lastName}`,
      department: sod.user.department?.name ?? '—',
      status: sod.status,
      plannedTasks: sod.items.length,
      submittedAt: sod.submittedAt ? sod.submittedAt.toISOString().slice(11, 16) : '—',
      note: sod.plannedNote ?? sod.skipReason ?? '',
    }));

    await respond(res, scope, {
      title: 'SOD Report',
      columns: [
        { key: 'date', header: 'Date', width: 12 },
        { key: 'employeeCode', header: 'Code', width: 12 },
        { key: 'name', header: 'Employee', width: 24 },
        { key: 'department', header: 'Department', width: 20 },
        { key: 'status', header: 'Status', width: 14 },
        { key: 'plannedTasks', header: 'Planned tasks', width: 14 },
        { key: 'submittedAt', header: 'Submitted', width: 12 },
        { key: 'note', header: 'Note', width: 40 },
      ],
      rows,
      summary: {
        total: records.length,
        submitted: records.filter((r) => r.status === 'SUBMITTED').length,
        pending: records.filter((r) => r.status === 'PENDING').length,
      },
    });
  }),
);

reportsRouter.get(
  '/eod',
  handler(async (req, res) => {
    const scope = await resolveScope(req);
    const records = await prisma.eod.findMany({
      where: { userId: { in: scope.userIds }, date: { gte: scope.from, lte: scope.to } },
      include: {
        user: { select: { employeeCode: true, firstName: true, lastName: true, department: { select: { name: true } } } },
        items: { select: { category: true } },
        reviewedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: [{ date: 'desc' }],
    });

    const rows: Row[] = records.map((eod) => ({
      date: eod.date,
      employeeCode: eod.user.employeeCode,
      name: `${eod.user.firstName} ${eod.user.lastName}`,
      department: eod.user.department?.name ?? '—',
      status: eod.status,
      completed: eod.items.filter((i) => i.category === 'COMPLETED').length,
      pending: eod.items.filter((i) => i.category === 'PENDING').length,
      blocked: eod.items.filter((i) => i.category === 'BLOCKED').length,
      additional: eod.items.filter((i) => i.category === 'ADDITIONAL').length,
      hours: eod.totalHours ?? 0,
      reviewer: eod.reviewedBy ? `${eod.reviewedBy.firstName} ${eod.reviewedBy.lastName}` : '—',
      summary: (eod.workSummary ?? '').slice(0, 160),
      blockers: (eod.blockers ?? '').slice(0, 120),
    }));

    await respond(res, scope, {
      title: 'EOD Report',
      columns: [
        { key: 'date', header: 'Date', width: 12 },
        { key: 'employeeCode', header: 'Code', width: 12 },
        { key: 'name', header: 'Employee', width: 22 },
        { key: 'department', header: 'Department', width: 18 },
        { key: 'status', header: 'Status', width: 16 },
        { key: 'completed', header: 'Completed', width: 11 },
        { key: 'pending', header: 'Pending', width: 10 },
        { key: 'blocked', header: 'Blocked', width: 10 },
        { key: 'additional', header: 'Extra', width: 9 },
        { key: 'hours', header: 'Hours', width: 9 },
        { key: 'reviewer', header: 'Reviewed by', width: 20 },
        { key: 'summary', header: 'Work summary', width: 44 },
        { key: 'blockers', header: 'Blockers', width: 30 },
      ],
      rows,
      summary: {
        total: records.length,
        submitted: records.filter((r) => r.status === 'SUBMITTED').length,
        reviewed: records.filter((r) => r.status === 'REVIEWED').length,
        pending: records.filter((r) => r.status === 'PENDING').length,
      },
    });
  }),
);

// ---------------------------------------------------------------------------
// Productivity
// ---------------------------------------------------------------------------

reportsRouter.get(
  '/productivity',
  handler(async (req, res) => {
    const scope = await resolveScope(req);
    const window = { gte: scope.from, lte: scope.to };

    const employees = await prisma.user.findMany({
      where: { id: { in: scope.userIds } },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        department: { select: { name: true } },
      },
      orderBy: { employeeCode: 'asc' },
    });

    const rows: Row[] = [];
    for (const employee of employees) {
      const [sodTotal, sodSubmitted, eodTotal, eodSubmitted, attendance, records, completedTasks] =
        await Promise.all([
          prisma.sod.count({ where: { userId: employee.id, date: window, status: { not: 'SKIPPED' } } }),
          prisma.sod.count({ where: { userId: employee.id, date: window, status: 'SUBMITTED' } }),
          prisma.eod.count({ where: { userId: employee.id, date: window } }),
          prisma.eod.count({
            where: { userId: employee.id, date: window, status: { in: ['SUBMITTED', 'REVIEWED'] } },
          }),
          prisma.attendance.aggregate({
            where: { userId: employee.id, date: window },
            _sum: { workedMinutes: true },
            _count: { _all: true },
          }),
          prisma.attendance.count({
            where: { userId: employee.id, date: window, status: { in: ['PRESENT', 'WFH', 'LATE'] } },
          }),
          prisma.task.count({
            where: {
              assigneeId: employee.id,
              status: 'COMPLETED',
              completedAt: {
                gte: new Date(`${scope.from}T00:00:00.000Z`),
                lte: new Date(`${scope.to}T23:59:59.999Z`),
              },
            },
          }),
        ]);

      const workedHours = minutesToHours(attendance._sum.workedMinutes ?? 0);
      rows.push({
        employeeCode: employee.employeeCode,
        name: `${employee.firstName} ${employee.lastName}`,
        department: employee.department?.name ?? '—',
        daysPresent: records,
        workedHours,
        avgHoursPerDay: records ? Math.round((workedHours / records) * 10) / 10 : 0,
        tasksCompleted: completedTasks,
        tasksPerDay: records ? Math.round((completedTasks / records) * 100) / 100 : 0,
        sodCompliance: sodTotal ? `${Math.round((sodSubmitted / sodTotal) * 100)}%` : '—',
        eodCompliance: eodTotal ? `${Math.round((eodSubmitted / eodTotal) * 100)}%` : '—',
      });
    }

    await respond(res, scope, {
      title: 'Employee Productivity Report',
      columns: [
        { key: 'employeeCode', header: 'Code', width: 12 },
        { key: 'name', header: 'Employee', width: 24 },
        { key: 'department', header: 'Department', width: 20 },
        { key: 'daysPresent', header: 'Days present', width: 14 },
        { key: 'workedHours', header: 'Hours worked', width: 14 },
        { key: 'avgHoursPerDay', header: 'Avg hrs/day', width: 13 },
        { key: 'tasksCompleted', header: 'Tasks done', width: 12 },
        { key: 'tasksPerDay', header: 'Tasks/day', width: 12 },
        { key: 'sodCompliance', header: 'SOD %', width: 10 },
        { key: 'eodCompliance', header: 'EOD %', width: 10 },
      ],
      rows,
    });
  }),
);

// ---------------------------------------------------------------------------
// Department roll-up
// ---------------------------------------------------------------------------

reportsRouter.get(
  '/department',
  requirePermission('report.read.department'),
  handler(async (req, res) => {
    const scope = await resolveScope(req);
    const window = {
      gte: new Date(`${scope.from}T00:00:00.000Z`),
      lte: new Date(`${scope.to}T23:59:59.999Z`),
    };

    const departments = await prisma.department.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });

    const rows: Row[] = [];
    for (const dept of departments) {
      const people = await prisma.user.findMany({
        where: { departmentId: dept.id, id: { in: scope.userIds } },
        select: { id: true },
      });
      if (!people.length) continue;
      const ids = people.map((p) => p.id);

      const [assigned, completed, overdue, blocked, eodSubmitted, eodTotal] = await Promise.all([
        prisma.task.count({ where: { assigneeId: { in: ids }, createdAt: window } }),
        prisma.task.count({ where: { assigneeId: { in: ids }, status: 'COMPLETED', completedAt: window } }),
        prisma.task.count({
          where: { assigneeId: { in: ids }, isOverdue: true, status: { notIn: CLOSED_TASK_STATUSES } },
        }),
        prisma.task.count({ where: { assigneeId: { in: ids }, status: 'BLOCKED' } }),
        prisma.eod.count({
          where: { userId: { in: ids }, date: { gte: scope.from, lte: scope.to }, status: { in: ['SUBMITTED', 'REVIEWED'] } },
        }),
        prisma.eod.count({ where: { userId: { in: ids }, date: { gte: scope.from, lte: scope.to } } }),
      ]);

      rows.push({
        department: dept.name,
        code: dept.code,
        employees: people.length,
        assigned,
        completed,
        completionRate: assigned ? `${Math.round((completed / assigned) * 100)}%` : '0%',
        overdue,
        blocked,
        eodCompliance: eodTotal ? `${Math.round((eodSubmitted / eodTotal) * 100)}%` : '—',
      });
    }

    await respond(res, scope, {
      title: 'Department Report',
      columns: [
        { key: 'department', header: 'Department', width: 24 },
        { key: 'code', header: 'Code', width: 10 },
        { key: 'employees', header: 'Employees', width: 12 },
        { key: 'assigned', header: 'Assigned', width: 12 },
        { key: 'completed', header: 'Completed', width: 12 },
        { key: 'completionRate', header: 'Completion %', width: 14 },
        { key: 'overdue', header: 'Overdue', width: 10 },
        { key: 'blocked', header: 'Blocked', width: 10 },
        { key: 'eodCompliance', header: 'EOD %', width: 10 },
      ],
      rows,
    });
  }),
);

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

reportsRouter.get(
  '/attendance',
  handler(async (req, res) => {
    const scope = await resolveScope(req);
    const window = { gte: scope.from, lte: scope.to };

    const employees = await prisma.user.findMany({
      where: { id: { in: scope.userIds } },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        department: { select: { name: true } },
      },
      orderBy: { employeeCode: 'asc' },
    });

    const rows: Row[] = [];
    for (const employee of employees) {
      const groups = await prisma.attendance.groupBy({
        by: ['status'],
        where: { userId: employee.id, date: window },
        _count: { _all: true },
        _sum: { workedMinutes: true },
      });
      const byStatus = Object.fromEntries(groups.map((g) => [g.status, g._count._all]));
      const minutes = groups.reduce((total, g) => total + (g._sum.workedMinutes ?? 0), 0);

      rows.push({
        employeeCode: employee.employeeCode,
        name: `${employee.firstName} ${employee.lastName}`,
        department: employee.department?.name ?? '—',
        present: byStatus.PRESENT ?? 0,
        wfh: byStatus.WFH ?? 0,
        late: byStatus.LATE ?? 0,
        halfDay: byStatus.HALF_DAY ?? 0,
        leave: byStatus.ON_LEAVE ?? 0,
        absent: byStatus.ABSENT ?? 0,
        totalHours: minutesToHours(minutes),
      });
    }

    await respond(res, scope, {
      title: 'Attendance Report',
      columns: [
        { key: 'employeeCode', header: 'Code', width: 12 },
        { key: 'name', header: 'Employee', width: 24 },
        { key: 'department', header: 'Department', width: 20 },
        { key: 'present', header: 'Present', width: 10 },
        { key: 'wfh', header: 'WFH', width: 8 },
        { key: 'late', header: 'Late', width: 8 },
        { key: 'halfDay', header: 'Half day', width: 10 },
        { key: 'leave', header: 'Leave', width: 9 },
        { key: 'absent', header: 'Absent', width: 9 },
        { key: 'totalHours', header: 'Total hours', width: 13 },
      ],
      rows,
    });
  }),
);
