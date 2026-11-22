export type Id = string;

export type Role = {
  id: Id;
  key: string;
  name: string;
  description?: string | null;
  portal: 'ADMIN' | 'EMPLOYEE';
  rank?: number;
  isSystem?: boolean;
  userCount?: number;
  permissions?: string[];
};

export type Position = {
  id: Id;
  title: string;
  code: string;
  /** Seniority — lower is more senior. Drives who may hire whom. */
  level: number;
  band: 'EXECUTIVE' | 'MANAGEMENT' | 'LEAD' | 'IC';
  track: string;
  canHire: boolean;
  isActive?: boolean;
  department?: { id: Id; name: string; code: string } | null;
  _count?: { users: number };
};

export type HireableResponse = {
  myPosition: Position | null;
  isSystemAdmin: boolean;
  data: Position[];
  managers: {
    id: Id;
    name: string;
    employeeCode: string;
    positionTitle: string | null;
    positionLevel: number | null;
    department: { id: Id; name: string } | null;
  }[];
  reason?: string;
};

export type SodAttachment = {
  id: Id;
  originalName: string;
  mimeType: string;
  size: number;
  note: string | null;
  createdAt: string;
  uploadedBy: { id: Id; firstName: string; lastName: string };
};

/** Grouped permission catalogue served alongside the roles list. */
export type PermissionCatalogue = {
  group: string;
  items: { key: string; label: string }[];
}[];

export type Department = {
  id: Id;
  name: string;
  code: string;
  description: string | null;
  isActive: boolean;
  head: { id: Id; firstName: string; lastName: string } | null;
  _count?: { users: number; teams: number };
};

export type Team = {
  id: Id;
  name: string;
  description: string | null;
  isActive: boolean;
  department: { id: Id; name: string } | null;
  leader: { id: Id; firstName: string; lastName: string } | null;
  members: {
    id: Id;
    user: { id: Id; firstName: string; lastName: string; employeeCode: string; designation: string | null };
  }[];
};

export type Holiday = {
  id: Id;
  name: string;
  date: string;
  isOptional: boolean;
  description: string | null;
};

export type LeaveType = {
  id: Id;
  name: string;
  code: string;
  defaultDays: number;
  isPaid: boolean;
  allowHalfDay: boolean;
  carryForward: boolean;
  maxCarryForward: number;
  color: string;
  isActive: boolean;
};

export type RecurringTask = {
  id: Id;
  title: string;
  description: string | null;
  priority: string;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  daysOfWeek: string;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  dueAfterDays: number;
  dueTime: string;
  estimatedHours: number | null;
  skipHolidays: boolean;
  isActive: boolean;
  lastRunDate: string | null;
  assignee: { id: Id; firstName: string; lastName: string } | null;
  team: { id: Id; name: string } | null;
  department: { id: Id; name: string } | null;
  _count?: { generatedTasks: number };
};

export type TaskTemplate = {
  id: Id;
  name: string;
  title: string;
  description: string | null;
  priority: string;
  estimatedHours: number | null;
  checklist: string;
  tags: string;
};

export type AuditEntry = {
  id: Id;
  action: string;
  entity: string;
  entityId: string | null;
  meta: string;
  ip: string | null;
  createdAt: string;
  actor: { id: Id; firstName: string; lastName: string; email: string } | null;
};

