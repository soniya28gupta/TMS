export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

export function formatTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

export function relativeTime(value: string): string {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}

export function todayISO(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function shiftDate(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(Number(bytes))) return '0 B';
  const num = Number(bytes);
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${Math.round(num / 1024)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

export function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

// --- Status vocabularies -----------------------------------------------------

export const TASK_STATUS_STYLES: Record<string, string> = {
  CREATED: 'bg-slate-100 text-slate-700 ring-slate-200',
  ASSIGNED: 'bg-blue-50 text-blue-700 ring-blue-200',
  ACCEPTED: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  IN_PROGRESS: 'bg-amber-50 text-amber-700 ring-amber-200',
  SUBMITTED_FOR_REVIEW: 'bg-purple-50 text-purple-700 ring-purple-200',
  CHANGES_REQUIRED: 'bg-orange-50 text-orange-700 ring-orange-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  BLOCKED: 'bg-rose-50 text-rose-700 ring-rose-200',
  OVERDUE: 'bg-red-100 text-red-800 ring-red-300',
  CANCELLED: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  CREATED: 'Created',
  ASSIGNED: 'Assigned',
  ACCEPTED: 'Accepted',
  IN_PROGRESS: 'In progress',
  SUBMITTED_FOR_REVIEW: 'In review',
  CHANGES_REQUIRED: 'Changes required',
  COMPLETED: 'Completed',
  BLOCKED: 'Blocked',
  OVERDUE: 'Overdue',
  CANCELLED: 'Cancelled',
};

export const PRIORITY_STYLES: Record<string, string> = {
  LOW: 'bg-slate-100 text-slate-600 ring-slate-200',
  MEDIUM: 'bg-sky-50 text-sky-700 ring-sky-200',
  HIGH: 'bg-amber-50 text-amber-700 ring-amber-200',
  CRITICAL: 'bg-red-50 text-red-700 ring-red-200',
};

export const ATTENDANCE_STYLES: Record<string, string> = {
  PRESENT: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  WFH: 'bg-sky-50 text-sky-700 ring-sky-200',
  LATE: 'bg-amber-50 text-amber-700 ring-amber-200',
  HALF_DAY: 'bg-orange-50 text-orange-700 ring-orange-200',
  ON_LEAVE: 'bg-violet-50 text-violet-700 ring-violet-200',
  ABSENT: 'bg-rose-50 text-rose-700 ring-rose-200',
  HOLIDAY: 'bg-slate-100 text-slate-600 ring-slate-200',
  WEEKEND: 'bg-slate-100 text-slate-500 ring-slate-200',
  NOT_MARKED: 'bg-slate-100 text-slate-500 ring-slate-200',
  UNKNOWN: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export const WORKFLOW_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-200',
  SUBMITTED: 'bg-blue-50 text-blue-700 ring-blue-200',
  REVIEWED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  APPROVED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CHANGES_REQUESTED: 'bg-orange-50 text-orange-700 ring-orange-200',
  REJECTED: 'bg-rose-50 text-rose-700 ring-rose-200',
  CANCELLED: 'bg-slate-100 text-slate-500 ring-slate-200',
  SKIPPED: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export const EOD_CATEGORY_STYLES: Record<string, string> = {
  COMPLETED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  PENDING: 'bg-amber-50 text-amber-700 ring-amber-200',
  BLOCKED: 'bg-rose-50 text-rose-700 ring-rose-200',
  ADDITIONAL: 'bg-sky-50 text-sky-700 ring-sky-200',
};

export const SKIP_REASON_LABELS: Record<string, string> = {
  HOLIDAY: 'Public holiday',
  WEEKLY_OFF: 'Weekly off',
  ON_LEAVE: 'On approved leave',
};

export const PROJECT_STATUS_STYLES: Record<string, string> = {
  NOT_STARTED: 'bg-slate-100 text-slate-700 ring-slate-200',
  PLANNING: 'bg-blue-50 text-blue-700 ring-blue-200',
  IN_PROGRESS: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  ON_HOLD: 'bg-amber-50 text-amber-700 ring-amber-200',
  UNDER_REVIEW: 'bg-purple-50 text-purple-700 ring-purple-200',
  COMPLETED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  REJECTED: 'bg-rose-50 text-rose-700 ring-rose-200',
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  CANCELLED: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  NOT_STARTED: 'Not Started',
  PLANNING: 'Planning',
  IN_PROGRESS: 'In Progress',
  ON_HOLD: 'On Hold',
  UNDER_REVIEW: 'Under Review',
  COMPLETED: 'Completed',
  REJECTED: 'Rejected',
  ACTIVE: 'Active',
  CANCELLED: 'Cancelled',
};
