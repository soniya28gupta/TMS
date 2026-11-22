/**
 * Canned data for the standalone demo build (`VITE_DEMO_MODE=true`).
 *
 * This exists so the UI can be shown without a backend — a static deploy with
 * no API, database or scheduler. It is a facade: nothing persists, and writes
 * are acknowledged without being stored.
 *
 * It mirrors the seed organisation so the demo matches what the real system
 * looks like on first run. Keep the shapes in step with `server/src/routes/*`;
 * where they drift, the real API is the source of truth.
 */

type Json = Record<string, any>;

const today = new Date().toISOString().slice(0, 10);
const iso = (day: number, time = '09:30') => {
  const d = new Date();
  d.setDate(d.getDate() + day);
  return `${d.toISOString().slice(0, 10)}T${time}:00.000Z`;
};
const dayStr = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

// --- People ------------------------------------------------------------------

function person(
  id: string,
  code: string,
  first: string,
  last: string,
  email: string,
  roleKey: string,
  roleName: string,
  portal: 'ADMIN' | 'EMPLOYEE',
  designation: string,
  dept: [string, string, string] | null,
  managerId: string | null,
): Json {
  return {
    id,
    employeeCode: code,
    email,
    firstName: first,
    lastName: last,
    fullName: `${first} ${last}`,
    phone: '+91 90000 00000',
    avatarUrl: null,
    role: { id: `rol_${roleKey.toLowerCase()}`, key: roleKey, name: roleName, portal },
    department: dept ? { id: dept[0], name: dept[1], code: dept[2] } : null,
    manager: null,
    managerId,
    teams: [],
    designation,
    employmentType: 'FULL_TIME',
    workMode: 'ONSITE',
    dateOfJoining: '2024-04-01T00:00:00.000Z',
    dateOfBirth: null,
    gender: null,
    address: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    shiftStart: '09:30',
    shiftEnd: '18:30',
    workingDays: [1, 2, 3, 4, 5],
    timezone: 'Asia/Kolkata',
    status: 'ACTIVE',
    mustChangePassword: false,
    lastLoginAt: iso(0, '09:12'),
    createdAt: '2024-04-01T00:00:00.000Z',
  };
}

const ENG: [string, string, string] = ['dept_eng', 'Engineering', 'ENG'];
const SLS: [string, string, string] = ['dept_sls', 'Sales', 'SLS'];
const HR: [string, string, string] = ['dept_hr', 'Human Resources', 'HR'];
const OPS: [string, string, string] = ['dept_ops', 'Operations', 'OPS'];
const FIN: [string, string, string] = ['dept_fin', 'Finance', 'FIN'];

export const PEOPLE: Json[] = [
  person('usr_ceo', 'EMP000', 'Kavita', 'Menon', 'ceo@acme.test', 'CEO', 'CEO', 'ADMIN', 'Chief Executive Officer', OPS, null),
  person('usr_admin', 'EMP001', 'Aditya', 'Sharma', 'admin@acme.test', 'SUPER_ADMIN', 'Super Admin', 'ADMIN', 'System Administrator', OPS, null),
  person('usr_hr', 'EMP002', 'Priya', 'Nair', 'hr@acme.test', 'HR_ADMIN', 'HR Admin', 'ADMIN', 'HR Manager', HR, 'usr_ceo'),
  person('usr_mgr', 'EMP003', 'Rahul', 'Verma', 'manager@acme.test', 'MANAGER', 'Manager', 'ADMIN', 'Engineering Manager', ENG, 'usr_ceo'),
  person('usr_smgr', 'EMP013', 'Farah', 'Qureshi', 'sales.manager@acme.test', 'MANAGER', 'Manager', 'ADMIN', 'Sales Manager', SLS, 'usr_ceo'),
  person('usr_lead', 'EMP004', 'Sneha', 'Iyer', 'lead@acme.test', 'TEAM_LEAD', 'Team Leader', 'ADMIN', 'Team Lead — Platform', ENG, 'usr_mgr'),
  person('usr_fin', 'EMP005', 'Vikram', 'Singh', 'finance@acme.test', 'FINANCE', 'Finance', 'ADMIN', 'Finance Controller', FIN, 'usr_ceo'),
  person('usr_ananya', 'EMP006', 'Ananya', 'Rao', 'ananya@acme.test', 'EMPLOYEE', 'Employee', 'EMPLOYEE', 'Senior Software Engineer', ENG, 'usr_lead'),
  person('usr_karan', 'EMP007', 'Karan', 'Mehta', 'karan@acme.test', 'EMPLOYEE', 'Employee', 'EMPLOYEE', 'Software Engineer', ENG, 'usr_lead'),
  person('usr_divya', 'EMP008', 'Divya', 'Kulkarni', 'divya@acme.test', 'EMPLOYEE', 'Employee', 'EMPLOYEE', 'QA Engineer', ENG, 'usr_lead'),
  person('usr_rohit', 'EMP009', 'Rohit', 'Gupta', 'rohit@acme.test', 'EMPLOYEE', 'Employee', 'EMPLOYEE', 'Account Executive', SLS, 'usr_smgr'),
  person('usr_meera', 'EMP010', 'Meera', 'Joshi', 'meera@acme.test', 'EMPLOYEE', 'Employee', 'EMPLOYEE', 'Sales Development Rep', SLS, 'usr_smgr'),
  person('usr_neha', 'EMP012', 'Neha', 'Bansal', 'neha@acme.test', 'EMPLOYEE', 'Employee', 'EMPLOYEE', 'HR Executive', HR, 'usr_hr'),
];

