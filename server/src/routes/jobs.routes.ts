import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { handler, parse } from '../lib/http';
import { badRequest, forbidden } from '../lib/errors';
import { DATE_RE } from '../lib/dates';
import { env } from '../env';
import { authenticate, requirePermission } from '../auth/middleware';
import { manualJobs, tick } from '../jobs/scheduler';
import { auditFromRequest } from '../services/audit.service';

export const jobsRouter = Router();

const JOB_KEYS = Object.keys(manualJobs) as (keyof typeof manualJobs)[];

/**
 * The scheduler heartbeat, for deployments with no long-running process.
 *
 * On a server the in-process tick runs every minute. On serverless there is no
 * process to hold a timer, so an external scheduler (Vercel Cron, cron-job.org,
 * a GitHub Action) calls this instead. `tick()` is the same function either
 * way, and it is idempotent: calling it twice in a minute does nothing twice.
 *
 * Authenticated by a shared secret rather than a session, because the caller is
 * a machine. Unset secret in production = endpoint disabled, so a misconfigured
 * deployment cannot expose it.
 */
jobsRouter.all(
  '/tick',
  handler(async (req, res) => {
    if (!env.cronSecret) {
      throw forbidden('Cron endpoint is disabled: CRON_SECRET is not configured');
    }

    // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`; other schedulers
    // are easier to configure with a query parameter or custom header.
    const presented =
      req.headers.authorization?.replace(/^Bearer\s+/i, '') ??
      (req.headers['x-cron-secret'] as string | undefined) ??
      (typeof req.query.secret === 'string' ? req.query.secret : undefined);

    if (!presented || !timingSafeEqual(presented, env.cronSecret)) {
      throw forbidden('Invalid cron secret');
    }

    const startedAt = Date.now();
    await tick();
    res.json({ ok: true, ranFor: `${Date.now() - startedAt}ms`, at: new Date().toISOString() });
  }),
);

/** Constant-time compare so the secret cannot be guessed byte by byte. */
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Everything below is for signed-in administrators.
jobsRouter.use(authenticate);

jobsRouter.get(
  '/',
  requirePermission('settings.read'),
  handler(async (_req, res) => {
    res.json({
      data: JOB_KEYS.map((key) => ({ key })),
      note: 'Jobs run automatically on the configured schedule. Manual runs are idempotent.',
    });
  }),
);

/**
 * Fires a scheduled workflow immediately. Every job is safe to re-run: SOD/EOD
 * generation upserts, recurring generation is guarded by lastRunDate, and the
 * overdue scan is a pure recompute.
 */
jobsRouter.post(
  '/:key/run',
  requirePermission('settings.manage'),
  handler(async (req, res) => {
    const key = req.params.key as keyof typeof manualJobs;
    if (!JOB_KEYS.includes(key)) {
      throw badRequest(`Unknown job. Available: ${JOB_KEYS.join(', ')}`);
    }
    const body = parse(z.object({ date: z.string().regex(DATE_RE).optional() }), req.body ?? {});

    const job = manualJobs[key] as (date?: string) => Promise<unknown>;
    const result = await job(body.date);

    await auditFromRequest(req, { action: `job.run.${key}`, entity: 'Job', meta: { date: body.date } });
    res.json({ ok: true, job: key, result });
  }),
);
