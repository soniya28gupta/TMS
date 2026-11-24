const ACCESS_KEY = 'tms.accessToken';
const REFRESH_KEY = 'tms.refreshToken';

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
 * No demo mode fallback. All operations use the live database backend API.
 */
export function isDemoMode(): boolean {
  return false;
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
    localStorage.removeItem('tms.demoUser');
    localStorage.removeItem('tms.demoMode');
    localStorage.removeItem('tms.cachedUser');
    localStorage.removeItem('tms.cachedPermissions');
    clearAllCache();
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

type RequestOptions = {
  method?: string;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
};

async function request<T>(path: string, options: RequestOptions = {}, retry = true): Promise<T> {

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

const apiCache = new Map<string, { data: unknown; timestamp: number }>();
const inFlightGets = new Map<string, Promise<unknown>>();
const trackedStorageKeys = new Set<string>();
const CACHE_TTL_MS = 60_000; // 60 seconds instant cache
const REVALIDATE_AFTER_MS = 5_000; // avoid redundant background refetch within 5s
const STORAGE_CACHE_PREFIX = 'tms_swr_';
let storageSynced = false;

function getCachedEntry(path: string): { data: unknown; timestamp: number } | null {
  const inMem = apiCache.get(path);
  if (inMem) return inMem;
  try {
    const storageKey = `${STORAGE_CACHE_PREFIX}${path}`;
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      apiCache.set(path, parsed);
      trackedStorageKeys.add(storageKey);
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

export function primeApiCache(path: string, data: unknown): void {
  setCachedEntry(path, data);
}

function setCachedEntry(path: string, data: unknown) {
  const entry = { data, timestamp: Date.now() };
  apiCache.set(path, entry);
  try {
    const storageKey = `${STORAGE_CACHE_PREFIX}${path}`;
    trackedStorageKeys.add(storageKey);
    localStorage.setItem(storageKey, JSON.stringify(entry));
  } catch {
    /* ignore */
  }
}

function clearAllCache() {
  apiCache.clear();
  inFlightGets.clear();
  try {
    for (const key of trackedStorageKeys) {
      localStorage.removeItem(key);
    }
    trackedStorageKeys.clear();
    if (!storageSynced) {
      storageSynced = true;
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(STORAGE_CACHE_PREFIX)) localStorage.removeItem(k);
      }
    }
  } catch {
    /* ignore */
  }
}

function fetchAndCache<T>(path: string): Promise<T> {
  const existing = inFlightGets.get(path) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = request<T>(path)
    .then((fresh) => {
      setCachedEntry(path, fresh);
      return fresh;
    })
    .finally(() => {
      inFlightGets.delete(path);
    });

  inFlightGets.set(path, promise);
  return promise;
}

export const api = {
  get: async <T>(path: string, _signal?: AbortSignal): Promise<T> => {
    const cached = getCachedEntry(path);
    const now = Date.now();
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      if (now - cached.timestamp > REVALIDATE_AFTER_MS) {
        // Deduplicated background revalidation
        void fetchAndCache<T>(path).catch(() => {});
      }
      return cached.data as T;
    }
    return fetchAndCache<T>(path);
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