export const byEmail = (email: string) => PEOPLE.find((p) => p.email === email);
export const byId = (id: string) => PEOPLE.find((p) => p.id === id);

// --- Permissions -------------------------------------------------------------

const EMPLOYEE_PERMS = [
  'employee.read.own', 'employee.update.own', 'employee.hierarchy.read',
  'task.read.own', 'task.update.own',
  'sod.read.own', 'sod.submit', 'sod.selfEntry',
  'eod.read.own', 'eod.submit',
  'attendance.read.own', 'attendance.mark', 'attendance.correction.request',
  'leave.read.own', 'leave.apply', 'report.read.own',
  'document.read.own', 'document.upload.own',
  'session.read.own', 'location.read.own',
];

const LEAD_PERMS = [
  ...EMPLOYEE_PERMS, 'employee.read.team', 'task.read.team', 'task.create', 'task.update.team',
  'task.reassign', 'task.review', 'task.recurring.manage', 'task.template.manage',
  'sod.read.team', 'sod.assign', 'eod.read.team', 'eod.review',
  'attendance.read.team', 'leave.read.team', 'report.read.team', 'report.export', 'session.read.team',
];

const MANAGER_PERMS = [
  ...LEAD_PERMS, 'employee.read.reports', 'task.read.reports', 'task.update.reports', 'task.delete',
  'sod.read.reports', 'eod.read.reports', 'attendance.read.reports', 'attendance.correction.review',
  'leave.read.reports', 'leave.approve', 'report.read.reports', 'session.read.reports', 'location.read.reports',
];

const CEO_PERMS = [
  ...EMPLOYEE_PERMS, 'employee.read.all', 'employee.create', 'employee.update.all',
  'employee.hierarchy.manage', 'task.read.all', 'task.create', 'task.update.all', 'task.reassign',
  'task.review', 'task.delete', 'task.recurring.manage', 'task.template.manage',
  'sod.read.all', 'sod.assign', 'eod.read.all', 'eod.review', 'attendance.read.all',
  'leave.read.all', 'leave.approve', 'report.read.all', 'report.export', 'document.read.all',
  'session.read.all', 'location.read.all', 'org.manage', 'settings.read', 'audit.read', 'notification.broadcast',
];

const HR_PERMS = [
  ...EMPLOYEE_PERMS, 'employee.read.all', 'employee.create', 'employee.update.all', 'employee.deactivate',
  'employee.resetPassword', 'employee.hierarchy.manage', 'task.read.all', 'task.create', 'task.review',
  'sod.read.all', 'sod.assign', 'eod.read.all', 'eod.review', 'attendance.read.all', 'attendance.manage',
  'attendance.correction.review', 'leave.read.all', 'leave.approve', 'leave.manage', 'report.read.all',
  'report.export', 'document.read.all', 'document.manage', 'org.manage', 'settings.read', 'holiday.manage',
  'notification.broadcast', 'session.read.all', 'session.revoke', 'location.read.all', 'privacy.manage',
];

