/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DEFAULT_ROLES, DEFAULT_SETTINGS } from '../src/constants';
import { POSITION_CATALOGUE } from '../src/positions';
import { rebuildAllPaths } from '../src/services/hierarchy.service';
import { prisma as sharedPrisma } from '../src/db';

const prisma = new PrismaClient();
const PASSWORD = process.env.SEED_PASSWORD ?? 'Password@123';
const TZ = DEFAULT_SETTINGS.timezone;

function day(offset: number): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

function at(dateStr: string, time: string): Date {
  return new Date(`${dateStr}T${time}:00.000Z`);
}

function pick<T>(list: readonly T[], index: number): T {
  return list[index % list.length];
}

async function main() {
  console.log('Seeding Task Management System...');
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // -- Roles & permissions -------------------------------------------------
  const roles = new Map<string, string>();
  for (const role of DEFAULT_ROLES) {
    const record = await prisma.role.upsert({
      where: { key: role.key },
      create: {
        key: role.key,
        name: role.name,
        portal: role.portal,
        rank: role.rank,
        description: role.description,
        isSystem: true,
      },
      update: { name: role.name, portal: role.portal, rank: role.rank, description: role.description },
    });
    roles.set(role.key, record.id);

    await prisma.rolePermission.deleteMany({ where: { roleId: record.id } });
    await prisma.rolePermission.createMany({
      data: role.permissions.map((permission) => ({ roleId: record.id, permission })),
    });
  }
  console.log(`  roles: ${roles.size}`);

  // -- Settings ------------------------------------------------------------
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(value) },
      update: {},
    });
  }

  // -- Departments ---------------------------------------------------------
  const departmentSeed = [
    { name: 'Engineering', code: 'ENG' },
    { name: 'Sales', code: 'SLS' },
    { name: 'Human Resources', code: 'HR' },
    { name: 'Finance', code: 'FIN' },
    { name: 'Operations', code: 'OPS' },
  ];
  const departments = new Map<string, string>();
  for (const dept of departmentSeed) {
    const record = await prisma.department.upsert({
      where: { code: dept.code },
      create: dept,
      update: { name: dept.name },
    });
    departments.set(dept.code, record.id);
  }

  // -- Positions -----------------------------------------------------------
  const positions = new Map<string, string>();
  for (const p of POSITION_CATALOGUE) {
    const record = await prisma.position.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        title: p.title,
        level: p.level,
        band: p.band,
        track: p.track,
        canHire: p.canHire,
        departmentId: p.dept ? departments.get(p.dept)! : null,
      },
      update: {
        title: p.title,
        level: p.level,
        band: p.band,
        track: p.track,
        canHire: p.canHire,
        departmentId: p.dept ? departments.get(p.dept)! : null,
      },
    });
    positions.set(p.code, record.id);
  }
  console.log(`  positions: ${positions.size}`);

  // -- People --------------------------------------------------------------
  type UserSeed = {
    code: string;
    first: string;
    last: string;
    email: string;
    role: string;
    dept: string;
    designation: string;
    position: string;
    manager?: string;
  };

  // Reporting chain: CEO → Managers → Team Leads → Employees.
  // The Super Admin is a system account and sits outside the operating line.
  const userSeed: UserSeed[] = [
    { code: 'EMP001', first: 'Aditya', last: 'Sharma', email: 'admin@acme.test', role: 'SUPER_ADMIN', dept: 'OPS', designation: 'System Administrator', position: 'SYS_ADMIN' },
    { code: 'EMP000', first: 'Kavita', last: 'Menon', email: 'ceo@acme.test', role: 'CEO', dept: 'OPS', designation: 'Chief Executive Officer', position: 'CEO' },
    { code: 'EMP002', first: 'Priya', last: 'Nair', email: 'hr@acme.test', role: 'HR_ADMIN', dept: 'HR', designation: 'HR Manager', position: 'MGR_HR', manager: 'EMP000' },
    { code: 'EMP003', first: 'Rahul', last: 'Verma', email: 'manager@acme.test', role: 'MANAGER', dept: 'ENG', designation: 'Engineering Manager', position: 'MGR_ENG', manager: 'EMP000' },
    { code: 'EMP013', first: 'Farah', last: 'Qureshi', email: 'sales.manager@acme.test', role: 'MANAGER', dept: 'SLS', designation: 'Sales Manager', position: 'MGR_SALES', manager: 'EMP000' },
    { code: 'EMP004', first: 'Sneha', last: 'Iyer', email: 'lead@acme.test', role: 'TEAM_LEAD', dept: 'ENG', designation: 'Team Lead — Platform', position: 'PROJECT_LEAD', manager: 'EMP003' },
    { code: 'EMP005', first: 'Vikram', last: 'Singh', email: 'finance@acme.test', role: 'FINANCE', dept: 'FIN', designation: 'Finance Controller', position: 'FIN_CONTROLLER', manager: 'EMP000' },
    { code: 'EMP006', first: 'Ananya', last: 'Rao', email: 'ananya@acme.test', role: 'EMPLOYEE', dept: 'ENG', designation: 'Senior Software Engineer', position: 'SR_SWE', manager: 'EMP004' },
    { code: 'EMP007', first: 'Karan', last: 'Mehta', email: 'karan@acme.test', role: 'EMPLOYEE', dept: 'ENG', designation: 'Software Engineer', position: 'SWE_II', manager: 'EMP004' },
    { code: 'EMP008', first: 'Divya', last: 'Kulkarni', email: 'divya@acme.test', role: 'EMPLOYEE', dept: 'ENG', designation: 'QA Engineer', position: 'QA_II', manager: 'EMP004' },
    { code: 'EMP009', first: 'Rohit', last: 'Gupta', email: 'rohit@acme.test', role: 'EMPLOYEE', dept: 'SLS', designation: 'Account Executive', position: 'AE', manager: 'EMP013' },
    { code: 'EMP010', first: 'Meera', last: 'Joshi', email: 'meera@acme.test', role: 'EMPLOYEE', dept: 'SLS', designation: 'Sales Development Rep', position: 'SDR', manager: 'EMP013' },
    { code: 'EMP011', first: 'Arjun', last: 'Pillai', email: 'arjun@acme.test', role: 'EMPLOYEE', dept: 'OPS', designation: 'Operations Executive', position: 'OPS_EXEC', manager: 'EMP000' },
    { code: 'EMP012', first: 'Neha', last: 'Bansal', email: 'neha@acme.test', role: 'EMPLOYEE', dept: 'HR', designation: 'HR Executive', position: 'HR_EXEC', manager: 'EMP002' },
  ];

  const users = new Map<string, string>();
  for (const seed of userSeed) {
    const record = await prisma.user.upsert({
      where: { email: seed.email },
      create: {
        employeeCode: seed.code,
        email: seed.email,
        passwordHash,
        firstName: seed.first,
        lastName: seed.last,
        phone: `+91 90000 000${seed.code.slice(-2)}`,
        roleId: roles.get(seed.role)!,
        positionId: positions.get(seed.position)!,
        departmentId: departments.get(seed.dept)!,
        designation: seed.designation,
        dateOfJoining: at(day(-420), '09:00'),
        workMode: seed.code === 'EMP009' ? 'REMOTE' : 'ONSITE',
        timezone: TZ,
        mustChangePassword: false,
        status: seed.role === 'SUPER_ADMIN' ? 'ACTIVE' : 'INACTIVE',
      },
      update: {
        roleId: roles.get(seed.role)!,
        positionId: positions.get(seed.position)!,
        departmentId: departments.get(seed.dept)!,
        timezone: TZ,
        status: seed.role === 'SUPER_ADMIN' ? 'ACTIVE' : 'INACTIVE',
      },
    });
    users.set(seed.code, record.id);
  }

  for (const seed of userSeed) {
    if (!seed.manager) continue;
    await prisma.user.update({
      where: { id: users.get(seed.code)! },
      data: { managerId: users.get(seed.manager)! },
    });
  }

  await prisma.department.update({
    where: { id: departments.get('ENG')! },
    data: { headId: users.get('EMP003')! },
  });
  await prisma.department.update({
    where: { id: departments.get('HR')! },
    data: { headId: users.get('EMP002')! },
  });

  // Materialise the reporting paths now that every manager link exists.
  await rebuildAllPaths();
  console.log(`  users: ${users.size} (reporting hierarchy built)`);

  // -- Teams ---------------------------------------------------------------
  const platform = await prisma.team.upsert({
    where: { departmentId_name: { departmentId: departments.get('ENG')!, name: 'Platform' } },
    create: {
      name: 'Platform',
      departmentId: departments.get('ENG')!,
      leaderId: users.get('EMP004')!,
      description: 'Core services and infrastructure',
    },
    update: { leaderId: users.get('EMP004')! },
  });
  const growth = await prisma.team.upsert({
    where: { departmentId_name: { departmentId: departments.get('SLS')!, name: 'Growth' } },
    create: {
      name: 'Growth',
      departmentId: departments.get('SLS')!,
      leaderId: users.get('EMP003')!,
      description: 'New business and pipeline',
    },
    update: {},
  });

  const memberships: [string, string][] = [
    [platform.id, 'EMP006'],
    [platform.id, 'EMP007'],
    [platform.id, 'EMP008'],
    [platform.id, 'EMP004'],
    [growth.id, 'EMP009'],
    [growth.id, 'EMP010'],
  ];
  for (const [teamId, code] of memberships) {
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId, userId: users.get(code)! } },
      create: { teamId, userId: users.get(code)! },
      update: {},
    });
  }

  // -- Leave types & holidays ---------------------------------------------
  const leaveTypeSeed = [
    { name: 'Casual Leave', code: 'CL', defaultDays: 12, color: '#3b82f6' },
    { name: 'Sick Leave', code: 'SL', defaultDays: 8, color: '#ef4444' },
    { name: 'Earned Leave', code: 'EL', defaultDays: 15, color: '#10b981', carryForward: true, maxCarryForward: 10 },
    { name: 'Unpaid Leave', code: 'LWP', defaultDays: 0, color: '#6b7280', isPaid: false },
  ];
  for (const type of leaveTypeSeed) {
    await prisma.leaveType.upsert({ where: { code: type.code }, create: type, update: {} });
  }

  const year = new Date().getUTCFullYear();
  const holidaySeed = [
    { name: 'New Year', date: `${year}-01-01` },
    { name: 'Republic Day', date: `${year}-01-26` },
    { name: 'Independence Day', date: `${year}-08-15` },
    { name: 'Gandhi Jayanti', date: `${year}-10-02` },
    { name: 'Diwali', date: `${year}-11-08`, isOptional: false },
    { name: 'Christmas', date: `${year}-12-25` },
  ];
  for (const holiday of holidaySeed) {
    await prisma.holiday.upsert({ where: { date: holiday.date }, create: holiday, update: {} });
  }

  const leaveTypes = await prisma.leaveType.findMany();
  for (const userId of users.values()) {
    for (const type of leaveTypes) {
      await prisma.leaveBalance.upsert({
        where: { userId_leaveTypeId_year: { userId, leaveTypeId: type.id, year } },
        create: { userId, leaveTypeId: type.id, year, entitled: type.defaultDays },
        update: {},
      });
    }
  }

  // -- Bidirectional SOD demo ---------------------------------------------
  // Runs on every seed so the manager-assigned and self-added directions are
  // visible immediately, even when demo tasks already exist.
  const demoSodDate = day(0);
  const sodOwner = users.get('EMP006')!;
  const demoSod = await prisma.sod.upsert({
    where: { userId_date: { userId: sodOwner, date: demoSodDate } },
    create: { userId: sodOwner, date: demoSodDate, status: 'PENDING' },
    update: {},
  });

  const demoEntries = [
    {
      titleSnapshot: 'Run the release checklist before the 4pm cut',
      source: 'ASSIGNED',
      assignedById: users.get('EMP004')!,
      assignedAt: new Date(),
      instructions: 'Cover staging and production, then post the summary in the team channel.',
      prioritySnapshot: 'HIGH',
      plannedHours: 2,
      dueTime: '16:00',
      isAcknowledged: false,
      sortOrder: 500,
    },
    {
      titleSnapshot: 'Pair with QA on the flaky checkout test',
      source: 'SELF',
      assignedById: null,
      assignedAt: null,
      instructions: null,
      prioritySnapshot: 'MEDIUM',
      plannedHours: 1,
      dueTime: null,
      isAcknowledged: true,
      sortOrder: 900,
    },
  ];

  for (const entry of demoEntries) {
    const exists = await prisma.sodItem.findFirst({
      where: { sodId: demoSod.id, titleSnapshot: entry.titleSnapshot },
    });
    if (exists) continue;
    await prisma.sodItem.create({
      data: {
        sodId: demoSod.id,
        taskId: null,
        statusSnapshot: 'ASSIGNED',
        progressSnapshot: 0,
        status: 'PENDING',
        ...entry,
      },
    });
  }

  // -- Tasks ---------------------------------------------------------------
  const existingTasks = await prisma.task.count();
  if (existingTasks > 0) {
    console.log('  tasks already present — skipping demo task generation');
    console.log('\nDone. Log in with any seeded email and the seed password.');
    return;
  }

  const titles = [
    'Implement JWT refresh rotation',
    'Fix pagination on employee list',
    'Write API docs for task module',
    'Set up nightly database backup',
    'Review Q3 pipeline forecast',
    'Onboard two new sales interns',
    'Migrate reporting queries to indexes',
    'Draft leave policy update',
    'Build EOD summary export',
    'Reduce dashboard load time',
    'Prepare vendor payment schedule',
    'Update the employee handbook',
    'Add attendance correction workflow',
    'Refactor notification service',
    'QA regression pass for release 2.4',
    'Close month-end reconciliation',
    'Design recurring task scheduler',
    'Audit user permission matrix',
  ];
  const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
  const assignableCodes = ['EMP006', 'EMP007', 'EMP008', 'EMP009', 'EMP010', 'EMP011', 'EMP012'];

  let sequence = 0;
  const createdTasks: { id: string; assignee: string; status: string }[] = [];

  for (const [index, title] of titles.entries()) {
    sequence += 1;
    const assigneeCode = pick(assignableCodes, index);
    const creatorCode = ['EMP009', 'EMP010'].includes(assigneeCode) ? 'EMP003' : 'EMP004';
    const startOffset = -(index % 12) - 1;
    const dueOffset = startOffset + 3 + (index % 4);

    // A spread of states so every dashboard tile and report has real data.
    const statusPlan: { status: string; progress: number } =
      index % 6 === 0
        ? { status: 'COMPLETED', progress: 100 }
        : index % 6 === 1
          ? { status: 'IN_PROGRESS', progress: 45 }
          : index % 6 === 2
            ? { status: 'SUBMITTED_FOR_REVIEW', progress: 100 }
            : index % 6 === 3
              ? { status: 'ASSIGNED', progress: 0 }
              : index % 6 === 4
                ? { status: 'BLOCKED', progress: 30 }
                : { status: 'CHANGES_REQUIRED', progress: 80 };

    const dueDate = at(day(dueOffset), '18:00');
    const isOverdue = dueDate < new Date() && !['COMPLETED', 'CANCELLED'].includes(statusPlan.status);

    const task = await prisma.task.create({
      data: {
        code: `TSK-${String(sequence).padStart(6, '0')}`,
        title,
        description: `${title}. Auto-generated demo record so reports and dashboards have realistic data.`,
        priority: pick(priorities, index),
        status: statusPlan.status,
        progress: statusPlan.progress,
        assigneeId: users.get(assigneeCode)!,
        createdById: users.get(creatorCode)!,
        departmentId: departments.get(['EMP009', 'EMP010'].includes(assigneeCode) ? 'SLS' : 'ENG')!,
        teamId: ['EMP009', 'EMP010'].includes(assigneeCode) ? growth.id : platform.id,
        startDate: at(day(startOffset), '09:30'),
        dueDate,
        estimatedHours: 4 + (index % 5) * 2,
        actualHours: statusPlan.status === 'COMPLETED' ? 4 + (index % 5) : (index % 4),
        isOverdue,
        overdueSince: isOverdue ? dueDate : null,
        acceptedAt: statusPlan.status === 'ASSIGNED' ? null : at(day(startOffset), '10:00'),
        startedAt: ['ASSIGNED'].includes(statusPlan.status) ? null : at(day(startOffset), '10:15'),
        submittedAt: ['SUBMITTED_FOR_REVIEW', 'COMPLETED'].includes(statusPlan.status)
          ? at(day(Math.min(dueOffset, 0)), '17:30')
          : null,
        completedAt: statusPlan.status === 'COMPLETED' ? at(day(Math.min(dueOffset, 0)), '17:45') : null,
        blockedReason: statusPlan.status === 'BLOCKED' ? 'Waiting on third-party API credentials' : null,
        blockedAt: statusPlan.status === 'BLOCKED' ? at(day(startOffset + 1), '14:00') : null,
        reviewNotes: statusPlan.status === 'CHANGES_REQUIRED' ? 'Please add test coverage before resubmitting.' : null,
        reviewedById: statusPlan.status === 'CHANGES_REQUIRED' ? users.get('EMP004')! : null,
        reviewedAt: statusPlan.status === 'CHANGES_REQUIRED' ? at(day(-1), '16:00') : null,
        reviewRounds: statusPlan.status === 'CHANGES_REQUIRED' ? 1 : 0,
        tags: JSON.stringify(index % 3 === 0 ? ['demo', 'phase-1'] : ['demo']),
      },
    });

    createdTasks.push({ id: task.id, assignee: assigneeCode, status: statusPlan.status });

    await prisma.taskActivity.create({
      data: {
        taskId: task.id,
        actorId: users.get(creatorCode)!,
        type: 'CREATED',
        toValue: 'ASSIGNED',
        note: `Assigned to ${assigneeCode}`,
      },
    });
    if (index % 4 === 0) {
      await prisma.taskComment.create({
        data: {
          taskId: task.id,
          authorId: users.get(assigneeCode)!,
          body: 'Started on this today, will share an update by EOD.',
        },
      });
    }
  }
  console.log(`  tasks: ${createdTasks.length}`);

  // Update the shared task-code counter so runtime codes continue the sequence.
  await prisma.setting.upsert({
    where: { key: 'taskSequence' },
    create: { key: 'taskSequence', value: String(sequence) },
    update: { value: String(sequence) },
  });

  // -- Recurring task ------------------------------------------------------
  await prisma.recurringTask.create({
    data: {
      title: 'Daily standup notes',
      description: 'Capture blockers and share with the team channel.',
      priority: 'LOW',
      assigneeId: users.get('EMP006')!,
      teamId: platform.id,
      departmentId: departments.get('ENG')!,
      frequency: 'DAILY',
      daysOfWeek: JSON.stringify([1, 2, 3, 4, 5]),
      startDate: at(day(-30), '09:00'),
      dueAfterDays: 0,
      dueTime: '18:00',
      estimatedHours: 0.5,
      createdById: users.get('EMP004')!,
    },
  });

  await prisma.taskTemplate.create({
    data: {
      name: 'Bug fix',
      title: 'Fix: <summary>',
      description: 'Steps to reproduce:\n\nExpected:\n\nActual:\n\nRoot cause:\n',
      priority: 'HIGH',
      estimatedHours: 4,
      checklist: JSON.stringify(['Reproduce locally', 'Write failing test', 'Fix', 'Regression pass']),
      createdById: users.get('EMP004')!,
    },
  });

  // -- Attendance, SOD and EOD history ------------------------------------
  const historyDays = [-6, -5, -4, -3, -2, -1].map(day).filter((d) => {
    const dow = new Date(`${d}T00:00:00Z`).getUTCDay();
    return dow !== 0 && dow !== 6;
  });

  for (const code of assignableCodes) {
    const userId = users.get(code)!;
    for (const [dIndex, date] of historyDays.entries()) {
      const late = (dIndex + code.charCodeAt(5)) % 7 === 0;
      const checkIn = at(date, late ? '10:05' : '09:25');
      const checkOut = at(date, '18:40');
      await prisma.attendance.upsert({
        where: { userId_date: { userId, date } },
        create: {
          userId,
          date,
          checkInAt: checkIn,
          checkOutAt: checkOut,
          workedMinutes: Math.round((checkOut.getTime() - checkIn.getTime()) / 60000),
          status: late ? 'LATE' : code === 'EMP009' ? 'WFH' : 'PRESENT',
          workMode: code === 'EMP009' ? 'REMOTE' : 'ONSITE',
        },
        update: {},
      });

      const userTasks = createdTasks.filter((t) => t.assignee === code).slice(0, 3);

      const sod = await prisma.sod.upsert({
        where: { userId_date: { userId, date } },
        create: {
          userId,
          date,
          status: 'SUBMITTED',
          submittedAt: at(date, '09:40'),
          plannedNote: 'Focus on the in-progress items first.',
        },
        update: {},
      });
      for (const [i, t] of userTasks.entries()) {
        await prisma.sodItem.upsert({
          where: { sodId_taskId: { sodId: sod.id, taskId: t.id } },
          create: {
            sodId: sod.id,
            taskId: t.id,
            titleSnapshot: titles[createdTasks.findIndex((c) => c.id === t.id)] ?? 'Task',
            prioritySnapshot: 'MEDIUM',
            statusSnapshot: t.status,
            progressSnapshot: 40,
            plannedHours: 2,
            isAcknowledged: true,
            sortOrder: i,
          },
          update: {},
        });
      }

      const eod = await prisma.eod.upsert({
        where: { userId_date: { userId, date } },
        create: {
          userId,
          date,
          status: dIndex === historyDays.length - 1 ? 'SUBMITTED' : 'REVIEWED',
          submittedAt: at(date, '18:35'),
          reviewedById: dIndex === historyDays.length - 1 ? null : users.get('EMP004')!,
          reviewedAt: dIndex === historyDays.length - 1 ? null : at(date, '19:10'),
          workSummary: 'Progressed on assigned items, one blocker raised with the vendor.',
          pendingReason: 'Waiting on review feedback for the submitted item.',
          blockers: dIndex % 3 === 0 ? 'Third-party API credentials still pending.' : null,
          nextDayPlan: 'Close the review comments and pick up the next queued task.',
          totalHours: 8,
        },
        update: {},
      });
      for (const [i, t] of userTasks.entries()) {
        const existing = await prisma.eodItem.findFirst({ where: { eodId: eod.id, taskId: t.id } });
        if (existing) continue;
        await prisma.eodItem.create({
          data: {
            eodId: eod.id,
            taskId: t.id,
            titleSnapshot: titles[createdTasks.findIndex((c) => c.id === t.id)] ?? 'Task',
            category: i === 0 ? 'COMPLETED' : t.status === 'BLOCKED' ? 'BLOCKED' : 'PENDING',
            statusAtEod: t.status,
            progressAtEod: i === 0 ? 100 : 55,
            hoursSpent: 2.5,
            note: 'Progress recorded from the day plan.',
            sortOrder: i,
          },
        });
      }
    }
  }
  console.log(`  attendance/SOD/EOD history: ${historyDays.length} day(s) × ${assignableCodes.length} employees`);

  // -- A pending leave request to demo the approval queue ------------------
  const casual = await prisma.leaveType.findUnique({ where: { code: 'CL' } });
  if (casual) {
    await prisma.leaveRequest.create({
      data: {
        userId: users.get('EMP007')!,
        leaveTypeId: casual.id,
        startDate: day(4),
        endDate: day(5),
        days: 2,
        reason: 'Family function out of town.',
        status: 'PENDING',
      },
    });
    await prisma.leaveBalance.updateMany({
      where: { userId: users.get('EMP007')!, leaveTypeId: casual.id, year },
      data: { pending: 2 },
    });
  }

  await prisma.notification.create({
    data: {
      userId: users.get('EMP006')!,
      type: 'TASK_ASSIGNED',
      title: 'Welcome to the Task Management System',
      body: 'Your daily plan is generated automatically each morning.',
      link: '/dashboard',
    },
  });

  console.log('\nSeed complete.');
  console.log(`  Admin      admin@acme.test     / ${PASSWORD}`);
  console.log(`  HR         hr@acme.test        / ${PASSWORD}`);
  console.log(`  Manager    manager@acme.test   / ${PASSWORD}`);
  console.log(`  Team Lead  lead@acme.test      / ${PASSWORD}`);
  console.log(`  Employee   ananya@acme.test    / ${PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    // Two clients are live here: this script's, and the shared one used by the
    // hierarchy service. Both must be released or the process hangs.
    await Promise.all([prisma.$disconnect(), sharedPrisma.$disconnect()]);
  });
