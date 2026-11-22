import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { handler, parse } from '../lib/http';
import { notFound } from '../lib/errors';
import { authenticate, currentUser, requirePermission } from '../auth/middleware';
import { requireScope, visibleUserIds } from '../auth/rbac';
import { subtreeUserIds } from '../services/hierarchy.service';
import { POSITION_BANDS, POSITION_TRACKS, canHirePosition } from '../positions';
import { auditFromRequest } from '../services/audit.service';

export const positionsRouter = Router();
positionsRouter.use(authenticate);

const POSITION_SELECT = {
  id: true,
  title: true,
  code: true,
  level: true,
  band: true,
  track: true,
  canHire: true,
  isActive: true,
  department: { select: { id: true, name: true, code: true } },
} as const;

/** The whole catalogue, most senior first. */
positionsRouter.get(
  '/',
  handler(async (req, res) => {
    const q = parse(
      z.object({
        track: z.string().optional(),
        departmentId: z.string().optional(),
        includeInactive: z.coerce.boolean().default(false),
      }),
      req.query,
    );

    const positions = await prisma.position.findMany({
      where: {
        ...(q.includeInactive ? {} : { isActive: true }),
        ...(q.track ? { track: q.track } : {}),
        ...(q.departmentId ? { departmentId: q.departmentId } : {}),
      },
      select: { ...POSITION_SELECT, _count: { select: { users: true } } },
      orderBy: [{ level: 'asc' }, { title: 'asc' }],
    });

    res.json({ data: positions, bands: POSITION_BANDS, tracks: POSITION_TRACKS });
  }),
);

/**
 * Everything the "add employee" screen needs, already filtered:
 * the positions this person may hire into, and the managers those hires may
 * report to. Doing this server-side means the form cannot offer a choice the
 * API would then reject.
 */
positionsRouter.get(
  '/hireable',
  requirePermission('employee.create'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const isSystemAdmin = user.permissions.has('*');

    const me = await prisma.user.findUnique({
      where: { id: user.id },
      select: { position: true },
    });

    const all = await prisma.position.findMany({
      where: { isActive: true },
      select: POSITION_SELECT,
      orderBy: [{ level: 'asc' }, { title: 'asc' }],
    });

    const positions = isSystemAdmin
      ? all
      : all.filter((p) => canHirePosition(me?.position ?? null, p).allowed);

    // Candidate managers: the hirer plus their reporting line, since a new hire
    // must sit beneath the person adding them.
    const scope = requireScope(user, 'employee.read');
    const inScope = isSystemAdmin ? null : await subtreeUserIds(user.id);
    const visible = isSystemAdmin ? await visibleUserIds(user, scope) : inScope;

    const managers = await prisma.user.findMany({
      where: { status: 'ACTIVE', ...(visible ? { id: { in: visible } } : {}) },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeCode: true,
        position: { select: { id: true, title: true, level: true } },
        department: { select: { id: true, name: true } },
      },
      orderBy: [{ hierarchyDepth: 'asc' }, { firstName: 'asc' }],
    });

    res.json({
      // Null when the caller has no position — the UI explains rather than
      // showing an empty list with no reason.
      myPosition: me?.position ?? null,
      isSystemAdmin,
      data: positions,
      managers: managers.map((m) => ({
        id: m.id,
        name: `${m.firstName} ${m.lastName}`,
        employeeCode: m.employeeCode,
        positionTitle: m.position?.title ?? null,
        positionLevel: m.position?.level ?? null,
        department: m.department,
      })),
      reason:
        positions.length === 0
          ? canHirePosition(me?.position ?? null, { level: 999, canHire: false, title: 'anyone' }).reason
          : undefined,
    });
  }),
);

const positionSchema = z.object({
  title: z.string().min(2).max(120),
  code: z.string().min(2).max(40).regex(/^[A-Z0-9_]+$/, 'Use UPPER_SNAKE_CASE'),
  level: z.number().int().min(1).max(1000),
  band: z.enum(POSITION_BANDS),
  track: z.enum(POSITION_TRACKS),
  departmentId: z.string().nullable().optional(),
  canHire: z.boolean().default(false),
});

positionsRouter.post(
  '/',
  requirePermission('org.manage'),
  handler(async (req, res) => {
    const body = parse(positionSchema, req.body);
    const created = await prisma.position.create({
      data: { ...body, departmentId: body.departmentId ?? null },
      select: POSITION_SELECT,
    });
    await auditFromRequest(req, { action: 'position.create', entity: 'Position', entityId: created.id });
    res.status(201).json({ data: created });
  }),
);

positionsRouter.patch(
  '/:id',
  requirePermission('org.manage'),
  handler(async (req, res) => {
    const body = parse(positionSchema.partial().extend({ isActive: z.boolean().optional() }), req.body);
    const existing = await prisma.position.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Position');

    const updated = await prisma.position.update({
      where: { id: req.params.id },
      data: body,
      select: POSITION_SELECT,
    });
    await auditFromRequest(req, {
      action: 'position.update',
      entity: 'Position',
      entityId: updated.id,
      meta: body,
    });
    res.json({ data: updated });
  }),
);