export const PERMISSIONS_BY_ROLE: Record<string, string[]> = {
  SUPER_ADMIN: ['*'],
  CEO: CEO_PERMS,
  HR_ADMIN: HR_PERMS,
  MANAGER: MANAGER_PERMS,
  TEAM_LEAD: LEAD_PERMS,
  FINANCE: [...EMPLOYEE_PERMS, 'employee.read.all', 'attendance.read.all', 'leave.read.all', 'report.read.all', 'report.export', 'payroll.read', 'settings.read'],
  EMPLOYEE: EMPLOYEE_PERMS,
};

// --- Tasks -------------------------------------------------------------------

const TASK_SEED: [string, string, string, string, number, number][] = [
  ['TSK-000001', 'Implement JWT refresh rotation', 'IN_PROGRESS', 'HIGH', 65, 2],
  ['TSK-000002', 'Fix pagination on the employee list', 'SUBMITTED_FOR_REVIEW', 'MEDIUM', 100, 1],
  ['TSK-000003', 'Write API docs for the task module', 'ASSIGNED', 'LOW', 0, 4],
  ['TSK-000004', 'Set up nightly database backup', 'BLOCKED', 'CRITICAL', 30, -1],
  ['TSK-000005', 'Migrate reporting queries to indexes', 'COMPLETED', 'MEDIUM', 100, -2],
  ['TSK-000006', 'Build the EOD summary export', 'CHANGES_REQUIRED', 'HIGH', 80, 1],
  ['TSK-000007', 'Reduce dashboard load time', 'IN_PROGRESS', 'MEDIUM', 45, 3],
  ['TSK-000008', 'Audit the user permission matrix', 'ASSIGNED', 'HIGH', 0, -1],
];

const ASSIGNEES = ['usr_ananya', 'usr_karan', 'usr_divya', 'usr_rohit'];

export const TASKS: Json[] = TASK_SEED.map(([code, title, status, priority, progress, due], i) => {
  const assignee = byId(ASSIGNEES[i % ASSIGNEES.length])!;
  const overdue = due < 0 && !['COMPLETED', 'CANCELLED'].includes(status);
  return {
    id: `tsk_${i + 1}`,
    code,
    title,
    description: `${title}. Demo record — the live system stores real task history here.`,
    priority,
    status,
    displayStatus: overdue ? 'OVERDUE' : status,
    isOverdue: overdue,
    progress,
    estimatedHours: 6,
    actualHours: Math.round(progress / 20),
    startDate: iso(-3),
    dueDate: iso(due, '18:00'),
    completedAt: status === 'COMPLETED' ? iso(-2, '17:30') : null,
    blockedReason: status === 'BLOCKED' ? 'Waiting on third-party API credentials.' : null,
    reviewNotes: status === 'CHANGES_REQUIRED' ? 'Please add test coverage before resubmitting.' : null,
    reviewedAt: null,
    reviewRounds: status === 'CHANGES_REQUIRED' ? 1 : 0,
    tags: ['demo'],
    assignee: {
      id: assignee.id, firstName: assignee.firstName, lastName: assignee.lastName,
      employeeCode: assignee.employeeCode, avatarUrl: null,
    },
    createdBy: { id: 'usr_lead', firstName: 'Sneha', lastName: 'Iyer' },
    reviewedBy: null,
    department: { id: 'dept_eng', name: 'Engineering' },
    team: { id: 'team_platform', name: 'Platform' },
    counts: { comments: i % 3, attachments: 0, subtasks: 0 },
    createdAt: iso(-4),
    updatedAt: iso(0, '11:20'),
  };
});

// --- SOD / EOD ---------------------------------------------------------------

