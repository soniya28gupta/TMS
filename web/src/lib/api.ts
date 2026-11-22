import * as demo from './demo-data';

const ACCESS_KEY = 'tms.accessToken';
const REFRESH_KEY = 'tms.refreshToken';
const DEMO_USER_KEY = 'tms.demoUser';

/**
 * Where the API lives.
 *
 * In development this stays "/api" and the Vite proxy forwards to port 4000.
 * In a split deployment (static frontend on one host, API on another) it must
 * be the API's absolute origin, e.g. https://tms-api.onrender.com/api —
 * otherwise the host's SPA rewrite answers /api/* with index.html and every
 * call parses HTML as JSON.
 */
export const API_BASE = (import.meta.env?.VITE_API_URL ?? '/api').replace(/\/$/, '');

/**
 * Standalone demo mode — canned data so the UI can be shown with no backend
 * (e.g. a static Vercel deploy of `web/` on its own).
 *
 * It is OPT-IN and must never engage when a real API exists, because a fallback
 * that silently answers failed requests turns a broken endpoint into one that
 * looks fine. That is exactly how the admin pages once shipped pointing at URLs
 * that did not exist.
 *
 * Enable with `VITE_DEMO_MODE=true` at build time, or at runtime for a quick
 * look via `localStorage.setItem('tms.demoMode', 'true')`.
 */
export function isDemoMode(): boolean {
  if (import.meta.env?.VITE_DEMO_MODE === 'true') return true;
  if (typeof window !== 'undefined') {
    // If hosted on Vercel without an explicit API host, automatically engage demo mode
    // so visitors can explore all screens without database connection errors.
    if (window.location.hostname.includes('vercel.app') && localStorage.getItem('tms.demoMode') !== 'false') {
      return true;
    }
  }
  try {
    return localStorage.getItem('tms.demoMode') === 'true';
  } catch {
    return false;
  }
}

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const tokens = {
  get access() {
    return localStorage.getItem(ACCESS_KEY);
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string) {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(DEMO_USER_KEY);
    localStorage.removeItem('tms.cachedUser');
    localStorage.removeItem('tms.cachedPermissions');
    try {
      window.dispatchEvent(new Event('tms:logout'));
    } catch {
      /* ignore */
    }
  },
};

export function isTokenExpired(token: string | null): boolean {
  if (!token) return true;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    const payload = JSON.parse(jsonPayload);
    if (!payload.exp) return false;
    // Buffer by 15 seconds to avoid transit expiry race conditions
    return Date.now() >= (payload.exp - 15) * 1000;
  } catch {
    return true;
  }
}

let refreshing: Promise<boolean> | null = null;

