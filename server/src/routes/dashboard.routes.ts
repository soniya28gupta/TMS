import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { handler, parse } from '../lib/http';
import { DATE_RE, addDays, minutesToHours, todayInTz } from '../lib/dates';
import { CLOSED_TASK_STATUSES } from '../constants';
import { authenticate, currentUser } from '../auth/middleware';
import { requireScope, visibleUserIds } from '../auth/rbac';
import { getSettings } from '../services/settings.service';
import { getOrCreateTodaySod } from '../services/sod.service';
import { getOrCreateTodayEod } from '../services/eod.service';
import { balanceSummary } from '../services/leave.service';
import { todayAttendance } from '../services/attendance.service';

export const dashboardRouter = Router();
dashboardRouter.use(authenticate);

// Short-lived in-memory read cache (5s TTL) to speed up repeated dashboard reads
const DASHBOARD_CACHE_TTL_MS = 5000;
const DASHBOARD_CACHE_MAX_ENTRIES = 200;
const dashboardCache = new Map<string, { expiresAt: number; payload: unknown }>();

function getCachedDashboard<T>(key: string): T | null {
  const entry = dashboardCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    dashboardCache.delete(key);
    return null;
  }
  return entry.payload as T;
}

function setCachedDashboard(key: string, payload: unknown): void {
  if (dashboardCache.size >= DASHBOARD_CACHE_MAX_ENTRIES) {
    const oldestKey = dashboardCache.keys().next().value;
    if (oldestKey) dashboardCache.delete(oldestKey);
  }
  dashboardCache.set(key, {
    expiresAt: Date.now() + DASHBOARD_CACHE_TTL_MS,
    payload,
  });
}

/** Employee home screen: today's plan, tasks, attendance, leave and EOD state. */
dashboardRouter.get(
  '/me',
  handler(async (req, res) => {
    const user = currentUser(req);
    const settings = await getSettings();
    const today = todayInTz(settings.timezone);
    const year = new Date().getUTCFullYear();

    const cacheKey = `me:${user.id}:${today}:${year}`;
    const cached = getCachedDashboard(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const [
      sod,
      eod,
      attendance,
      balances,
      taskGroups,
      overdueCount,
      dueToday,
      unread,
      recentTasks,
      assignedDutiesRaw,
      assignedProjectsRaw,
    ] = await Promise.all([
      getOrCreateTodaySod(user.id),
      getOrCreateTodayEod(user.id),
      todayAttendance(user.id),
      balanceSummary(user.id, year),
      prisma.task.groupBy({
        by: ['status'],
        where: { assigneeId: user.id },
        _count: { _all: true },
      }),
      prisma.task.count({
        where: { assigneeId: user.id, isOverdue: true, status: { notIn: CLOSED_TASK_STATUSES } },
      }),
      prisma.task.count({
        where: {
          assigneeId: user.id,
          status: { notIn: CLOSED_TASK_STATUSES },
          dueDate: {
            gte: new Date(`${today}T00:00:00.000Z`),
            lte: new Date(`${today}T23:59:59.999Z`),
          },
        },
      }),
      prisma.notification.count({ where: { userId: user.id, isRead: false } }),
      prisma.task.findMany({
        where: { assigneeId: user.id, status: { notIn: CLOSED_TASK_STATUSES } },
        orderBy: [{ isOverdue: 'desc' }, { dueDate: 'asc' }],
        take: 6,
        select: {
          id: true,
          code: true,
          title: true,
          status: true,
          priority: true,
          progress: true,
          dueDate: true,
          isOverdue: true,
        },
      }),
      prisma.sodItem.findMany({
        where: {
          sod: { userId: user.id },
          source: 'ASSIGNED',
        },
        orderBy: [{ sortOrder: 'asc' }],
        take: 10,
        select: {
          id: true,
          titleSnapshot: true,
          prioritySnapshot: true,
          statusSnapshot: true,
          progressSnapshot: true,
          status: true,
          plannedHours: true,
          instructions: true,
          dueTime: true,
          assignedById: true,
          assignedBy: { select: { firstName: true, lastName: true } },
          sod: { select: { date: true } },
        },
      }),
      prisma.project.findMany({
        where: {
          OR: [
            { members: { some: { userId: user.id } } },
            { managerId: user.id },
          ],
          status: { notIn: ['CANCELLED'] },
        },
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          dueDate: true,
          description: true,
          manager: { select: { id: true, firstName: true, lastName: true } },
          department: { select: { id: true, name: true } },
        },
        orderBy: [{ updatedAt: 'desc' }],
        take: 6,
      }),
    ]);

    const byStatus = Object.fromEntries(taskGroups.map((g) => [g.status, g._count._all]));
    const sum = (keys: string[]) => keys.reduce((total, key) => total + (byStatus[key] ?? 0), 0);

    const payload = {
      date: today,
      sod: { status: sod?.status ?? 'PENDING', items: sod?.items?.length ?? 0, submittedAt: sod?.submittedAt ?? null },
      eod: { status: eod?.status ?? 'PENDING', items: eod?.items?.length ?? 0, submittedAt: eod?.submittedAt ?? null },
      attendance: {
        status: attendance?.status ?? 'NOT_MARKED',
        checkInAt: attendance?.checkInAt ?? null,
        checkOutAt: attendance?.checkOutAt ?? null,
        workedHours:
          (attendance?.workedMinutes ?? 0) > 0
            ? minutesToHours(attendance!.workedMinutes)
            : attendance?.checkInAt && attendance?.checkOutAt
              ? Math.max(0.01, Math.round(((attendance.checkOutAt.getTime() - attendance.checkInAt.getTime()) / 3600000) * 100) / 100)
              : 0,
        canCheckIn: !attendance?.checkInAt,
        canCheckOut: !!attendance?.checkInAt && !attendance?.checkOutAt,
      },
      tasks: {
        total: Object.values(byStatus).reduce((a, b) => a + b, 0),
        open: sum(['CREATED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'CHANGES_REQUIRED']),
        inProgress: byStatus.IN_PROGRESS ?? 0,
        inReview: byStatus.SUBMITTED_FOR_REVIEW ?? 0,
        changesRequired: byStatus.CHANGES_REQUIRED ?? 0,
        completed: byStatus.COMPLETED ?? 0,
        blocked: byStatus.BLOCKED ?? 0,
        overdue: overdueCount,
        dueToday,
      },
      leaveBalances: balances,
      unreadNotifications: unread,
      upcomingTasks: recentTasks,
      assignedDuties: assignedDutiesRaw.map((d) => ({
        id: d.id,
        titleSnapshot: d.titleSnapshot,
        prioritySnapshot: d.prioritySnapshot,
        status: d.status ?? d.statusSnapshot ?? 'PENDING',
        plannedHours: d.plannedHours,
        instructions: d.instructions,
        dueTime: d.dueTime,
        assignedById: d.assignedById,
        assignedByName: d.assignedBy ? `${d.assignedBy.firstName} ${d.assignedBy.lastName}` : null,
        date: d.sod?.date,
      })),
      assignedProjects: assignedProjectsRaw.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        status: p.status,
        dueDate: p.dueDate ? p.dueDate.toISOString().split('T')[0] : null,
        description: p.description,
        leadName: p.manager ? `${p.manager.firstName} ${p.manager.lastName}` : null,
        departmentName: p.department?.name ?? null,
      })),
    };

    setCachedDashboard(cacheKey, payload);
    res.json(payload);
  }),
);