const sodItem = (id: string, title: string, source: string, extra: Json = {}): Json => ({
  id,
  taskId: extra.taskId ?? null,
  titleSnapshot: title,
  prioritySnapshot: extra.priority ?? 'MEDIUM',
  statusSnapshot: 'ASSIGNED',
  progressSnapshot: extra.progress ?? 0,
  plannedOutcome: extra.plannedOutcome ?? null,
  plannedHours: extra.plannedHours ?? null,
  isAcknowledged: source !== 'ASSIGNED',
  source,
  status: extra.status ?? 'PENDING',
  instructions: extra.instructions ?? null,
  dueTime: extra.dueTime ?? null,
  assignedAt: source === 'ASSIGNED' ? iso(0, '09:05') : null,
  completedAt: null,
  assignedBy: source === 'ASSIGNED' ? { id: 'usr_lead', firstName: 'Sneha', lastName: 'Iyer' } : null,
  task: extra.task ?? null,
});

export const SOD_TODAY: Json = {
  id: 'sod_today',
  date: today,
  status: 'PENDING',
  plannedNote: null,
  skipReason: null,
  submittedAt: null,
  items: [
    sodItem('sodi_1', 'Implement JWT refresh rotation', 'AUTO_TASK', {
      taskId: 'tsk_1', priority: 'HIGH', progress: 65,
      task: { id: 'tsk_1', code: 'TSK-000001', title: 'Implement JWT refresh rotation', status: 'IN_PROGRESS', priority: 'HIGH', progress: 65, dueDate: iso(2, '18:00'), isOverdue: false },
    }),
    sodItem('sodi_2', 'Audit the user permission matrix', 'AUTO_TASK', {
      taskId: 'tsk_8', priority: 'HIGH',
      task: { id: 'tsk_8', code: 'TSK-000008', title: 'Audit the user permission matrix', status: 'ASSIGNED', priority: 'HIGH', progress: 0, dueDate: iso(-1, '18:00'), isOverdue: true },
    }),
    sodItem('sodi_3', 'Run the release checklist before the 4pm cut', 'ASSIGNED', {
      priority: 'HIGH', plannedHours: 2, dueTime: '16:00',
      instructions: 'Cover staging and production, then post the summary in the team channel.',
    }),
    sodItem('sodi_4', 'Pair with QA on the flaky checkout test', 'SELF', { plannedHours: 1 }),
  ],
};

const eodItem = (id: string, title: string, category: string, extra: Json = {}): Json => ({
  id,
  taskId: extra.taskId ?? null,
  titleSnapshot: title,
  category,
  statusAtEod: extra.statusAtEod ?? 'IN_PROGRESS',
  progressAtEod: extra.progress ?? 50,
  hoursSpent: extra.hoursSpent ?? null,
  note: extra.note ?? null,
  blockerReason: extra.blockerReason ?? null,
  task: null,
});

export const EOD_TODAY: Json = {
  id: 'eod_today',
  date: today,
  status: 'PENDING',
  workSummary: null,
  pendingReason: null,
  blockers: null,
  additionalWork: null,
  nextDayPlan: null,
  totalHours: null,
  submittedAt: null,
  reviewedAt: null,
  reviewNotes: null,
  reviewedBy: null,
  items: [
    eodItem('eodi_1', 'Migrate reporting queries to indexes', 'COMPLETED', { taskId: 'tsk_5', statusAtEod: 'COMPLETED', progress: 100 }),
    eodItem('eodi_2', 'Implement JWT refresh rotation', 'PENDING', { taskId: 'tsk_1', progress: 65 }),
    eodItem('eodi_3', 'Set up nightly database backup', 'BLOCKED', { taskId: 'tsk_4', statusAtEod: 'BLOCKED', progress: 30, blockerReason: 'Waiting on third-party API credentials.' }),
  ],
};

// --- Attendance / leave ------------------------------------------------------

export const ATTENDANCE_TODAY: Json = {
  id: 'att_today',
  userId: 'usr_ananya',
  date: today,
  checkInAt: iso(0, '09:24'),
  checkOutAt: null,
  workedMinutes: 320,
  status: 'PRESENT',
  workMode: 'ONSITE',
  note: null,
  isManual: false,
  locationConsent: false,
  checkInLatitude: null, checkInLongitude: null, checkInAccuracy: null, checkInAddress: null,
  checkInDistanceMeters: null, checkInWithinGeofence: null,
  checkOutLatitude: null, checkOutLongitude: null, checkOutAddress: null,
  checkOutDistanceMeters: null, checkOutWithinGeofence: null,
};

