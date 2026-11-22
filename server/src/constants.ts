/**
 * Shared vocabulary for the whole system.
 *
 * Enum-like values live here as `as const` tuples rather than Prisma enums so
 * the schema stays portable between SQLite (dev/free) and PostgreSQL (prod).
 */

export const TASK_STATUS = [
  'CREATED',
  'ASSIGNED',
  'ACCEPTED',
  'IN_PROGRESS',
  'SUBMITTED_FOR_REVIEW',
  'CHANGES_REQUIRED',
  'COMPLETED',
  'BLOCKED',
  'CANCELLED',
] as const;
export type TaskStatus = (typeof TASK_STATUS)[number];

/** `OVERDUE` is a derived view over `isOverdue`, not a stored workflow state. */
export const TASK_STATUS_FILTERS = [...TASK_STATUS, 'OVERDUE'] as const;

/** Statuses that still count as live work for SOD generation and dashboards. */
export const OPEN_TASK_STATUSES: TaskStatus[] = [
  'CREATED',
  'ASSIGNED',
  'ACCEPTED',
  'IN_PROGRESS',
  'CHANGES_REQUIRED',
  'BLOCKED',
];

export const CLOSED_TASK_STATUSES: TaskStatus[] = ['COMPLETED', 'CANCELLED'];

/** Allowed workflow transitions. Guards every status write. */
export const TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  CREATED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['ACCEPTED', 'IN_PROGRESS', 'BLOCKED', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'BLOCKED', 'CANCELLED'],
  IN_PROGRESS: ['SUBMITTED_FOR_REVIEW', 'BLOCKED', 'COMPLETED', 'CANCELLED'],
  SUBMITTED_FOR_REVIEW: ['COMPLETED', 'CHANGES_REQUIRED', 'CANCELLED'],
  CHANGES_REQUIRED: ['IN_PROGRESS', 'SUBMITTED_FOR_REVIEW', 'BLOCKED', 'CANCELLED'],
  COMPLETED: ['IN_PROGRESS'], // reopen
  BLOCKED: ['IN_PROGRESS', 'ACCEPTED', 'CANCELLED'],
  CANCELLED: [],
};

export const TASK_PRIORITY = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type TaskPriority = (typeof TASK_PRIORITY)[number];

export const SOD_STATUS = ['PENDING', 'SUBMITTED', 'SKIPPED'] as const;
export const EOD_STATUS = ['PENDING', 'SUBMITTED', 'REVIEWED', 'CHANGES_REQUESTED'] as const;
export const EOD_ITEM_CATEGORY = ['COMPLETED', 'PENDING', 'BLOCKED', 'ADDITIONAL'] as const;

export const ATTENDANCE_STATUS = [
  'PRESENT',
  'ABSENT',
  'LATE',
  'HALF_DAY',
  'ON_LEAVE',
  'HOLIDAY',
  'WEEKEND',
  'WFH',
] as const;

export const LEAVE_STATUS = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export const REQUEST_STATUS = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export const USER_STATUS = ['ACTIVE', 'INACTIVE', 'SUSPENDED'] as const;
export const WORK_MODE = ['ONSITE', 'REMOTE', 'HYBRID'] as const;
export const EMPLOYMENT_TYPE = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN'] as const;

export const PROJECT_STATUS = [
  'NOT_STARTED',
  'PLANNING',
  'IN_PROGRESS',
  'ON_HOLD',
  'UNDER_REVIEW',
  'COMPLETED',
  'REJECTED',
] as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[number];

export const PROJECT_UPDATE_TYPE = ['DAILY', 'WEEKLY'] as const;
export type ProjectUpdateType = (typeof PROJECT_UPDATE_TYPE)[number];

export const PROJECT_SUBMISSION_STATUS = [
  'PENDING',
  'APPROVED',
  'CHANGES_REQUESTED',
  'REJECTED',
] as const;
export type ProjectSubmissionStatus = (typeof PROJECT_SUBMISSION_STATUS)[number];

