import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, isTokenExpired, primeApiCache, refreshSession, tokens } from './api';
import type { User } from './types';

/**
 * Access scopes, widest first. `reports` is the reporting subtree beneath the
 * user in the CEO → Manager → Employee chain.
 */
export type Scope = 'own' | 'team' | 'reports' | 'department' | 'all';
const SCOPE_PRIORITY: Scope[] = ['all', 'department', 'reports', 'team', 'own'];

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  user: User;
  permissions: string[];
};

type AuthState = {
  user: User | null;
  permissions: Set<string>;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  can: (permission: string) => boolean;
  canAny: (...permissions: string[]) => boolean;
  /** Widest scope held for a permission base, e.g. `task.read` → 'all'. */
  scopeOf: (base: string) => Scope | null;
  isAdminPortal: boolean;
};

const CACHED_USER_KEY = 'tms.cachedUser';
const CACHED_PERMS_KEY = 'tms.cachedPermissions';

function getInitialUser(): User | null {
  if (!tokens.access && !tokens.refresh) return null;
  if (isTokenExpired(tokens.access) && !tokens.refresh) {
    tokens.clear();
    return null;
  }
  try {
    const raw = localStorage.getItem(CACHED_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getInitialPermissions(): Set<string> {
  if (!tokens.access && !tokens.refresh) return new Set();
  if (isTokenExpired(tokens.access) && !tokens.refresh) {
    return new Set();
  }
  try {
    const raw = localStorage.getItem(CACHED_PERMS_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const initialUser = getInitialUser();
  const [user, setUser] = useState<User | null>(initialUser);
  const [permissions, setPermissions] = useState<Set<string>>(getInitialPermissions());
  const [loading, setLoading] = useState(!initialUser && (!!tokens.access || !!tokens.refresh));

  const loadSession = useCallback(async () => {
    if (!tokens.access && !tokens.refresh) {
      setUser(null);
      setPermissions(new Set());
      setLoading(false);
      return;
    }
    if (tokens.refresh && isTokenExpired(tokens.access)) {
      const ok = await refreshSession();
      if (!ok) {
        tokens.clear();
        setUser(null);
        setPermissions(new Set());
        setLoading(false);
        return;
      }
    }
    try {
      const data = await api.get<{ user: User; permissions: string[] }>('/auth/me');
      const nextUserJson = JSON.stringify(data.user);
      const nextPermsJson = JSON.stringify(data.permissions);
      const prevUserJson = localStorage.getItem(CACHED_USER_KEY);
      const prevPermsJson = localStorage.getItem(CACHED_PERMS_KEY);

      if (nextUserJson !== prevUserJson) {
        setUser(data.user);
      }
      if (nextPermsJson !== prevPermsJson) {
        setPermissions(new Set(data.permissions));
      }
      try {
        localStorage.setItem(CACHED_USER_KEY, nextUserJson);
        localStorage.setItem(CACHED_PERMS_KEY, nextPermsJson);
      } catch {
        /* storage may be full or disabled */
      }
    } catch {
      tokens.clear();
      localStorage.removeItem(CACHED_USER_KEY);
      localStorage.removeItem(CACHED_PERMS_KEY);
      setUser(null);
      setPermissions(new Set());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    const onLogout = () => {
      setUser(null);
      setPermissions(new Set());
    };
    window.addEventListener('tms:logout', onLogout);
    return () => window.removeEventListener('tms:logout', onLogout);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<LoginResponse>('/auth/login', { email, password });
    tokens.set(data.accessToken, data.refreshToken);
    primeApiCache('/auth/me', { user: data.user, permissions: data.permissions });
    try {
      localStorage.setItem(CACHED_USER_KEY, JSON.stringify(data.user));
      localStorage.setItem(CACHED_PERMS_KEY, JSON.stringify(data.permissions));
    } catch {
      /* ignore */
    }
    setUser(data.user);
    setPermissions(new Set(data.permissions));
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* the session is going away regardless */
    }
    tokens.clear();
    localStorage.removeItem(CACHED_USER_KEY);
    localStorage.removeItem(CACHED_PERMS_KEY);
    setUser(null);
    setPermissions(new Set());
  }, []);

  const value = useMemo<AuthState>(() => {
    const can = (permission: string) => permissions.has('*') || permissions.has(permission);
    return {
      user,
      permissions,
      loading,
      login,
      logout,
      refreshUser: loadSession,
      can,
      canAny: (...list: string[]) => list.some(can),
      scopeOf: (base: string) => {
        if (permissions.has('*')) return 'all';
        // Widest first — mirrors SCOPE_PRIORITY on the server.
        for (const scope of SCOPE_PRIORITY) {
          if (permissions.has(`${base}.${scope}`)) return scope;
        }
        return null;
      },
      isAdminPortal: user?.role.portal === 'ADMIN',
    };
  }, [user, permissions, loading, login, logout, loadSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