export const ATTENDANCE_HISTORY: Json[] = Array.from({ length: 12 }, (_, i) => {
  const offset = -(i + 1);
  const weekend = [0, 6].includes(new Date(dayStr(offset)).getDay());
  return {
    ...ATTENDANCE_TODAY,
    id: `att_${i}`,
    date: dayStr(offset),
    checkInAt: weekend ? null : iso(offset, i % 5 === 0 ? '10:06' : '09:22'),
    checkOutAt: weekend ? null : iso(offset, '18:41'),
    workedMinutes: weekend ? 0 : 545,
    status: weekend ? 'WEEKEND' : i % 5 === 0 ? 'LATE' : 'PRESENT',
  };
});

export const LEAVE_TYPES: Json[] = [
  { id: 'lt_cl', name: 'Casual Leave', code: 'CL', defaultDays: 12, isPaid: true, allowHalfDay: true, carryForward: false, maxCarryForward: 0, color: '#3b82f6', isActive: true },
  { id: 'lt_sl', name: 'Sick Leave', code: 'SL', defaultDays: 8, isPaid: true, allowHalfDay: true, carryForward: false, maxCarryForward: 0, color: '#ef4444', isActive: true },
  { id: 'lt_el', name: 'Earned Leave', code: 'EL', defaultDays: 15, isPaid: true, allowHalfDay: true, carryForward: true, maxCarryForward: 10, color: '#10b981', isActive: true },
  { id: 'lt_lwp', name: 'Unpaid Leave', code: 'LWP', defaultDays: 0, isPaid: false, allowHalfDay: true, carryForward: false, maxCarryForward: 0, color: '#6b7280', isActive: true },
];

export const LEAVE_BALANCES: Json[] = LEAVE_TYPES.map((t, i) => ({
  id: `bal_${t.code}`,
  leaveType: { id: t.id, name: t.name, code: t.code, color: t.color, isPaid: t.isPaid },
  year: new Date().getFullYear(),
  entitled: t.defaultDays,
  carriedForward: 0,
  used: i === 0 ? 3 : i === 1 ? 1 : 0,
  pending: i === 0 ? 2 : 0,
  available: t.defaultDays - (i === 0 ? 5 : i === 1 ? 1 : 0),
}));

export const LEAVE_REQUESTS: Json[] = [
  {
    id: 'lv_1', startDate: dayStr(4), endDate: dayStr(5), days: 2, isHalfDay: false,
    reason: 'Family function out of town.', status: 'PENDING', decisionNote: null, createdAt: iso(-1),
    leaveType: { id: 'lt_cl', name: 'Casual Leave', code: 'CL', color: '#3b82f6' },
    user: { id: 'usr_karan', firstName: 'Karan', lastName: 'Mehta', employeeCode: 'EMP007' },
    approver: null,
  },
  {
    id: 'lv_2', startDate: dayStr(-12), endDate: dayStr(-12), days: 1, isHalfDay: false,
    reason: 'Medical appointment.', status: 'APPROVED', decisionNote: 'Approved.', createdAt: iso(-15),
    leaveType: { id: 'lt_sl', name: 'Sick Leave', code: 'SL', color: '#ef4444' },
    user: { id: 'usr_ananya', firstName: 'Ananya', lastName: 'Rao', employeeCode: 'EMP006' },
    approver: { id: 'usr_lead', firstName: 'Sneha', lastName: 'Iyer' },
  },
];

export const HOLIDAYS: Json[] = [
  { id: 'hol_1', name: 'Independence Day', date: `${new Date().getFullYear()}-08-15`, isOptional: false, description: null },
  { id: 'hol_2', name: 'Gandhi Jayanti', date: `${new Date().getFullYear()}-10-02`, isOptional: false, description: null },
  { id: 'hol_3', name: 'Diwali', date: `${new Date().getFullYear()}-11-08`, isOptional: false, description: null },
  { id: 'hol_4', name: 'Christmas', date: `${new Date().getFullYear()}-12-25`, isOptional: false, description: null },
];

