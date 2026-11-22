import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { handler, paginated, parse, skipTake } from '../lib/http';
import { DATE_RE } from '../lib/dates';
import { authenticate, currentUser } from '../auth/middleware';
import { assertCanTouchUser, can, scopeFor, userScopeFilter, visibleUserIds } from '../auth/rbac';
import { deleteStoredFile, persistUpload, sendStoredFile, uploadTo } from '../services/storage.service';
import { notify } from '../services/notification.service';
import {
  SOD_INCLUDE,
  assertCanAccessSodItem,
  addSodEntry,
  assignSodEntryToMany,
  deleteSodItem,
  ensureSodForUser,
  getOrCreateTodaySod,
  submitSod,
  todaysTasksFor,
  loadDayContext,
  updateSodItem,
} from '../services/sod.service';
import { todayInTz } from '../lib/dates';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { SOD_ITEM_STATUS, TASK_PRIORITY } from '../constants';
import { auditFromRequest } from '../services/audit.service';

export const sodRouter = Router();
sodRouter.use(authenticate);

const dateParam = z.string().regex(DATE_RE, 'Expected YYYY-MM-DD');

/** Today's auto-generated plan for the signed-in employee. */
sodRouter.get(
  '/today',
  handler(async (req, res) => {
    const user = currentUser(req);
    const sod = await getOrCreateTodaySod(user.id);
    const ctx = await loadDayContext();
    const tasks = await todaysTasksFor(user.id, todayInTz(ctx.timezone), ctx.timezone);
    res.json({ data: sod, taskCount: tasks.length });
  }),
);

sodRouter.get(
  '/history',
  handler(async (req, res) => {
    const user = currentUser(req);
    const q = parse(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
        userId: z.string().optional(),
        from: dateParam.optional(),
        to: dateParam.optional(),
        status: z.string().optional(),
      }),
      req.query,
    );

    // Employees see only themselves; admin roles see their scope.
    const scopeWhere = q.userId
      ? (await assertCanTouchUser(user, 'sod.read', q.userId), { userId: q.userId })
      : await userScopeFilter(user, 'sod.read');

    const where = {
      ...scopeWhere,
      ...(q.from || q.to ? { date: { gte: q.from ?? '0000-01-01', lte: q.to ?? '9999-12-31' } } : {}),
      ...(q.status ? { status: { in: q.status.split(',') } } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.sod.findMany({
        where,
        include: SOD_INCLUDE,
        orderBy: [{ date: 'desc' }],
        ...skipTake(q.page, q.pageSize),
      }),
      prisma.sod.count({ where }),
    ]);

    res.json(paginated(rows, total, q.page, q.pageSize));
  }),
);

sodRouter.get(
  '/:date',
  handler(async (req, res) => {
    const user = currentUser(req);
    const date = parse(dateParam, req.params.date);
    const targetUserId = typeof req.query.userId === 'string' ? req.query.userId : user.id;
    if (targetUserId !== user.id) await assertCanTouchUser(user, 'sod.read', targetUserId);

    const sod = await ensureSodForUser(targetUserId, date);
    if (!sod) throw notFound('SOD');
    res.json({ data: sod });
  }),
);

const submitSchema = z.object({
  plannedNote: z.string().max(2000).optional(),
  items: z
    .array(
      z.object({
        id: z.string().optional(),
        title: z.string().max(200).optional(),
        plannedOutcome: z.string().max(1000).optional(),
        plannedHours: z.number().min(0).max(24).optional(),
      }),
    )
    .optional(),
});

sodRouter.post(
  '/:date/submit',
  handler(async (req, res) => {
    const user = currentUser(req);
    const date = parse(dateParam, req.params.date);
    const body = parse(submitSchema, req.body);
    const sod = await submitSod(user.id, date, body);
    res.json({ data: sod });
  }),
);

// ---------------------------------------------------------------------------
// Bidirectional entries
//
// One endpoint serves both directions. Omitting `userId` (or naming yourself)
// creates a SELF entry; naming someone else creates an ASSIGNED entry and
// requires `sod.assign` plus scope over that employee.
// ---------------------------------------------------------------------------