export const NOTIFICATION_TYPE = [
  'TASK_ASSIGNED',
  'TASK_REASSIGNED',
  'TASK_DUE_SOON',
  'TASK_OVERDUE',
  'TASK_BLOCKED',
  'TASK_REVIEW_REQUIRED',
  'TASK_APPROVED',
  'TASK_CHANGES_REQUIRED',
  'TASK_COMMENT',
  'SOD_READY',
  'SOD_REMINDER',
  'SOD_MISSING',
  'EOD_REMINDER',
  'EOD_MISSING',
  'EOD_REVIEW_REQUIRED',
  'EOD_REVIEWED',
  'LEAVE_REQUESTED',
  'LEAVE_APPROVED',
  'LEAVE_REJECTED',
  'ATTENDANCE_MISSING',
  'ATTENDANCE_CORRECTION_REQUESTED',
  'ATTENDANCE_CORRECTION_REVIEWED',
  'ANNOUNCEMENT',
  'PROJECT_UPDATE_SUBMITTED',
  'PROJECT_PROGRESS_CHANGED',
  'PROJECT_ATTACHMENT_UPLOADED',
  'PROJECT_SUBMITTED_FOR_REVIEW',
  'PROJECT_CHANGES_REQUESTED',
  'PROJECT_APPROVED',
  'PROJECT_REJECTED',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPE)[number];

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * Permission format: `resource.action` for global abilities and
 * `resource.action.scope` where scope ∈ own | team | department | all.
 * `*` is the super-admin wildcard.
 */
export const SCOPES = ['own', 'team', 'reports', 'department', 'all'] as const;
export type Scope = (typeof SCOPES)[number];

/**
 * Roughly increasing breadth. `reports` is the reporting subtree — everyone at
 * or below the user in the CEO → Manager → Employee chain. It sits between
 * `team` and `department` because a manager's line is usually wider than one
 * team but is not guaranteed to cover a whole department.
 */
export const SCOPE_RANK: Record<Scope, number> = {
  own: 0,
  team: 1,
  reports: 2,
  department: 3,
  all: 4,
};

/** Widest-first order used when resolving which scope a user holds. */
export const SCOPE_PRIORITY: Scope[] = ['all', 'department', 'reports', 'team', 'own'];

export const SOD_ITEM_SOURCE = ['AUTO_TASK', 'ASSIGNED', 'SELF'] as const;
export type SodItemSource = (typeof SOD_ITEM_SOURCE)[number];

export const SOD_ITEM_STATUS = ['PENDING', 'IN_PROGRESS', 'DONE', 'DROPPED'] as const;
export type SodItemStatus = (typeof SOD_ITEM_STATUS)[number];

export const SESSION_END_REASONS = [
  'LOGOUT',
  'REVOKED',
  'PASSWORD_CHANGE',
  'ACCOUNT_DISABLED',
  'EXPIRED',
] as const;

export const LOCATION_PRECISION = ['EXACT', 'APPROXIMATE'] as const;

