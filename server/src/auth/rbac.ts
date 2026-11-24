import { prisma } from '../db';
import { SCOPE_PRIORITY, SCOPE_RANK, type Scope } from '../constants';
import { forbidden } from '../lib/errors';
import { subtreeUserIds } from '../services/hierarchy.service';

export type AuthUser = {
  id: string;
  email: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  roleId: string;
  roleKey: string;
  roleName: string;
  portal: string;
  permissions: Set<string>;
  departmentId: string | null;
  managerId: string | null;
  teamIds: string[];
  timezone: string;
  status: string;
  mustChangePassword: boolean;
  hierarchyPath: string;
  hierarchyDepth: number;
  locationConsentAt: Date | null;
  locationConsentVersion: string | null;
  /** Set by the auth middleware for the life of the request. */
  sessionId?: string | null;
};

const AUTH_USER_CACHE_TTL_MS = 15_000;
const authUserCache = new Map<string, { user: AuthUser; expiresAt: number }>();
const authUserInFlight = new Map<string, Promise<AuthUser | null>>();

export function invalidateAuthUserCache(userId?: string): void {
  if (userId) {
    authUserCache.delete(userId);
  } else {
    authUserCache.clear();
  }
}

export async function loadAuthUser(userId: string): Promise<AuthUser | null> {
  const now = Date.now();
  const cached = authUserCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return { ...cached.user };
  }

  const existing = authUserInFlight.get(userId);
  if (existing) {
    const res = await existing;
    return res ? { ...res } : null;
  }

  const promise = (async () => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { include: { permissions: true } },
        teamMemberships: { select: { teamId: true } },
        teamsLed: { select: { id: true } },
      },
    });
    if (!user) return null;

    const teamIds = [
      ...new Set([...user.teamMemberships.map((m) => m.teamId), ...user.teamsLed.map((t) => t.id)]),
    ];

    const authUser: AuthUser = {
      id: user.id,
      email: user.email,
      employeeCode: user.employeeCode,
      firstName: user.firstName,
      lastName: user.lastName,
      roleId: user.roleId,
      roleKey: user.role.key,
      roleName: user.role.name,
      portal: user.role.portal,
      permissions: new Set(user.role.permissions.map((p) => p.permission)),
      departmentId: user.departmentId,
      managerId: user.managerId,
      teamIds,
      timezone: user.timezone,
      status: user.status,
      mustChangePassword: user.mustChangePassword,
      hierarchyPath: user.hierarchyPath,
      hierarchyDepth: user.hierarchyDepth,
      locationConsentAt: user.locationConsentAt,
      locationConsentVersion: user.locationConsentVersion,
    };

    authUserCache.set(userId, { user: authUser, expiresAt: Date.now() + AUTH_USER_CACHE_TTL_MS });
    return { ...authUser };
  })().finally(() => {
    authUserInFlight.delete(userId);
  });

  authUserInFlight.set(userId, promise);
  return promise;
}

export function can(user: AuthUser, permission: string): boolean {
  return user.permissions.has('*') || user.permissions.has(permission);
}

/** Widest scope the user holds for `base` (e.g. "task.read"), or null. */
export function scopeFor(user: AuthUser, base: string): Scope | null {
  if (user.permissions.has('*')) return 'all';
  for (const scope of SCOPE_PRIORITY) {
    if (user.permissions.has(`${base}.${scope}`)) return scope;
  }
  return null;
}

export function requireScope(user: AuthUser, base: string): Scope {
  const scope = scopeFor(user, base);
  if (!scope) throw forbidden(`Missing permission: ${base}`);
  return scope;
}

export function hasScopeAtLeast(user: AuthUser, base: string, minimum: Scope): boolean {
  const scope = scopeFor(user, base);
  return scope !== null && SCOPE_RANK[scope] >= SCOPE_RANK[minimum];
}

/**
 * Employee ids the user may see at the given scope.
 * `null` means "everyone" — callers should then apply no user filter at all.
 */
export async function visibleUserIds(user: AuthUser, scope: Scope): Promise<string[] | null> {
  if (scope === 'all') return null;

  // Active access grants assigned to this user by admin/founder
  const now = new Date();
  const activeGrants = await prisma.userAccessGrant.findMany({
    where: {
      granteeId: user.id,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    select: { targetUserId: true },
  });
  const grantedIds = activeGrants.map((g) => g.targetUserId);

  if (scope === 'own') return [...new Set([user.id, ...grantedIds])];

  // The whole reporting line: a manager sees their own subtree and nothing
  // else, however wide or deep it runs.
  if (scope === 'reports') {
    const subtree = await subtreeUserIds(user.id);
    return [...new Set([...subtree, ...grantedIds])];
  }

  const ids = new Set<string>([user.id, ...grantedIds]);

  // Direct reports are always visible to whoever manages them.
  const reports = await prisma.user.findMany({
    where: { managerId: user.id },
    select: { id: true },
  });
  reports.forEach((r) => ids.add(r.id));

  if (scope === 'team' && user.teamIds.length) {
    const members = await prisma.teamMember.findMany({
      where: { teamId: { in: user.teamIds } },
      select: { userId: true },
    });
    members.forEach((m) => ids.add(m.userId));
  }

  if (scope === 'department' && user.departmentId) {
    const peers = await prisma.user.findMany({
      where: { departmentId: user.departmentId },
      select: { id: true },
    });
    peers.forEach((p) => ids.add(p.id));
  }

  return [...ids];
}

/** Convenience: resolve `base` to a Prisma `where` fragment on a user column. */
export async function userScopeFilter(
  user: AuthUser,
  base: string,
  column = 'userId',
): Promise<Record<string, unknown>> {
  const scope = requireScope(user, base);
  const ids = await visibleUserIds(user, scope);
  if (ids === null) return {};
  return { [column]: { in: ids } };
}

/** Throws unless the actor may act on the given employee at `base` scope. */
export async function assertCanTouchUser(
  user: AuthUser,
  base: string,
  targetUserId: string,
): Promise<void> {
  const scope = requireScope(user, base);
  const ids = await visibleUserIds(user, scope);
  if (ids === null || ids.includes(targetUserId)) return;
  throw forbidden('This employee is outside your access scope');
}