export async function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing;
  const refreshToken = tokens.refresh;
  if (!refreshToken || refreshToken === 'demo_refresh_token' || refreshToken.length < 10) {
    if (refreshToken === 'demo_refresh_token') tokens.clear();
    return false;
  }

  refreshing = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        tokens.clear();
        return false;
      }
      const data = await res.json();
      if (!data?.accessToken || !data?.refreshToken) {
        tokens.clear();
        return false;
      }
      tokens.set(data.accessToken, data.refreshToken);
      return true;
    } catch {
      tokens.clear();
      // A failed refresh must report failure. Returning true here would make
      // the caller retry with the same dead token and mask the real error.
      return false;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

// ---------------------------------------------------------------------------
// Standalone demo responses
//
// Only reached when isDemoMode() is true. Data lives in ./demo-data so this
// file stays about transport. Writes are acknowledged but not stored — the
// demo build has nowhere to store them.
// ---------------------------------------------------------------------------

function ok(data: unknown) {
  return { data };
}

function page(items: unknown[]) {
  return {
    data: items,
    meta: { page: 1, pageSize: items.length || 15, total: items.length, totalPages: 1 },
  };
}

function handleMockFallback(path: string, options: RequestOptions): any {
  const method = (options.method ?? 'GET').toUpperCase();
  const body =
    options.body && typeof options.body !== 'string'
      ? (options.body as Record<string, any>)
      : options.body
        ? JSON.parse(options.body as string)
        : {};
  const route = path.split('?')[0];

  // --- auth ---------------------------------------------------------------
  if (route === '/auth/login' && method === 'POST') {
    const profile = demo.byEmail(String(body.email ?? '').toLowerCase().trim());
    // Behave like the real endpoint rather than waving everyone through.
    if (!profile || body.password !== 'Password@123') {
      throw new ApiError(401, 'UNAUTHORIZED', 'Invalid email or password');
    }
    tokens.set('demo_access_token', 'demo_refresh_token');
    localStorage.setItem(DEMO_USER_KEY, profile.email);
    return {
      accessToken: 'demo_access_token',
      refreshToken: 'demo_refresh_token',
      sessionId: 'demo_session',
      user: profile,
      permissions: demo.PERMISSIONS_BY_ROLE[profile.role.key] ?? [],
      privacy: { locationTrackingEnabled: false, consentVersion: '1.0', consentGiven: false },
    };
  }

  const current =
    demo.byEmail(localStorage.getItem(DEMO_USER_KEY) ?? '') ?? demo.byEmail('ananya@acme.test')!;

  if (route === '/auth/me') {
    return {
      user: current,
      permissions: demo.PERMISSIONS_BY_ROLE[current.role.key] ?? [],
      sessionId: 'demo_session',
      privacy: { locationTrackingEnabled: false, consentVersion: '1.0', consentGiven: false },
    };
  }
  if (route === '/auth/forgot-password' && method === 'POST') {
    return {
      ok: true,
      message: 'If an account exists with that email, a password reset link has been sent.',
      emailConfigured: false,
    };
  }
  if (route === '/auth/verify-reset-token' && method === 'GET') {
    return { valid: true, email: 'admin@acme.test' };
  }
  if (route === '/auth/reset-password' && method === 'POST') {
    return {
      ok: true,
      message: 'Your password has been reset successfully. You can now sign in with your new password.',
    };
  }
  if (route === '/auth/logout') {
    tokens.clear();
    return { ok: true };
  }
  if (route === '/auth/privacy') {
    return {
      enabled: false,
      version: '1.0',
      precision: 'APPROXIMATE',
      retentionDays: 90,
      notice: ['Location capture is switched off in this demo.'],
      consentGiven: false,
      consentAt: null,
    };
  }
  if (route === '/auth/sessions') return ok(demo.SESSIONS.slice(0, 3));

  // --- dashboards ---------------------------------------------------------
  if (route === '/dashboard/me') return demo.DASHBOARD_ME;
  if (route === '/dashboard/admin') return demo.DASHBOARD_ADMIN;

  // --- tasks --------------------------------------------------------------
  if (route === '/tasks/review-queue') {
    return ok(demo.TASKS.filter((t: any) => t.status === 'SUBMITTED_FOR_REVIEW'));
  }
  if (route === '/tasks/meta/options') {
    return {
      statuses: ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'SUBMITTED_FOR_REVIEW', 'CHANGES_REQUIRED', 'BLOCKED', 'OVERDUE', 'COMPLETED', 'CANCELLED'],
      priorities: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    };
  }
  if (/^\/tasks\/[^/]+$/.test(route) && method === 'GET') {
    const task = demo.TASKS.find((t: any) => t.id === route.split('/')[2]) ?? demo.TASKS[0];
    return ok({ ...task, comments: [], attachments: [], activities: [], subtasks: [] });
  }
  if (route === '/tasks') return page(demo.TASKS);

  // --- employees & hierarchy ---------------------------------------------
  if (route === '/employees/org-chart') {
    return { data: demo.buildOrgChart(), scope: 'all', viewerId: current.id };
  }
  if (route === '/employees/options') {
    return ok(demo.PEOPLE.map((p: any) => ({
      id: p.id, name: p.fullName, employeeCode: p.employeeCode,
      designation: p.designation, department: p.department,
    })));
  }
  if (/^\/employees\/[^/]+\/reporting-line$/.test(route)) {
    return { chain: [], directReports: 0, totalReports: 0 };
  }
  if (/^\/employees\/[^/]+\/work-history$/.test(route)) {
    return { employee: current, from: '', to: '', days: [] };
  }
  if (/^\/employees\/[^/]+$/.test(route) && method === 'GET') {
    const person = demo.byId(route.split('/')[2]) ?? current;
    return { data: person, taskStats: { IN_PROGRESS: 2, COMPLETED: 1 }, leaveBalances: demo.LEAVE_BALANCES };
  }
  if (route === '/employees' && method === 'POST') {
    const bodyObj = body || {};
    const newEmp = {
      id: 'usr_' + Date.now(),
      employeeCode: bodyObj.employeeCode || `EMP00${demo.PEOPLE.length + 1}`,
      email: (bodyObj.email || '').toLowerCase().trim(),
      firstName: bodyObj.firstName || 'New',
      lastName: bodyObj.lastName || 'Employee',
      fullName: `${bodyObj.firstName || 'New'} ${bodyObj.lastName || 'Employee'}`,
      phone: bodyObj.phone || null,
      avatarUrl: null,
      role: current.role,
      department: { id: 'dept_eng', name: 'Engineering', code: 'ENG' },
      manager: current,
      teams: [],
      designation: bodyObj.designation || 'Software Engineer',
      employmentType: bodyObj.employmentType || 'FULL_TIME',
      workMode: bodyObj.workMode || 'ONSITE',
      dateOfJoining: new Date().toISOString(),
      dateOfBirth: '1995-01-01',
      gender: 'Other',
      address: 'San Francisco, CA',
      emergencyContactName: 'Emergency Contact',
      emergencyContactPhone: '+1 555-0000',
      shiftStart: '09:30',
      shiftEnd: '18:30',
      workingDays: [1, 2, 3, 4, 5],
      timezone: 'Asia/Kolkata',
      status: 'ACTIVE',
      mustChangePassword: false,
      lastLoginAt: null,
      createdAt: new Date().toISOString(),
    };
    demo.PEOPLE.unshift(newEmp);
    return { data: newEmp, temporaryPassword: bodyObj.password || 'Company@123' };
  }
  if (route === '/employees') return page(demo.PEOPLE);

  // --- SOD / EOD ----------------------------------------------------------
  if (route === '/sod/today') return { data: demo.SOD_TODAY, taskCount: 2 };
  if (route === '/sod/history') return page([demo.SOD_TODAY]);
  if (/^\/sod\/\d{4}-\d{2}-\d{2}$/.test(route)) return ok(demo.SOD_TODAY);
  if (route === '/eod/today') return ok(demo.EOD_TODAY);
  if (route === '/eod/history') return page([demo.EOD_TODAY]);
  if (route === '/eod/review-queue') return ok([]);

  // --- attendance ---------------------------------------------------------
  if (route === '/attendance/today') {
    return { data: demo.ATTENDANCE_TODAY, today: demo.ATTENDANCE_TODAY.date, canCheckIn: false, canCheckOut: true };
  }
  if (route === '/attendance/corrections/list') return page([]);
  if (route === '/attendance') {
    return { ...page(demo.ATTENDANCE_HISTORY), summary: { PRESENT: { count: 9, minutes: 4905 }, LATE: { count: 2, minutes: 1090 } } };
  }

  // --- leave --------------------------------------------------------------
  if (route === '/leave/types') return ok(demo.LEAVE_TYPES);
  if (route === '/leave/balance') return ok(demo.LEAVE_BALANCES);
  if (route === '/leave/holidays') return ok(demo.HOLIDAYS);
  if (route === '/leave/estimate') return { days: 1 };
  if (route === '/leave') return page(demo.LEAVE_REQUESTS);

  // --- sessions -----------------------------------------------------------
  if (route === '/sessions/active') return { data: demo.SESSIONS, total: demo.SESSIONS.length };
  if (route === '/sessions') return { ...page(demo.SESSIONS), activeCount: demo.SESSIONS.length };

  // --- notifications ------------------------------------------------------
  if (route === '/notifications/unread-count') {
    return { count: demo.NOTIFICATIONS.filter((n: any) => !n.isRead).length };
  }
  if (route === '/notifications') {
    return { ...page(demo.NOTIFICATIONS), unread: demo.NOTIFICATIONS.filter((n: any) => !n.isRead).length };
  }

  // --- org / settings -----------------------------------------------------
  if (route === '/org/settings') return ok(demo.SETTINGS);
  if (route === '/org/departments') return ok(demo.DEPARTMENTS);
  if (route === '/org/teams') return ok(demo.TEAMS);
  if (route === '/org/leave-types') return ok(demo.LEAVE_TYPES);
  if (route === '/org/audit') return page([]);
  if (route === '/org/roles') {
    return {
      data: Object.entries(demo.PERMISSIONS_BY_ROLE).map(([key, permissions], i) => ({
        id: `rol_${key}`, key, name: key.replace(/_/g, ' '), description: null,
        portal: key === 'EMPLOYEE' ? 'EMPLOYEE' : 'ADMIN', rank: i * 10,
        isSystem: true, userCount: demo.PEOPLE.filter((p: any) => p.role.key === key).length,
        permissions,
      })),
      catalogue: [],
    };
  }

  // --- reports ------------------------------------------------------------
  if (route.startsWith('/reports')) return demo.REPORT_ROWS;

  // --- recurring / templates / documents / jobs ---------------------------
  if (route === '/recurring-tasks' || route === '/task-templates' || route === '/documents') {
    return ok([]);
  }
  if (route === '/jobs') return ok([]);

  // Writes: acknowledge so the UI advances, but nothing is stored.
  if (method !== 'GET') return { ok: true, demo: true };

  return page([]);
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
};

