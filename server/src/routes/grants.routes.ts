import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { handler, parse } from '../lib/http';
import { forbidden } from '../lib/errors';
import { authenticate, currentUser } from '../auth/middleware';

export const grantsRouter = Router();
grantsRouter.use(authenticate);

const GRANTS_CACHE_TTL_MS = 5000;
let grantsCache: { expiresAt: number; payload: unknown } | null = null;

function getCachedGrants<T>(): T | null {
  if (!grantsCache) return null;
  if (Date.now() > grantsCache.expiresAt) {
    grantsCache = null;
    return null;
  }
  return grantsCache.payload as T;
}

function setCachedGrants(payload: unknown): void {
  grantsCache = {
    expiresAt: Date.now() + GRANTS_CACHE_TTL_MS,
    payload,
  };
}

function invalidateGrantsCache(): void {
  grantsCache = null;
}

const createGrantSchema = z.object({
  granteeId: z.string(),
  targetUserId: z.string(),
  reason: z.string().optional(),
  expiresAt: z.string().optional(),
});

// ---------------------------------------------------------------------------
// List Active Access Grants
// ---------------------------------------------------------------------------
grantsRouter.get(
  '/',
  handler(async (req, res) => {
    const user = currentUser(req);
    if (!user.permissions.has('*') && !['SUPER_ADMIN', 'HR_ADMIN', 'MANAGER'].includes(user.roleKey)) {
      throw forbidden('Only admins or managers can view access grants');
    }

    const cached = getCachedGrants();
    if (cached) {
      res.json(cached);
      return;
    }

    const grants = await prisma.userAccessGrant.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        grantorId: true,
        granteeId: true,
        targetUserId: true,
        reason: true,
        expiresAt: true,
        createdAt: true,
        grantor: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        grantee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        targetUser: { select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true } },
      },
    });

    setCachedGrants(grants);
    res.json(grants);
  }),
);

// ---------------------------------------------------------------------------
// Create Access Grant (Admin Delegates Access to Target Employee's Dashboard)
// ---------------------------------------------------------------------------
grantsRouter.post(
  '/',
  handler(async (req, res) => {
    const user = currentUser(req);
    if (!user.permissions.has('*') && user.roleKey !== 'SUPER_ADMIN' && user.roleKey !== 'HR_ADMIN') {
      throw forbidden('Only Founder or Super Admin can issue delegated access grants');
    }

    const body = parse(createGrantSchema, req.body);

    const grant = await prisma.userAccessGrant.upsert({
      where: {
        granteeId_targetUserId: {
          granteeId: body.granteeId,
          targetUserId: body.targetUserId,
        },
      },
      create: {
        grantorId: user.id,
        granteeId: body.granteeId,
        targetUserId: body.targetUserId,
        reason: body.reason ?? 'Admin delegated view access',
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
      update: {
        grantorId: user.id,
        reason: body.reason ?? 'Admin delegated view access updated',
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
      select: {
        id: true,
        grantorId: true,
        granteeId: true,
        targetUserId: true,
        reason: true,
        expiresAt: true,
        createdAt: true,
        grantee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        targetUser: { select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true } },
      },
    });

    invalidateGrantsCache();
    res.status(201).json(grant);
  }),
);

// ---------------------------------------------------------------------------
// Revoke Access Grant
// ---------------------------------------------------------------------------
grantsRouter.delete(
  '/:id',
  handler(async (req, res) => {
    const user = currentUser(req);
    if (!user.permissions.has('*') && user.roleKey !== 'SUPER_ADMIN' && user.roleKey !== 'HR_ADMIN') {
      throw forbidden('Only Founder or Super Admin can revoke delegated access grants');
    }

    const { id } = req.params;
    await prisma.userAccessGrant.delete({ where: { id } });
    invalidateGrantsCache();
    res.status(204).end();
  }),
);