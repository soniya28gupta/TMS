import { prisma } from '../db';
import { badRequest, conflict } from '../lib/errors';

/**
 * Reporting hierarchy: CEO → Manager → Employee (any depth).
 *
 * Each user carries a materialised `hierarchyPath` of the form
 * `/rootId/managerId/ownId/`. Two consequences make the whole feature cheap:
 *
 *   • subtree(X)  = users whose path starts with X's path  → one indexed query
 *   • ancestors(X)= the ids already inside X's own path     → zero queries
 *
 * The cost is that the paths must be rebuilt whenever a manager changes, which
 * is rare and handled by `setManager` / `rebuildSubtreePaths` below.
 */

export const PATH_SEPARATOR = '/';

export function buildPath(parentPath: string | null, userId: string): string {
  const base = parentPath && parentPath !== PATH_SEPARATOR ? parentPath : PATH_SEPARATOR;
  return `${base}${userId}${PATH_SEPARATOR}`;
}

/** Ancestor ids, closest manager last, taken straight from the stored path. */
export function ancestorIdsFromPath(path: string, selfId: string): string[] {
  return path.split(PATH_SEPARATOR).filter((id) => id && id !== selfId);
}

/** Every user at or below `userId` in the reporting chain, including them. */
export async function subtreeUserIds(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { hierarchyPath: true },
  });
  if (!user || user.hierarchyPath === PATH_SEPARATOR) {
    // Path not built yet — fall back to a direct-reports walk so access control
    // never silently widens to "everyone".
    return walkSubtree(userId);
  }
  const rows = await prisma.user.findMany({
    where: { hierarchyPath: { startsWith: user.hierarchyPath } },
    select: { id: true },
  });
  const ids = rows.map((r) => r.id);
  return ids.includes(userId) ? ids : [userId, ...ids];
}

/** Breadth-first fallback used only when a path is missing. */
async function walkSubtree(rootId: string, maxDepth = 20): Promise<string[]> {
  const collected = new Set<string>([rootId]);
  let frontier = [rootId];

  for (let depth = 0; depth < maxDepth && frontier.length; depth += 1) {
    const children = await prisma.user.findMany({
      where: { managerId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((c) => c.id).filter((id) => !collected.has(id));
    frontier.forEach((id) => collected.add(id));
  }
  return [...collected];
}

export async function isInReportingLine(managerId: string, employeeId: string): Promise<boolean> {
  if (managerId === employeeId) return true;
  const [manager, employee] = await Promise.all([
    prisma.user.findUnique({ where: { id: managerId }, select: { hierarchyPath: true } }),
    prisma.user.findUnique({ where: { id: employeeId }, select: { hierarchyPath: true } }),
  ]);
  if (!manager || !employee) return false;
  if (manager.hierarchyPath === PATH_SEPARATOR) {
    return (await walkSubtree(managerId)).includes(employeeId);
  }
  return employee.hierarchyPath.startsWith(manager.hierarchyPath);
}

/**
 * Points `userId` at a new manager and rewrites the affected paths.
 * Rejects cycles — you cannot report to someone who reports to you.
 */
export async function setManager(userId: string, managerId: string | null): Promise<void> {
  if (managerId === userId) throw badRequest('An employee cannot report to themselves');

  if (managerId) {
    const manager = await prisma.user.findUnique({
      where: { id: managerId },
      select: { id: true, hierarchyPath: true },
    });
    if (!manager) throw badRequest('That manager does not exist');
    if (await isInReportingLine(userId, managerId)) {
      throw conflict('That would create a loop in the reporting hierarchy');
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { managerId } });
  await rebuildSubtreePaths(userId);
}

/** Recomputes `hierarchyPath`/`hierarchyDepth` for a user and everyone below. */
export async function rebuildSubtreePaths(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, managerId: true },
  });
  if (!user) return 0;

  const parent = user.managerId
    ? await prisma.user.findUnique({
        where: { id: user.managerId },
        select: { hierarchyPath: true, hierarchyDepth: true },
      })
    : null;

  const path = buildPath(parent?.hierarchyPath ?? null, user.id);
  const depth = parent ? parent.hierarchyDepth + 1 : 0;

  await prisma.user.update({
    where: { id: user.id },
    data: { hierarchyPath: path, hierarchyDepth: depth },
  });

  let updated = 1;
  const children = await prisma.user.findMany({
    where: { managerId: user.id },
    select: { id: true },
  });
  for (const child of children) {
    updated += await rebuildSubtreePaths(child.id);
  }
  return updated;
}

/**
 * Rebuilds every path from the roots down. Cheap enough to run at boot and
 * after bulk imports; guarantees the tree is consistent even if a write was
 * interrupted.
 */
export async function rebuildAllPaths(): Promise<number> {
  const roots = await prisma.user.findMany({
    where: { managerId: null },
    select: { id: true },
  });
  let updated = 0;
  for (const root of roots) updated += await rebuildSubtreePaths(root.id);

  // Anyone still on the default path is in a detached cycle — surface it
  // rather than leaving them invisible to every manager.
  const orphans = await prisma.user.count({ where: { hierarchyPath: PATH_SEPARATOR } });
  if (orphans > 0) {
    console.warn(`[hierarchy] ${orphans} user(s) are not reachable from any root`);
  }
  return updated;
}

export type OrgNode = {
  id: string;
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

/**
 * Builds the org chart for everyone the caller may see. `rootId` narrows it to
 * one branch — a manager viewing the chart sees their own line only.
 */
export async function buildOrgChart(visibleIds: string[] | null, rootId?: string): Promise<OrgNode[]> {
  const users = await prisma.user.findMany({
    where: {
      ...(visibleIds ? { id: { in: visibleIds } } : {}),
      status: { not: 'INACTIVE' },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      employeeCode: true,
      designation: true,
      managerId: true,
      hierarchyDepth: true,
      status: true,
      role: { select: { key: true, name: true } },
      department: { select: { name: true } },
    },
    orderBy: [{ hierarchyDepth: 'asc' }, { firstName: 'asc' }],
  });

  const nodes = new Map<string, OrgNode>();
  for (const user of users) {
    nodes.set(user.id, {
      id: user.id,
      name: `${user.firstName} ${user.lastName}`,
      employeeCode: user.employeeCode,
      designation: user.designation,
      roleKey: user.role.key,
      roleName: user.role.name,
      department: user.department?.name ?? null,
      status: user.status,
      depth: user.hierarchyDepth,
      directReports: 0,
      totalReports: 0,
      children: [],
    });
  }

  const roots: OrgNode[] = [];
  for (const user of users) {
    const node = nodes.get(user.id)!;
    const parent = user.managerId ? nodes.get(user.managerId) : undefined;
    // Someone whose manager is outside the visible set becomes a local root —
    // that is exactly what a manager should see when they open the chart.
    if (parent && user.id !== rootId) {
      parent.children.push(node);
      parent.directReports += 1;
    } else {
      roots.push(node);
    }
  }

  const countTotals = (node: OrgNode): number => {
    node.totalReports = node.children.reduce((sum, child) => sum + 1 + countTotals(child), 0);
    return node.totalReports;
  };
  roots.forEach(countTotals);

  if (rootId) {
    const requested = nodes.get(rootId);
    return requested ? [requested] : [];
  }
  return roots;
}