export type SystemSettings = {
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

export type User = {
  id: Id;
  employeeCode: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  role: Role;
  department: { id: Id; name: string; code: string } | null;
  manager: { id: Id; firstName: string; lastName: string; employeeCode: string } | null;
  teams: { id: Id; name: string }[];
  designation: string | null;
  employmentType: string;
  workMode: string;
  dateOfJoining: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  shiftStart: string;
  shiftEnd: string;
  workingDays: number[];
  timezone: string;
  status: string;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export type Task = {
  id: Id;
  code: string;
  title: string;
  description: string | null;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: string;
  displayStatus: string;
  isOverdue: boolean;
  progress: number;
  estimatedHours: number | null;
  actualHours: number;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  blockedReason: string | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  reviewRounds: number;
  tags: string[];
  assignee: { id: Id; firstName: string; lastName: string; employeeCode: string; avatarUrl: string | null } | null;
  createdBy: { id: Id; firstName: string; lastName: string };
  reviewedBy: { id: Id; firstName: string; lastName: string } | null;
  department: { id: Id; name: string } | null;
  team: { id: Id; name: string } | null;
  counts: { comments: number; attachments: number; subtasks: number };
  createdAt: string;
  updatedAt: string;
};

export type TaskDetail = Task & {
  comments: {
    id: Id;
    body: string;
    isInternal: boolean;
    createdAt: string;
    author: { id: Id; firstName: string; lastName: string; avatarUrl: string | null };
  }[];
  attachments: {
    id: Id;
    originalName: string;
    mimeType: string;
    size: number;
    createdAt: string;
    uploadedBy: { id: Id; firstName: string; lastName: string };
  }[];
  activities: {
    id: Id;
    type: string;
    fromValue: string | null;
    toValue: string | null;
    note: string | null;
    createdAt: string;
    actor: { id: Id; firstName: string; lastName: string } | null;
  }[];
  subtasks: Task[];
};

export type SodItemSource = 'AUTO_TASK' | 'ASSIGNED' | 'SELF';
export type SodItemStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'DROPPED';

export type SodItem = {
  id: Id;
  taskId: Id | null;
  titleSnapshot: string;
  prioritySnapshot: string;
  statusSnapshot: string;
  progressSnapshot: number;
  plannedOutcome: string | null;
  plannedHours: number | null;
  isAcknowledged: boolean;
  /** How the line reached the plan — the bidirectional SOD marker. */
  source: SodItemSource;
  status: SodItemStatus;
  instructions: string | null;
  dueTime: string | null;
  assignedAt: string | null;
  completedAt: string | null;
  assignedBy: { id: Id; firstName: string; lastName: string } | null;
  attachments: SodAttachment[];
  task: { id: Id; code: string; title: string; status: string; priority: string; progress: number; dueDate: string | null; isOverdue: boolean } | null;
};

export type Sod = {
  id: Id;
  date: string;
  status: 'PENDING' | 'SUBMITTED' | 'SKIPPED';
  plannedNote: string | null;
  skipReason: string | null;
  submittedAt: string | null;
  items: SodItem[];
  user?: { id: Id; firstName: string; lastName: string; employeeCode: string };
};

export type EodItem = {
  id: Id;
  taskId: Id | null;
  titleSnapshot: string;
  category: 'COMPLETED' | 'PENDING' | 'BLOCKED' | 'ADDITIONAL';
  statusAtEod: string;
  progressAtEod: number;
  hoursSpent: number | null;
  note: string | null;
  blockerReason: string | null;
  task: { id: Id; code: string; title: string; status: string; priority: string; dueDate: string | null } | null;
};

export type Eod = {
  id: Id;
  date: string;
  status: 'PENDING' | 'SUBMITTED' | 'REVIEWED' | 'CHANGES_REQUESTED';
  workSummary: string | null;
  pendingReason: string | null;
  blockers: string | null;
  additionalWork: string | null;
  nextDayPlan: string | null;
  totalHours: number | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  items: EodItem[];
  user?: { id: Id; firstName: string; lastName: string; employeeCode: string };
  reviewedBy?: { id: Id; firstName: string; lastName: string } | null;
};

export type Attendance = {
  id: Id;
  userId: Id;
  date: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  workedMinutes: number;
  status: string;
  workMode: string;
  note: string | null;
  isManual: boolean;
  user?: { id: Id; firstName: string; lastName: string; employeeCode: string };

  // Present only when the employee consented and policy allows it. Null for
  // viewers without location rights (the server redacts before sending).
  locationConsent: boolean;
  locationRedacted?: boolean;
  checkInLatitude: number | null;
  checkInLongitude: number | null;
  checkInAccuracy: number | null;
  checkInAddress: string | null;
  checkInDistanceMeters: number | null;
  checkInWithinGeofence: boolean | null;
  checkOutLatitude: number | null;
  checkOutLongitude: number | null;
  checkOutAccuracy?: number | null;
  checkOutAddress: string | null;
  checkOutDistanceMeters: number | null;
  checkOutWithinGeofence: boolean | null;
};

export type UserSession = {
  id: Id;
  userId: Id;
  loginAt: string;
  lastSeenAt: string;
  logoutAt: string | null;
  endedReason: string | null;
  ip: string | null;
  device: string | null;
  browser: string | null;
  os: string | null;
  isActive: boolean;
  isCurrent?: boolean;
  isIdle?: boolean;
  loginLatitude: number | null;
  loginLongitude: number | null;
  user?: {
    id: Id;
    firstName: string;
    lastName: string;
    employeeCode: string;
    department: { name: string } | null;
    role: { key: string; name: string };
  };
};

export type PrivacyState = {
  enabled: boolean;
  version: string;
  precision: string;
  retentionDays: number;
  notice: string[];
  consentGiven: boolean;
  consentAt: string | null;
};

export type OrgNode = {
  id: Id;
  name: string;
  employeeCode: string;
  designation: string | null;
  roleKey: string;
  roleName: string;
  department: string | null;
  status: string;
  depth: number;
  directReports: number;
  totalReports: number;
  children: OrgNode[];
};

export type LeaveBalance = {
  id: Id;
  leaveType: { id: Id; name: string; code: string; color: string; isPaid: boolean };
  year: number;
  entitled: number;
  carriedForward: number;
  used: number;
  pending: number;
  available: number;
};

export type LeaveRequest = {
  id: Id;
  userId?: Id;
  startDate: string;
  endDate: string;
  days: number;
  isHalfDay: boolean;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  decisionNote: string | null;
  createdAt: string;
  leaveType: { id: Id; name: string; code: string; color: string };
  user?: { id: Id; firstName: string; lastName: string; employeeCode: string };
  approver?: { id: Id; firstName: string; lastName: string } | null;
};

export type Notification = {
  id: Id;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  isRead: boolean;
  createdAt: string;
};

export type Paginated<T> = {
  data: T[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
};

export type EmployeeDashboard = {
  date: string;
  sod: { status: string; items: number; submittedAt: string | null };
  eod: { status: string; items: number; submittedAt: string | null };
  attendance: {
    status: string;
    checkInAt: string | null;
    checkOutAt: string | null;
    workedHours: number;
    canCheckIn: boolean;
    canCheckOut: boolean;
  };
  tasks: {
    total: number;
    open: number;
    inProgress: number;
    inReview: number;
    changesRequired: number;
    completed: number;
    blocked: number;
    overdue: number;
    dueToday: number;
  };
  leaveBalances: LeaveBalance[];
  unreadNotifications: number;
  upcomingTasks: {
    id: Id;
    code: string;
    title: string;
    status: string;
    priority: string;
    progress: number;
    dueDate: string | null;
    isOverdue: boolean;
  }[];
  assignedDuties?: {
    id: Id;
    titleSnapshot: string;
    prioritySnapshot: string;
    statusSnapshot: string;
    progressSnapshot: number;
    status: string;
    plannedHours: number | null;
    instructions: string | null;
    dueTime: string | null;
    assignedById: string | null;
    assignedByName: string | null;
    createdAt: string;
    sod?: { date: string };
  }[];
  assignedProjects?: {
    id: Id;
    name: string;
    code: string;
    status: string;
    targetDate: string | null;
    progress: number;
    description: string | null;
    lead?: { id: Id; firstName: string; lastName: string } | null;
    department?: { id: Id; name: string } | null;
  }[];
};

export type DepartmentSummary = {
  id: Id;
  name: string;
  code: string;
  headName: string | null;
  totalHeadcount: number;
  presentToday: number;
  wfhToday: number;
  lateToday: number;
  absentToday: number;
  sodSubmitted: number;
  activeTasks: number;
};

export type HierarchyRosterMember = {
  id: Id;
  firstName: string;
  lastName: string;
  employeeCode: string;
  email: string;
  roleName: string;
  departmentName: string | null;
  positionTitle: string | null;
  managerName: string | null;
  workMode: string;
  attendanceStatus: string;
  checkInAt: string | null;
  sodStatus: string;
  eodStatus: string;
  activeTasksCount: number;
};

export type AdminDashboard = {
  date: string;
  employees: { total: number; active: number; new: number; onLeave: number };
  attendance: {
    present: number;
    absent: number;
    late: number;
    wfh: number;
    halfDay: number;
    onLeave: number;
    notMarked: number;
  };
  tasks: {
    total: number;
    pending: number;
    inProgress: number;
    inReview: number;
    changesRequired: number;
    completed: number;
    blocked: number;
    cancelled: number;
    overdue: number;
  };
  sod: { submitted: number; pending: number; skipped: number };
  eod: { submitted: number; pending: number; reviewed: number; changesRequested: number; awaitingReview: number };
  queues: { taskReview: number; leaveApproval: number };
  trend: { date: string; eodTotal: number; eodSubmitted: number; tasksCompleted: number }[];
  departmentBreakdown?: DepartmentSummary[];
  hierarchyRoster?: HierarchyRosterMember[];
};

export type ReportPayload = {
  title: string;
  columns: { key: string; header: string; width?: number }[];
  rows: Record<string, string | number | null>[];
  summary?: Record<string, unknown>;
  period: { from: string; to: string };
};

export type ProjectMember = {
  id: Id;
  projectId: Id;
  userId: Id;
  role: 'LEAD' | 'MEMBER' | 'VIEWER';
  assignedAt: string;
  user: {
    id: Id;
    firstName: string;
    lastName: string;
    employeeCode: string;
    avatarUrl: string | null;
    designation?: string | null;
  };
};

export type ProjectProgressUpdate = {
  id: Id;
  projectId: Id;
  employeeId: Id;
  updateType: 'DAILY' | 'WEEKLY';
  previousProgress: number;
  newProgress: number;
  completedWork: string;
  ongoingWork: string;
  blockers: string | null;
  nextSteps: string;
  additionalNotes: string | null;
  employee?: {
    id: Id;
    firstName: string;
    lastName: string;
    employeeCode: string;
    avatarUrl: string | null;
    role?: { key: string; name: string };
  };
  attachments?: ProjectAttachment[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectAttachment = {
  id: Id;
  projectId: Id;
  progressUpdateId: Id | null;
  submissionId: Id | null;
  uploadedById: Id;
  originalName: string;
  storageKey: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  uploadedBy?: {
    id: Id;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    employeeCode?: string;
  };
};

export type ProjectApprovalHistory = {
  id: Id;
  submissionId: Id;
  action: 'SUBMITTED' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';
  performedById: Id;
  comments: string | null;
  createdAt: string;
  performedBy?: {
    id: Id;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  };
};

export type ProjectSubmission = {
  id: Id;
  projectId: Id;
  submittedById: Id;
  finalSummary: string;
  completedDeliverables: string;
  finalProgress: number;
  outstandingIssues: string | null;
  deliveryDetails: string | null;
  submissionComments: string | null;
  status: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';
  submittedAt: string;
  reviewedById: Id | null;
  reviewedAt: string | null;
  managementComments: string | null;
  submittedBy?: {
    id: Id;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
    employeeCode: string;
    designation?: string | null;
  };
  reviewedBy?: {
    id: Id;
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  };
  attachments?: ProjectAttachment[];
  approvalHistories?: ProjectApprovalHistory[];
  project?: Project;
  createdAt: string;
  updatedAt: string;
};

export type Project = {
  id: Id;
  code: string;
  name: string;
  description: string | null;
  status: 'NOT_STARTED' | 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'UNDER_REVIEW' | 'COMPLETED' | 'REJECTED' | 'ACTIVE' | 'CANCELLED';
  progress: number;
  departmentId?: string | null;
  department: { id: Id; name: string; code: string } | null;
  managerId?: string | null;
  manager: { id: Id; firstName: string; lastName: string; employeeCode: string; avatarUrl: string | null } | null;
  createdById?: string;
  createdBy: { id: Id; firstName: string; lastName: string };
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  members?: ProjectMember[];
  tasks?: Task[];
  progressUpdates?: ProjectProgressUpdate[];
  attachments?: ProjectAttachment[];
  submissions?: ProjectSubmission[];
  counts?: { tasks: number; members: number; progressUpdates?: number; attachments?: number };
  _count?: { tasks: number; members: number; progressUpdates?: number; attachments?: number };
  createdAt: string;
  updatedAt: string;
};

export type UserAccessGrant = {
  id: Id;
  grantorId: Id;
  granteeId: Id;
  targetUserId: Id;
  reason: string | null;
  expiresAt: string | null;
  createdAt: string;
  grantor?: { id: Id; firstName: string; lastName: string; employeeCode: string };
  grantee?: { id: Id; firstName: string; lastName: string; employeeCode: string };
  targetUser?: { id: Id; firstName: string; lastName: string; employeeCode: string; designation?: string | null };
};