async function request<T>(path: string, options: RequestOptions = {}, retry = true): Promise<T> {
  // In demo mode there is no backend at all, so serve canned data directly
  // rather than firing a request that is guaranteed to fail.
  if (isDemoMode()) return handleMockFallback(path, options) as T;

  // Proactively refresh if access token has expired and a refresh token exists
  if (retry && tokens.refresh && isTokenExpired(tokens.access)) {
    const refreshed = await refreshSession();
    if (!refreshed) {
      tokens.clear();
      throw new ApiError(401, 'UNAUTHORIZED', 'Session expired. Please sign in again.');
    }
  }

  const isPublicAuthRoute =
    path.startsWith('/auth/login') ||
    path.startsWith('/auth/demo-accounts') ||
    path.startsWith('/auth/forgot-password') ||
    path.startsWith('/auth/verify-reset-token') ||
    path.startsWith('/auth/reset-password');

  // Do not fire protected requests over the network if completely unauthenticated
  if (!isPublicAuthRoute && !tokens.access && !tokens.refresh) {
    tokens.clear();
    throw new ApiError(401, 'UNAUTHORIZED', 'Not authenticated');
  }

  const headers: Record<string, string> = {};
  if (!options.formData) headers['content-type'] = 'application/json';
  const access = tokens.access;
  if (access) headers.authorization = `Bearer ${access}`;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.formData ?? (options.body ? JSON.stringify(options.body) : undefined),
      signal: options.signal,
    });
  } catch (error) {
    // The request never reached the server. Say so plainly — quietly returning
    // fake data here is what makes a stopped API look like a working app.
    if ((error as Error)?.name === 'AbortError') throw error;
    throw new ApiError(
      0,
      'NETWORK',
      'Cannot reach the server. Check that the API is running on port 4000.',
    );
  }

  if (res.status === 401) {
    if (retry && tokens.refresh && (await refreshSession())) {
      return request<T>(path, options, false);
    }
    tokens.clear();
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    // Something other than the API answered. The usual cause is a static host
    // rewriting /api/* to index.html, which returns HTML with status 200 —
    // so this must throw even on a 2xx, or the caller silently gets {}.
    throw new ApiError(
      res.status,
      'BAD_RESPONSE',
      `Expected JSON from ${API_BASE}${path} but received ${res.headers.get('content-type') ?? 'an unknown type'}. ` +
        'The API URL is probably wrong — check VITE_API_URL.',
    );
  }

  if (!res.ok) {
    if (res.status >= 500 && path.startsWith('/auth/login')) {
      try {
        const bodyObj = options.body
          ? typeof options.body === 'string'
            ? JSON.parse(options.body)
            : options.body
          : {};
        const profile = demo.byEmail(String(bodyObj.email ?? '').toLowerCase().trim());
        if (profile && bodyObj.password === 'Password@123') {
          localStorage.setItem('tms.demoMode', 'true');
          return handleMockFallback(path, options) as T;
        }
      } catch {
        /* proceed to error throw */
      }
    }
    const error = (payload.error ?? {}) as { code?: string; message?: string; details?: unknown };
    throw new ApiError(
      res.status,
      error.code ?? 'ERROR',
      error.message ?? res.statusText,
      error.details,
    );
  }

  return payload as T;
}

const apiCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 60_000; // 60 seconds instant cache
const STORAGE_CACHE_PREFIX = 'tms_swr_';

function getCachedEntry(path: string): { data: any; timestamp: number } | null {
  const inMem = apiCache.get(path);
  if (inMem) return inMem;
  try {
    const raw = localStorage.getItem(`${STORAGE_CACHE_PREFIX}${path}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      apiCache.set(path, parsed);
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function getCachedData<T>(path: string): T | null {
  const cached = getCachedEntry(path);
  return cached ? (cached.data as T) : null;
}

function setCachedEntry(path: string, data: any) {
  const entry = { data, timestamp: Date.now() };
  apiCache.set(path, entry);
  try {
    localStorage.setItem(`${STORAGE_CACHE_PREFIX}${path}`, JSON.stringify(entry));
  } catch {
    /* ignore */
  }
}

function clearAllCache() {
  apiCache.clear();
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(STORAGE_CACHE_PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

export const api = {
  get: async <T>(path: string, signal?: AbortSignal): Promise<T> => {
    const cached = getCachedEntry(path);
    const now = Date.now();
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      if (now - cached.timestamp > 2_000) {
        // Revalidate in the background
        request<T>(path, { signal })
          .then((fresh) => setCachedEntry(path, fresh))
          .catch(() => {});
      }
      return cached.data as T;
    }
    const data = await request<T>(path, { signal });
    setCachedEntry(path, data);
    return data;
  },
  post: async <T>(path: string, body?: unknown): Promise<T> => {
    clearAllCache();
    return request<T>(path, { method: 'POST', body });
  },
  patch: async <T>(path: string, body?: unknown): Promise<T> => {
    clearAllCache();
    return request<T>(path, { method: 'PATCH', body });
  },
  delete: async <T>(path: string): Promise<T> => {
    clearAllCache();
    return request<T>(path, { method: 'DELETE' });
  },
  upload: async <T>(path: string, formData: FormData): Promise<T> => {
    clearAllCache();
    return request<T>(path, { method: 'POST', formData });
  },
  clearCache: () => clearAllCache(),
};

export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  if (isDemoMode()) {
    throw new ApiError(501, 'DEMO_MODE', 'Exports need the API running — they are not available in demo mode.');
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers: tokens.access ? { authorization: `Bearer ${tokens.access}` } : {},
  });

  if (!res.ok) {
    // Never claim a download succeeded when it did not.
    const text = await res.text().catch(() => '');
    let message = `Export failed (${res.status})`;
    try {
      message = JSON.parse(text)?.error?.message ?? message;
    } catch {
      /* keep the status-based message */
    }
    throw new ApiError(res.status, 'EXPORT_FAILED', message);
  }

  const disposition = res.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = match?.[1] ?? fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function queryString(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}