// --- Sessions / notifications ------------------------------------------------

export const SESSIONS: Json[] = PEOPLE.slice(0, 6).map((p, i) => ({
  id: `ses_${i}`,
  userId: p.id,
  loginAt: iso(0, `0${8 + (i % 2)}:${10 + i}`),
  lastSeenAt: iso(0, '13:45'),
  logoutAt: null,
  endedReason: null,
  ip: '203.0.113.' + (10 + i),
  device: i % 3 === 0 ? 'Mobile' : 'Desktop',
  browser: 'Chrome',
  os: i % 3 === 0 ? 'Android' : 'Windows',
  isActive: true,
  isCurrent: i === 0,
  isIdle: i === 4,
  loginLatitude: null,
  loginLongitude: null,
  user: {
    id: p.id, firstName: p.firstName, lastName: p.lastName, employeeCode: p.employeeCode,
    department: p.department ? { name: p.department.name } : null,
    role: { key: p.role.key, name: p.role.name },
  },
}));

export const NOTIFICATIONS: Json[] = [
  { id: 'ntf_1', type: 'TASK_ASSIGNED', title: 'New task assigned: Audit the user permission matrix', body: 'TSK-000008 · due today', link: '/tasks/tsk_8', severity: 'INFO', isRead: false, createdAt: iso(0, '09:05') },
  { id: 'ntf_2', type: 'SOD_READY', title: 'Your plan for today is ready', body: '4 item(s) waiting for your review.', link: '/sod', severity: 'INFO', isRead: false, createdAt: iso(0, '08:00') },
  { id: 'ntf_3', type: 'TASK_OVERDUE', title: 'Task overdue: Set up nightly database backup', body: 'TSK-000004 passed its deadline', link: '/tasks/tsk_4', severity: 'CRITICAL', isRead: true, createdAt: iso(-1, '10:00') },
];

// --- Org chart ---------------------------------------------------------------

export function buildOrgChart(): Json[] {
  const nodes = new Map<string, Json>();
  for (const p of PEOPLE) {
    nodes.set(p.id, {
      id: p.id,
      name: p.fullName,
      employeeCode: p.employeeCode,
      designation: p.designation,
      roleKey: p.role.key,
      roleName: p.role.name,
      department: p.department?.name ?? null,
      status: p.status,
      depth: 0,
      directReports: 0,
      totalReports: 0,
      children: [],
    });
  }

  const roots: Json[] = [];
  for (const p of PEOPLE) {
    const node = nodes.get(p.id)!;
    const parent = p.managerId ? nodes.get(p.managerId) : null;
    if (parent) {
      parent.children.push(node);
      parent.directReports += 1;
      node.depth = 1;
    } else {
      roots.push(node);
    }
  }

  const total = (n: Json): number => {
    n.totalReports = n.children.reduce((sum: number, c: Json) => sum + 1 + total(c), 0);
    return n.totalReports;
  };
  const setDepth = (n: Json, d: number) => {
    n.depth = d;
    n.children.forEach((c: Json) => setDepth(c, d + 1));
  };
  roots.forEach((r) => { setDepth(r, 0); total(r); });
  return roots;
}

// --- Dashboards --------------------------------------------------------------

export const DASHBOARD_ME: Json = {
  date: today,
  sod: { status: 'PENDING', items: SOD_TODAY.items.length, submittedAt: null },
  eod: { status: 'PENDING', items: EOD_TODAY.items.length, submittedAt: null },
  attendance: {
    status: 'PRESENT',
    checkInAt: ATTENDANCE_TODAY.checkInAt,
    checkOutAt: null,
    workedHours: 5.3,
    canCheckIn: false,
    canCheckOut: true,
  },
  tasks: { total: 8, open: 5, inProgress: 2, inReview: 1, changesRequired: 1, completed: 1, blocked: 1, overdue: 2, dueToday: 1 },
  leaveBalances: LEAVE_BALANCES,
  unreadNotifications: NOTIFICATIONS.filter((n) => !n.isRead).length,
  upcomingTasks: TASKS.slice(0, 6).map((t) => ({
    id: t.id, code: t.code, title: t.title, status: t.status,
    priority: t.priority, progress: t.progress, dueDate: t.dueDate, isOverdue: t.isOverdue,
  })),
};

