import { Router } from 'express';
import { prisma } from '../db';
import { timeInTz } from '../lib/dates';
import { getSettings } from '../services/settings.service';
import { authRouter } from './auth.routes';
import { employeesRouter } from './employees.routes';
import { tasksRouter } from './tasks.routes';
import { sodRouter } from './sod.routes';
import { eodRouter } from './eod.routes';
import { attendanceRouter } from './attendance.routes';
import { leaveRouter } from './leave.routes';
import { notificationsRouter } from './notifications.routes';
import { orgRouter } from './org.routes';
import { recurringRouter, templatesRouter } from './recurring.routes';
import { documentsRouter, filesRouter } from './documents.routes';
import { dashboardRouter } from './dashboard.routes';
import { reportsRouter } from './reports.routes';
import { jobsRouter } from './jobs.routes';
import { sessionsRouter } from './sessions.routes';
import { positionsRouter } from './positions.routes';
import { projectsRouter } from './projects.routes';
import { grantsRouter } from './grants.routes';

export const apiRouter = Router();

/**
 * Liveness + readiness in one. Load balancers and uptime pingers treat a
 * non-200 as "take me out of rotation", so this actually touches the database —
 * a process that is up but cannot reach Postgres is not healthy.
 */
apiRouter.get('/health', async (_req, res) => {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const settings = await getSettings();
    res.json({
      ok: true,
      service: 'task-management-system',
      time: new Date().toISOString(),
      timezone: settings.timezone,
      localTime: timeInTz(settings.timezone),
      database: { ok: true, latencyMs: Date.now() - startedAt },
      scheduler: process.env.SCHEDULER_ENABLED !== 'false',
      uptimeSeconds: Math.round(process.uptime()),
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      service: 'task-management-system',
      database: { ok: false, error: (error as Error).message },
    });
  }
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/employees', employeesRouter);
apiRouter.use('/tasks', tasksRouter);
apiRouter.use('/sod', sodRouter);
apiRouter.use('/eod', eodRouter);
apiRouter.use('/attendance', attendanceRouter);
apiRouter.use('/leave', leaveRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/org', orgRouter);
apiRouter.use('/recurring-tasks', recurringRouter);
apiRouter.use('/task-templates', templatesRouter);
apiRouter.use('/documents', documentsRouter);
apiRouter.use('/files', filesRouter);
apiRouter.use('/dashboard', dashboardRouter);
apiRouter.use('/reports', reportsRouter);
apiRouter.use('/jobs', jobsRouter);
apiRouter.use('/sessions', sessionsRouter);
apiRouter.use('/positions', positionsRouter);
apiRouter.use('/projects', projectsRouter);
apiRouter.use('/grants', grantsRouter);