export const PERMISSION_CATALOGUE: { group: string; items: { key: string; label: string }[] }[] = [
  {
    group: 'Employees',
    items: [
      { key: 'employee.read.own', label: 'View own profile' },
      { key: 'employee.read.team', label: 'View team members' },
      { key: 'employee.read.reports', label: 'View own reporting line' },
      { key: 'employee.read.department', label: 'View department employees' },
      { key: 'employee.read.all', label: 'View all employees' },
      { key: 'employee.hierarchy.read', label: 'View the organisation chart' },
      { key: 'employee.hierarchy.manage', label: 'Change reporting lines' },
      { key: 'employee.create', label: 'Create employees' },
      { key: 'employee.update.own', label: 'Edit own profile' },
      { key: 'employee.update.all', label: 'Edit any employee' },
      { key: 'employee.deactivate', label: 'Deactivate employees' },
      { key: 'employee.resetPassword', label: 'Reset employee passwords' },
    ],
  },
  {
    group: 'Tasks',
    items: [
      { key: 'task.read.own', label: 'View own tasks' },
      { key: 'task.read.team', label: 'View team tasks' },
      { key: 'task.read.reports', label: 'View reporting-line tasks' },
      { key: 'task.read.department', label: 'View department tasks' },
      { key: 'task.read.all', label: 'View all tasks' },
      { key: 'task.create', label: 'Create and assign tasks' },
      { key: 'task.update.own', label: 'Update own tasks' },
      { key: 'task.update.team', label: 'Update team tasks' },
      { key: 'task.update.reports', label: 'Update reporting-line tasks' },
      { key: 'task.update.department', label: 'Update department tasks' },
      { key: 'task.update.all', label: 'Update any task' },
      { key: 'task.reassign', label: 'Reassign tasks' },
      { key: 'task.review', label: 'Review and approve tasks' },
      { key: 'task.delete', label: 'Cancel/delete tasks' },
      { key: 'task.recurring.manage', label: 'Manage recurring tasks' },
      { key: 'task.template.manage', label: 'Manage task templates' },
    ],
  },
  {
    group: 'SOD / EOD',
    items: [
      { key: 'sod.read.own', label: 'View own SOD' },
      { key: 'sod.read.team', label: 'View team SOD' },
      { key: 'sod.read.reports', label: 'View reporting-line SOD' },
      { key: 'sod.read.department', label: 'View department SOD' },
      { key: 'sod.read.all', label: 'View all SOD' },
      { key: 'sod.submit', label: 'Submit own SOD' },
      { key: 'sod.selfEntry', label: 'Add own SOD entries' },
      { key: 'sod.assign', label: 'Assign SOD entries to employees' },
      { key: 'eod.read.own', label: 'View own EOD' },
      { key: 'eod.read.team', label: 'View team EOD' },
      { key: 'eod.read.reports', label: 'View reporting-line EOD' },
      { key: 'eod.read.department', label: 'View department EOD' },
      { key: 'eod.read.all', label: 'View all EOD' },
      { key: 'eod.submit', label: 'Submit own EOD' },
      { key: 'eod.review', label: 'Review EOD submissions' },
    ],
  },
  {
    group: 'Attendance',
    items: [
      { key: 'attendance.read.own', label: 'View own attendance' },
      { key: 'attendance.read.team', label: 'View team attendance' },
      { key: 'attendance.read.reports', label: 'View reporting-line attendance' },
      { key: 'attendance.read.department', label: 'View department attendance' },
      { key: 'attendance.read.all', label: 'View all attendance' },
      { key: 'attendance.mark', label: 'Check in / check out' },
      { key: 'attendance.manage', label: 'Edit attendance records' },
      { key: 'attendance.correction.request', label: 'Request attendance correction' },
      { key: 'attendance.correction.review', label: 'Approve attendance corrections' },
    ],
  },
  {
    group: 'Leave',
    items: [
      { key: 'leave.read.own', label: 'View own leave' },
      { key: 'leave.read.team', label: 'View team leave' },
      { key: 'leave.read.reports', label: 'View reporting-line leave' },
      { key: 'leave.read.department', label: 'View department leave' },
      { key: 'leave.read.all', label: 'View all leave' },
      { key: 'leave.apply', label: 'Apply for leave' },
      { key: 'leave.approve', label: 'Approve / reject leave' },
      { key: 'leave.manage', label: 'Manage leave types and balances' },
    ],
  },
  {
    group: 'Reports',
    items: [
      { key: 'report.read.own', label: 'View own reports' },
      { key: 'report.read.team', label: 'View team reports' },
      { key: 'report.read.reports', label: 'View reporting-line reports' },
      { key: 'report.read.department', label: 'View department reports' },
      { key: 'report.read.all', label: 'View company-wide reports' },
      { key: 'report.export', label: 'Export reports' },
      { key: 'payroll.read', label: 'View payroll data' },
    ],
  },
  {
    group: 'Documents',
    items: [
      { key: 'document.read.own', label: 'View own documents' },
      { key: 'document.read.all', label: 'View all employee documents' },
      { key: 'document.upload.own', label: 'Upload own documents' },
      { key: 'document.manage', label: 'Manage company documents' },
    ],
  },
  {
    group: 'Activity & location',
    items: [
      { key: 'session.read.own', label: 'View own login sessions' },
      { key: 'session.read.team', label: 'View team login sessions' },
      { key: 'session.read.reports', label: 'View reporting-line sessions' },
      { key: 'session.read.department', label: 'View department sessions' },
      { key: 'session.read.all', label: 'View all login sessions' },
      { key: 'session.revoke', label: 'Sign employees out of a device' },
      { key: 'location.read.own', label: 'View own captured locations' },
      { key: 'location.read.team', label: 'View team locations' },
      { key: 'location.read.reports', label: 'View reporting-line locations' },
      { key: 'location.read.department', label: 'View department locations' },
      { key: 'location.read.all', label: 'View all captured locations' },
      { key: 'privacy.manage', label: 'Configure location & retention policy' },
    ],
  },
  {
    group: 'Administration',
    items: [
      { key: 'org.manage', label: 'Manage departments and teams' },
      { key: 'role.manage', label: 'Manage roles and permissions' },
      { key: 'settings.read', label: 'View system settings' },
      { key: 'settings.manage', label: 'Change system settings' },
      { key: 'holiday.manage', label: 'Manage holiday calendar' },
      { key: 'audit.read', label: 'View audit log' },
      { key: 'notification.broadcast', label: 'Send announcements' },
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_CATALOGUE.flatMap((g) => g.items.map((i) => i.key));

const EMPLOYEE_PERMISSIONS = [
  'employee.read.own',
  'employee.update.own',
  'employee.hierarchy.read',
  'task.read.own',
  'task.update.own',
  'sod.read.own',
  'sod.submit',
  'sod.selfEntry',
  'eod.read.own',
  'eod.submit',
  'attendance.read.own',
  'attendance.mark',
  'attendance.correction.request',
  'leave.read.own',
  'leave.apply',
  'report.read.own',
  'document.read.own',
  'document.upload.own',
  'session.read.own',
  'location.read.own',
];

const TEAM_LEAD_PERMISSIONS = [
  ...EMPLOYEE_PERMISSIONS,
  'employee.read.team',
  // Hiring is delegated down the hierarchy: this grants the *capability*, while
  // the position catalogue decides *who* they may add — only positions more
  // junior than their own, placed inside their own reporting line.
  'employee.create',
  'task.read.team',
  'task.create',
  'task.update.team',
  'task.reassign',
  'task.review',
  'task.recurring.manage',
  'task.template.manage',
  'sod.read.team',
  'sod.assign',
  'eod.read.team',
  'eod.review',
  'attendance.read.team',
  'leave.read.team',
  'report.read.team',
  'report.export',
  'session.read.team',
];

/**
 * A Manager is scoped to their own reporting line, not to a whole department.
 * Everything below uses `.reports`, which resolves to the manager's subtree in
 * the CEO → Manager → Employee chain.
 */
const MANAGER_PERMISSIONS = [
  ...TEAM_LEAD_PERMISSIONS,
  'employee.read.reports',
  'task.read.reports',
  'task.update.reports',
  'task.delete',
  'sod.read.reports',
  'eod.read.reports',
  'attendance.read.reports',
  'attendance.correction.review',
  'leave.read.reports',
  'leave.approve',
  'report.read.reports',
  'session.read.reports',
  'location.read.reports',
];

/**
 * The CEO sits at the root of the hierarchy: full visibility of people and
 * work everywhere, without the system-administration powers that belong to the
 * Super Admin (roles, integrations, credentials).
 */
const CEO_PERMISSIONS = [
  ...EMPLOYEE_PERMISSIONS,
  'employee.read.all',
  'employee.create',
  'employee.update.all',
  'employee.hierarchy.manage',
  'task.read.all',
  'task.create',
  'task.update.all',
  'task.reassign',
  'task.review',
  'task.delete',
  'task.recurring.manage',
  'task.template.manage',
  'sod.read.all',
  'sod.assign',
  'eod.read.all',
  'eod.review',
  'attendance.read.all',
  'leave.read.all',
  'leave.approve',
  'report.read.all',
  'report.export',
  'document.read.all',
  'session.read.all',
  'location.read.all',
  'org.manage',
  'settings.read',
  'audit.read',
  'notification.broadcast',
];

const HR_ADMIN_PERMISSIONS = [
  ...EMPLOYEE_PERMISSIONS,
  'employee.read.all',
  'employee.hierarchy.manage',
  'session.read.all',
  'session.revoke',
  'location.read.all',
  'privacy.manage',
  'sod.assign',
  'employee.create',
  'employee.update.all',
  'employee.deactivate',
  'employee.resetPassword',
  'task.read.all',
  'task.create',
  'task.update.all',
  'task.reassign',
  'task.review',
  'task.delete',
  'task.recurring.manage',
  'task.template.manage',
  'sod.read.all',
  'eod.read.all',
  'eod.review',
  'attendance.read.all',
  'attendance.manage',
  'attendance.correction.review',
  'leave.read.all',
  'leave.approve',
  'leave.manage',
  'report.read.all',
  'report.export',
  'document.read.all',
  'document.manage',
  'org.manage',
  'settings.read',
  'holiday.manage',
  'notification.broadcast',
];

const FINANCE_PERMISSIONS = [
  ...EMPLOYEE_PERMISSIONS,
  'employee.read.all',
  'attendance.read.all',
  'leave.read.all',
  'report.read.all',
  'report.export',
  'payroll.read',
  'settings.read',
];

export const DEFAULT_ROLES = [
  {
    key: 'SUPER_ADMIN',
    name: 'Super Admin',
    portal: 'ADMIN',
    rank: 0,
    description: 'Unrestricted access to every module and setting.',
    permissions: ['*'],
  },
  {
    key: 'CEO',
    name: 'CEO',
    portal: 'ADMIN',
    rank: 5,
    description: 'Root of the reporting hierarchy — full visibility of every employee and all work.',
    permissions: CEO_PERMISSIONS,
  },
  {
    key: 'HR_ADMIN',
    name: 'HR Admin',
    portal: 'ADMIN',
    rank: 10,
    description: 'Employee lifecycle, attendance, leave, documents and HR reporting.',
    permissions: HR_ADMIN_PERMISSIONS,
  },
  {
    key: 'MANAGER',
    name: 'Manager',
    portal: 'ADMIN',
    rank: 20,
    description: 'Sees and manages only the employees in their own reporting line.',
    permissions: MANAGER_PERMISSIONS,
  },
  {
    key: 'TEAM_LEAD',
    name: 'Team Leader',
    portal: 'ADMIN',
    rank: 30,
    description: 'Assigns and reviews work for their own team.',
    permissions: TEAM_LEAD_PERMISSIONS,
  },
  {
    key: 'FINANCE',
    name: 'Finance',
    portal: 'ADMIN',
    rank: 30,
    description: 'Read-only workforce data plus payroll access.',
    permissions: FINANCE_PERMISSIONS,
  },
  {
    key: 'EMPLOYEE',
    name: 'Employee',
    portal: 'EMPLOYEE',
    rank: 90,
    description: 'Own tasks, SOD/EOD, attendance, leave and profile.',
    permissions: EMPLOYEE_PERMISSIONS,
  },
] as const;

// ---------------------------------------------------------------------------
// System settings (seeded into the Setting table, editable from the UI)
// ---------------------------------------------------------------------------

export const DEFAULT_SETTINGS = {
  companyName: 'Trade Amplification',
  timezone: 'Asia/Kolkata',
  workingDays: [0, 1, 2, 3, 4, 5, 6], // 7 days a week (0 = Sunday, 6 = Saturday)
  workStartTime: '09:30',
  workEndTime: '18:30',
  lateGraceMinutes: 15,
  halfDayAfterMinutes: 240,
  fullDayMinutes: 480,
  sodGenerateTime: '08:00',
  sodReminderTime: '10:00',
  eodReminderTime: '18:00',
  eodMissingCheckTime: '21:00',
  dayCloseTime: '23:45',
  overdueScanCron: '0 * * * *',
  autoAcceptTasks: false,
  requireEodReview: true,
  emailNotificationsEnabled: false,
  leaveYearStartMonth: 1,

  // --- Activity & location policy (privacy defaults are the safe ones) ---
  /** Master switch. Off means no coordinate is ever stored, for anyone. */
  locationTrackingEnabled: false,
  /** EXACT stores what the device reports; APPROXIMATE rounds to ~1 km. */
  locationPrecision: 'EXACT' as string,
  /** Coordinates older than this are wiped by the nightly retention job. */
  locationRetentionDays: 90,
  /** Closed sessions older than this are deleted. */
  sessionRetentionDays: 180,
  /** Bump when the privacy notice text changes — re-asks every employee. */
  locationConsentVersion: '1.0',
  /** Optional office geofence. Radius 0 disables the distance check. */
  officeLatitude: 0,
  officeLongitude: 0,
  officeRadiusMeters: 0,
  /** Idle minutes after which a session is treated as ended. */
  sessionIdleTimeoutMinutes: 720,
} as const;

export type SettingsShape = {
  companyName: string;
  timezone: string;
  workingDays: number[];
  workStartTime: string;
  workEndTime: string;
  lateGraceMinutes: number;
  halfDayAfterMinutes: number;
  fullDayMinutes: number;
  sodGenerateTime: string;
  sodReminderTime: string;
  eodReminderTime: string;
  eodMissingCheckTime: string;
  dayCloseTime: string;
  overdueScanCron: string;
  autoAcceptTasks: boolean;
  requireEodReview: boolean;
  emailNotificationsEnabled: boolean;
  leaveYearStartMonth: number;
  locationTrackingEnabled: boolean;
  locationPrecision: string;
  locationRetentionDays: number;
  sessionRetentionDays: number;
  locationConsentVersion: string;
  officeLatitude: number;
  officeLongitude: number;
  officeRadiusMeters: number;
  sessionIdleTimeoutMinutes: number;
};