const entrySchema = z.object({
  userId: z.string().optional(),
  userIds: z.array(z.string()).optional(),
  title: z.string().min(3).max(200),
  instructions: z.string().max(2000).optional(),
  plannedOutcome: z.string().max(1000).optional(),
  plannedHours: z.number().min(0).max(24).optional(),
  priority: z.enum(TASK_PRIORITY).optional(),
  dueTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

sodRouter.post(
  '/:date/entries',
  handler(async (req, res) => {
    const user = currentUser(req);
    const date = parse(dateParam, req.params.date);
    const body = parse(entrySchema, req.body);

    const targets = body.userIds?.length ? body.userIds : body.userId ? [body.userId] : [user.id];
    const isSelfOnly = targets.length === 1 && targets[0] === user.id;
    const actor = { id: user.id, name: `${user.firstName} ${user.lastName}` };

    if (isSelfOnly) {
      if (!can(user, 'sod.selfEntry')) throw forbidden('Missing permission: sod.selfEntry');
      const item = await addSodEntry(user.id, date, body, actor, 'SELF');
      await auditFromRequest(req, { action: 'sod.self_entry', entity: 'SodItem', entityId: item.id });
      res.status(201).json({ data: [item], count: 1 });
      return;
    }

    if (!can(user, 'sod.assign')) throw forbidden('Missing permission: sod.assign');
    // Assigning is a management action: every target must be inside scope.
    for (const target of targets) {
      await assertCanTouchUser(user, 'sod.read', target);
    }

    const items = await assignSodEntryToMany(targets, date, body, actor);
    await auditFromRequest(req, {
      action: 'sod.assign',
      entity: 'SodItem',
      meta: { date, count: items.length, title: body.title },
    });
    res.status(201).json({ data: items, count: items.length });
  }),
);

sodRouter.patch(
  '/entries/:id',
  handler(async (req, res) => {
    const user = currentUser(req);
    const body = parse(
      z.object({
        title: z.string().min(3).max(200).optional(),
        instructions: z.string().max(2000).optional(),
        plannedOutcome: z.string().max(1000).optional(),
        plannedHours: z.number().min(0).max(24).optional(),
        status: z.enum(SOD_ITEM_STATUS).optional(),
      }),
      req.body,
    );
    res.json({ data: await updateSodItem(req.params.id, user.id, body) });
  }),
);

sodRouter.delete(
  '/entries/:id',
  handler(async (req, res) => {
    const user = currentUser(req);
    await deleteSodItem(req.params.id, user.id, can(user, 'sod.assign'));
    res.json({ ok: true });
  }),
);

// ---------------------------------------------------------------------------
// Attachments on a SOD entry
//
// Both directions again: a manager can attach a brief to a duty they assign,
// and the employee can attach evidence to the work they did. Visibility follows
// the reporting hierarchy — never wider.
// ---------------------------------------------------------------------------

/** Employee ids whose SOD this user may reach, or null for everyone. */
async function sodScope(user: ReturnType<typeof currentUser>) {
  const scope = scopeFor(user, 'sod.read');
  if (!scope || scope === 'own') return { canReadOthers: false, ids: [user.id] };
  return { canReadOthers: true, ids: await visibleUserIds(user, scope) };
}

sodRouter.post(
  '/entries/:id/attachments',
  ...uploadTo('sod'),
  handler(async (req, res) => {
    const user = currentUser(req);
    const { ids, canReadOthers } = await sodScope(user);
    await assertCanAccessSodItem(req.params.id, { id: user.id, canReadOthers }, ids);

    const files = (req.files as Express.Multer.File[]) ?? [];
    if (!files.length) throw badRequest('No files uploaded');

    const note = typeof req.body?.note === 'string' ? req.body.note.slice(0, 500) : null;

    const saved = await Promise.all(
      files.map(async (file) =>
        prisma.sodAttachment.create({
          data: {
            sodItemId: req.params.id,
            uploadedById: user.id,
            storageKey: await persistUpload('sod', file),
            originalName: file.originalname,
            mimeType: file.mimetype,
            size: file.size,
            note,
          },
          include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
        }),
      ),
    );

    // Tell the other party a file landed — the manager if the employee
    // attached evidence, the employee if the manager attached a brief.
    const item = await prisma.sodItem.findUnique({
      where: { id: req.params.id },
      select: { titleSnapshot: true, assignedById: true, sod: { select: { userId: true, date: true } } },
    });
    if (item) {
      const other = item.sod.userId === user.id ? item.assignedById : item.sod.userId;
      if (other && other !== user.id) {
        await notify({
          userId: other,
          type: 'SOD_READY',
          title: `File attached to "${item.titleSnapshot}"`,
          body: `${user.firstName} ${user.lastName} attached ${files.length} file(s).`,
          link: `/sod?date=${item.sod.date}`,
        });
      }
    }

    await auditFromRequest(req, {
      action: 'sod.attachment.upload',
      entity: 'SodAttachment',
      entityId: saved[0]?.id,
      meta: { sodItemId: req.params.id, count: files.length },
    });

    res.status(201).json({ data: saved });
  }),
);

sodRouter.get(
  '/attachments/:id/download',
  handler(async (req, res) => {
    const user = currentUser(req);
    const attachment = await prisma.sodAttachment.findUnique({
      where: { id: req.params.id },
      select: { sodItemId: true, storageKey: true, originalName: true },
    });
    if (!attachment) throw notFound('Attachment');

    const { ids, canReadOthers } = await sodScope(user);
    await assertCanAccessSodItem(attachment.sodItemId, { id: user.id, canReadOthers }, ids);

    await sendStoredFile(res, attachment.storageKey, attachment.originalName);
  }),
);

sodRouter.delete(
  '/attachments/:id',
  handler(async (req, res) => {
    const user = currentUser(req);
    const attachment = await prisma.sodAttachment.findUnique({
      where: { id: req.params.id },
      select: { id: true, sodItemId: true, storageKey: true, uploadedById: true },
    });
    if (!attachment) throw notFound('Attachment');

    const { ids, canReadOthers } = await sodScope(user);
    await assertCanAccessSodItem(attachment.sodItemId, { id: user.id, canReadOthers }, ids);

    // Only the uploader removes their own file, unless you can assign SOD —
    // a manager tidying up a brief they own.
    if (attachment.uploadedById !== user.id && !can(user, 'sod.assign')) {
      throw forbidden('You can only remove files you uploaded');
    }

    await prisma.sodAttachment.delete({ where: { id: attachment.id } });
    await deleteStoredFile(attachment.storageKey);
    res.json({ ok: true });
  }),
);