export const DASHBOARD_ADMIN: Json = {
  date: today,
  employees: { total: PEOPLE.length, active: PEOPLE.length, new: 2, onLeave: 1 },
  attendance: { present: 9, absent: 1, late: 1, wfh: 2, halfDay: 0, onLeave: 1, notMarked: 1 },
  tasks: { total: 8, pending: 2, inProgress: 2, inReview: 1, changesRequired: 1, completed: 1, blocked: 1, cancelled: 0, overdue: 2 },
  sod: { submitted: 8, pending: 4, skipped: 1 },
  eod: { submitted: 6, pending: 5, reviewed: 4, changesRequested: 1, awaitingReview: 6 },
  queues: { taskReview: 1, leaveApproval: 1 },
  trend: Array.from({ length: 7 }, (_, i) => ({
    date: dayStr(i - 6),
    eodTotal: 12,
    eodSubmitted: 8 + (i % 4),
    tasksCompleted: 2 + (i % 5),
  })),
};

// --- Settings / roles --------------------------------------------------------

export const SETTINGS: Json = {
  companyName: 'Acme Corp', timezone: 'Asia/Kolkata', workingDays: [1, 2, 3, 4, 5],
  workStartTime: '09:30', workEndTime: '18:30', lateGraceMinutes: 15,
  halfDayAfterMinutes: 240, fullDayMinutes: 480, sodGenerateTime: '08:00',
  sodReminderTime: '10:00', eodReminderTime: '18:00', eodMissingCheckTime: '21:00',
  dayCloseTime: '23:45', autoAcceptTasks: false, requireEodReview: true,
  emailNotificationsEnabled: false, leaveYearStartMonth: 1,
  locationTrackingEnabled: false, locationPrecision: 'APPROXIMATE',
  locationRetentionDays: 90, sessionRetentionDays: 180, locationConsentVersion: '1.0',
  officeLatitude: 0, officeLongitude: 0, officeRadiusMeters: 0, sessionIdleTimeoutMinutes: 720,
};

export const DEPARTMENTS: Json[] = [ENG, SLS, HR, OPS, FIN].map(([id, name, code]) => ({
  id, name, code, description: null, isActive: true,
  head: null,
  _count: { users: PEOPLE.filter((p) => p.department?.id === id).length, teams: id === 'dept_eng' ? 1 : 0 },
}));

export const TEAMS: Json[] = [
  {
    id: 'team_platform', name: 'Platform', description: 'Core services and infrastructure',
    isActive: true, department: { id: 'dept_eng', name: 'Engineering' },
    leader: { id: 'usr_lead', firstName: 'Sneha', lastName: 'Iyer' },
    members: ['usr_ananya', 'usr_karan', 'usr_divya'].map((id, i) => {
      const u = byId(id)!;
      return { id: `tm_${i}`, user: { id: u.id, firstName: u.firstName, lastName: u.lastName, employeeCode: u.employeeCode, designation: u.designation } };
    }),
  },
];

export const REPORT_ROWS: Json = {
  title: 'Employee Productivity Report',
  columns: [
    { key: 'employeeCode', header: 'Code' }, { key: 'name', header: 'Employee' },
    { key: 'department', header: 'Department' }, { key: 'daysPresent', header: 'Days present' },
    { key: 'workedHours', header: 'Hours worked' }, { key: 'tasksCompleted', header: 'Tasks done' },
    { key: 'sodCompliance', header: 'SOD %' }, { key: 'eodCompliance', header: 'EOD %' },
  ],
  rows: PEOPLE.filter((p) => p.role.key === 'EMPLOYEE').map((p, i) => ({
    employeeCode: p.employeeCode,
    name: p.fullName,
    department: p.department?.name ?? '—',
    daysPresent: 18 + (i % 3),
    workedHours: 148 + i * 3,
    tasksCompleted: 9 + i,
    sodCompliance: `${90 + (i % 10)}%`,
    eodCompliance: `${85 + (i % 12)}%`,
  })),
  period: { from: dayStr(-29), to: today },
  generatedAt: new Date().toISOString(),
};