/** Admin overview with date / employee / department / team filters. */
dashboardRouter.get(
  '/admin',
  handler(async (req, res) => {
    const user = currentUser(req);
    const settings = await getSettings();
    const today = todayInTz(settings.timezone);

    const q = parse(
      z.object({
        date: z.string().regex(DATE_RE).default(today),
        departmentId: z.string().optional(),
        teamId: z.string().optional(),
        employeeId: z.string().optional(),
      }),
      req.query,
    );

    const scope = requireScope(user, 'employee.read');
    const allowedIds = await visibleUserIds(user, scope);

    const cacheKey = `admin:${user.id}:${scope}:${q.date}:${q.departmentId ?? ''}:${q.teamId ?? ''}:${q.employeeId ?? ''}`;
    const cached = getCachedDashboard(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const peopleWhere = {
      status: 'ACTIVE',
      ...(allowedIds ? { id: { in: allowedIds } } : {}),
      ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      ...(q.teamId ? { teamMemberships: { some: { teamId: q.teamId } } } : {}),
      ...(q.employeeId ? { id: q.employeeId } : {}),
    };

    // Run people lookup, newEmployees count, and departments list together
    const [people, newEmployees, departmentsData] = await Promise.all([
      prisma.user.findMany({ where: peopleWhere, select: { id: true } }),
      prisma.user.count({
        where: { ...peopleWhere, dateOfJoining: { gte: new Date(`${addDays(q.date, -30)}T00:00:00.000Z`) } },
      }),
      prisma.department.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          code: true,
          head: { select: { firstName: true, lastName: true } },
          users: { where: { status: 'ACTIVE' }, select: { id: true } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    const userIds = people.map((p) => p.id);
    const scopedUser = { userId: { in: userIds } };
    const trendDays = Array.from({ length: 7 }, (_, i) => addDays(q.date, i - 6));

    // Execute all user-scoped dashboard, trend, and roster queries in a single parallel batch
    const [
      attendanceGroups,
      taskGroups,
      overdue,
      sodGroups,
      eodGroups,
      leaveToday,
      pendingLeave,
      reviewQueue,
      eodTrendGroups,
      completedTasksList,
      rosterUsers,
      todayAttendanceList,
      todaySodsList,
      todayEodsList,
      activeTasksPerUser,
    ] = await Promise.all([
      prisma.attendance.groupBy({
        by: ['status'],
        where: { ...scopedUser, date: q.date },
        _count: { _all: true },
      }),
      prisma.task.groupBy({
        by: ['status'],
        where: { assigneeId: { in: userIds } },
        _count: { _all: true },
      }),
      prisma.task.count({
        where: { assigneeId: { in: userIds }, isOverdue: true, status: { notIn: CLOSED_TASK_STATUSES } },
      }),
      prisma.sod.groupBy({
        by: ['status'],
        where: { ...scopedUser, date: q.date },
        _count: { _all: true },
      }),
      prisma.eod.groupBy({
        by: ['status'],
        where: { ...scopedUser, date: q.date },
        _count: { _all: true },
      }),
      prisma.leaveRequest.count({
        where: {
          userId: { in: userIds },
          status: 'APPROVED',
          startDate: { lte: q.date },
          endDate: { gte: q.date },
        },
      }),
      prisma.leaveRequest.count({ where: { userId: { in: userIds }, status: 'PENDING' } }),
      prisma.task.count({
        where: { assigneeId: { in: userIds }, status: 'SUBMITTED_FOR_REVIEW' },
      }),
      userIds.length
        ? prisma.eod.groupBy({
          by: ['date', 'status'],
          where: { ...scopedUser, date: { in: trendDays } },
          _count: { _all: true },
        })
        : Promise.resolve([]),
      userIds.length
        ? prisma.task.findMany({
          where: {
            assigneeId: { in: userIds },
            completedAt: {
              gte: new Date(`${trendDays[0]}T00:00:00.000Z`),
              lte: new Date(`${trendDays[6]}T23:59:59.999Z`),
            },
          },
          select: { completedAt: true },
        })
        : Promise.resolve([]),
      prisma.user.findMany({
        where: peopleWhere,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          employeeCode: true,
          workMode: true,
          department: { select: { id: true, name: true } },
          position: { select: { title: true, band: true, level: true } },
          role: { select: { name: true, key: true } },
          manager: { select: { id: true, firstName: true, lastName: true, designation: true } },
        },
        orderBy: [{ hierarchyDepth: 'asc' }, { firstName: 'asc' }],
      }),
      prisma.attendance.findMany({
        where: { ...scopedUser, date: q.date },
        select: { userId: true, status: true, checkInAt: true, workMode: true },
      }),
      prisma.sod.findMany({
        where: { ...scopedUser, date: q.date },
        select: { userId: true, status: true },
      }),
      prisma.eod.findMany({
        where: { ...scopedUser, date: q.date },
        select: { userId: true, status: true },
      }),
      prisma.task.groupBy({
        by: ['assigneeId'],
        where: { assigneeId: { in: userIds }, status: { notIn: CLOSED_TASK_STATUSES } },
        _count: { _all: true },
      }),
    ]);

    const totalEmployees = people.length;
    const att = Object.fromEntries(attendanceGroups.map((g) => [g.status, g._count._all]));
    const tasks = Object.fromEntries(taskGroups.map((g) => [g.status, g._count._all]));
    const sod = Object.fromEntries(sodGroups.map((g) => [g.status, g._count._all]));
    const eod = Object.fromEntries(eodGroups.map((g) => [g.status, g._count._all]));
    const sum = (src: Record<string, number>, keys: string[]) =>
      keys.reduce((total, key) => total + (src[key] ?? 0), 0);

    const eodTotalByDate = new Map<string, number>();
    const eodSubByDate = new Map<string, number>();
    for (const g of eodTrendGroups) {
      const count = g._count._all;
      eodTotalByDate.set(g.date, (eodTotalByDate.get(g.date) ?? 0) + count);
      if (['SUBMITTED', 'REVIEWED'].includes(g.status)) {
        eodSubByDate.set(g.date, (eodSubByDate.get(g.date) ?? 0) + count);
      }
    }

    const tasksCompletedByDate = new Map<string, number>();
    for (const t of completedTasksList) {
      if (!t.completedAt) continue;
      const dStr = t.completedAt.toISOString().slice(0, 10);
      tasksCompletedByDate.set(dStr, (tasksCompletedByDate.get(dStr) ?? 0) + 1);
    }

    const trend = trendDays.map((date) => ({
      date,
      eodTotal: eodTotalByDate.get(date) ?? 0,
      eodSubmitted: eodSubByDate.get(date) ?? 0,
      tasksCompleted: tasksCompletedByDate.get(date) ?? 0,
    }));

    const attMap = new Map(todayAttendanceList.map((a) => [a.userId, a]));
    const sodMap = new Map(todaySodsList.map((s) => [s.userId, s.status]));
    const eodMap = new Map(todayEodsList.map((e) => [e.userId, e.status]));
    const taskCountMap = new Map(activeTasksPerUser.map((t) => [t.assigneeId!, t._count._all]));

    const hierarchyRoster = rosterUsers.map((u) => {
      const attRecord = attMap.get(u.id);
      return {
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        employeeCode: u.employeeCode,
        email: u.email,
        roleName: u.role.name,
        departmentName: u.department?.name ?? null,
        positionTitle: u.position?.title ?? null,
        managerName: u.manager ? `${u.manager.firstName} ${u.manager.lastName}` : null,
        workMode: u.workMode,
        attendanceStatus: attRecord?.status ?? 'NOT_MARKED',
        checkInAt: attRecord?.checkInAt?.toISOString() ?? null,
        sodStatus: sodMap.get(u.id) ?? 'PENDING',
        eodStatus: eodMap.get(u.id) ?? 'PENDING',
        activeTasksCount: taskCountMap.get(u.id) ?? 0,
      };
    });

    const departmentBreakdown = departmentsData.map((d) => {
      const deptUserIds = new Set(d.users.map((u) => u.id));
      const deptRoster = hierarchyRoster.filter((r) => deptUserIds.has(r.id));
      return {
        id: d.id,
        name: d.name,
        code: d.code,
        headName: d.head ? `${d.head.firstName} ${d.head.lastName}` : null,
        totalHeadcount: deptRoster.length,
        presentToday: deptRoster.filter((r) => ['PRESENT', 'WFH', 'LATE'].includes(r.attendanceStatus)).length,
        wfhToday: deptRoster.filter((r) => r.attendanceStatus === 'WFH').length,
        lateToday: deptRoster.filter((r) => r.attendanceStatus === 'LATE').length,
        absentToday: deptRoster.filter((r) => ['ABSENT', 'NOT_MARKED'].includes(r.attendanceStatus)).length,
        sodSubmitted: deptRoster.filter((r) => r.sodStatus === 'SUBMITTED').length,
        activeTasks: deptRoster.reduce((acc, r) => acc + r.activeTasksCount, 0),
      };
    });

    const payload = {
      date: q.date,
      employees: {
        total: totalEmployees,
        active: totalEmployees,
        new: newEmployees,
        onLeave: leaveToday,
      },
      attendance: {
        present: (att.PRESENT ?? 0) + (att.WFH ?? 0) + (att.LATE ?? 0),
        absent: att.ABSENT ?? 0,
        late: att.LATE ?? 0,
        wfh: att.WFH ?? 0,
        halfDay: att.HALF_DAY ?? 0,
        onLeave: att.ON_LEAVE ?? 0,
        notMarked: Math.max(0, totalEmployees - attendanceGroups.reduce((a, g) => a + g._count._all, 0)),
      },
      tasks: {
        total: Object.values(tasks).reduce((a, b) => a + b, 0),
        pending: sum(tasks, ['CREATED', 'ASSIGNED', 'ACCEPTED']),
        inProgress: tasks.IN_PROGRESS ?? 0,
        inReview: tasks.SUBMITTED_FOR_REVIEW ?? 0,
        changesRequired: tasks.CHANGES_REQUIRED ?? 0,
        completed: tasks.COMPLETED ?? 0,
        blocked: tasks.BLOCKED ?? 0,
        cancelled: tasks.CANCELLED ?? 0,
        overdue,
      },
      sod: {
        submitted: sod.SUBMITTED ?? 0,
        pending: sod.PENDING ?? 0,
        skipped: sod.SKIPPED ?? 0,
      },
      eod: {
        submitted: eod.SUBMITTED ?? 0,
        pending: eod.PENDING ?? 0,
        reviewed: eod.REVIEWED ?? 0,
        changesRequested: eod.CHANGES_REQUESTED ?? 0,
        awaitingReview: eod.SUBMITTED ?? 0,
      },
      queues: { taskReview: reviewQueue, leaveApproval: pendingLeave },
      trend,
      departmentBreakdown,
      hierarchyRoster,
    };

    setCachedDashboard(cacheKey, payload);
    res.json(payload);
  }),
);