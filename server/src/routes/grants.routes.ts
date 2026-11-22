import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { handler, parse } from '../lib/http';
import { forbidden, notFound } from '../lib/errors';
import { authenticate, currentUser } from '../auth/middleware';

export const grantsRouter = Router();
grantsRouter.use(authenticate);

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

    const grants = await prisma.userAccessGrant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        grantor: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        grantee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } },
        targetUser: { select: { id: true, firstName: true, lastName: true, employeeCode: true, designation: true } },
      },
    });

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
      include: {
        grantee: true,
        targetUser: true,
      },
    });

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
    res.status(204).end();
  }),
);
