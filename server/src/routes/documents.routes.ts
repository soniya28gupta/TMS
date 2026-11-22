import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { handler, parse } from '../lib/http';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { authenticate, currentUser, requirePermission } from '../auth/middleware';
import { can } from '../auth/rbac';
import { deleteStoredFile, persistUpload, sendStoredFile, uploadTo } from '../services/storage.service';

export const documentsRouter = Router();
documentsRouter.use(authenticate);

documentsRouter.get(
  '/',
  handler(async (req, res) => {
    const user = currentUser(req);
    const q = parse(
      z.object({
        userId: z.string().optional(),
        scope: z.enum(['PERSONAL', 'COMPANY']).optional(),
        category: z.string().optional(),
      }),
      req.query,
    );

    const canSeeAll = can(user, 'document.read.all');
    const targetUserId = q.userId ?? user.id;
    if (targetUserId !== user.id && !canSeeAll) {
      throw forbidden('You can only view your own documents');
    }

    const rows = await prisma.document.findMany({
      where: {
        ...(q.category ? { category: q.category } : {}),
        ...(q.scope === 'COMPANY'
          ? { scope: 'COMPANY' }
          : q.scope === 'PERSONAL'
            ? { scope: 'PERSONAL', userId: targetUserId }
            : // Default view: my personal documents plus everything company-wide.
              { OR: [{ scope: 'COMPANY' }, { scope: 'PERSONAL', userId: targetUserId }] }),
      },
      include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ data: rows });
  }),
);

documentsRouter.post(
  '/',
  ...uploadTo('documents'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = parse(
      z.object({
        title: z.string().min(1).max(160).optional(),
        category: z.string().max(40).default('OTHER'),
        scope: z.enum(['PERSONAL', 'COMPANY']).default('PERSONAL'),
        userId: z.string().optional(),
        isConfidential: z.coerce.boolean().default(false),
      }),
      req.body ?? {},
    );

    if (body.scope === 'COMPANY' && !can(user, 'document.manage')) {
      throw forbidden('Missing permission: document.manage');
    }
    const ownerId = body.scope === 'COMPANY' ? null : (body.userId ?? user.id);
    if (ownerId && ownerId !== user.id && !can(user, 'document.read.all')) {
      throw forbidden('You can only upload documents for yourself');
    }

    const files = (req.files as Express.Multer.File[]) ?? [];
    if (!files.length) throw badRequest('No files uploaded');

    const saved = await Promise.all(
      files.map(async (file) =>
        prisma.document.create({
          data: {
            userId: ownerId,
            scope: body.scope,
            category: body.category,
            title: body.title ?? file.originalname,
            storageKey: await persistUpload('documents', file),
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            isConfidential: body.isConfidential,
            uploadedById: user.id,
          },
        }),
      ),
    );

    res.status(201).json({ data: saved });
  }),
);

documentsRouter.delete(
  '/:id',
  handler(async (req, res) => {
    const user = currentUser(req);
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) throw notFound('Document');

    const isOwner = doc.userId === user.id;
    if (!isOwner && !can(user, 'document.manage')) throw forbidden('Not allowed');

    await prisma.document.delete({ where: { id: doc.id } });
    await deleteStoredFile(doc.storageKey);
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Authenticated file download (task attachments and documents)
// ---------------------------------------------------------------------------

export const filesRouter = Router();
filesRouter.use(authenticate);

filesRouter.get(
  '/documents/:id',
  handler(async (req, res) => {
    const user = currentUser(req);
    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) throw notFound('Document');

    const allowed =
      doc.scope === 'COMPANY' || doc.userId === user.id || can(user, 'document.read.all');
    if (!allowed) throw forbidden('Not allowed');

    await sendStoredFile(res, doc.storageKey, doc.originalName);
  }),
);

filesRouter.get(
  '/attachments/:id',
  handler(async (req, res) => {
    const user = currentUser(req);
    const attachment = await prisma.taskAttachment.findUnique({
      where: { id: req.params.id },
      include: { task: { select: { assigneeId: true, createdById: true, teamId: true, departmentId: true } } },
    });
    if (!attachment) throw notFound('Attachment');

    // Reuse task visibility: if you can see the task, you can fetch its files.
    const t = attachment.task;
    const allowed =
      user.permissions.has('*') ||
      t.assigneeId === user.id ||
      t.createdById === user.id ||
      can(user, 'task.read.all') ||
      (can(user, 'task.read.department') && t.departmentId === user.departmentId) ||
      (can(user, 'task.read.team') && !!t.teamId && user.teamIds.includes(t.teamId));
    if (!allowed) throw forbidden('Not allowed');

    await sendStoredFile(res, attachment.storageKey, path.basename(attachment.originalName));
  }),
);
