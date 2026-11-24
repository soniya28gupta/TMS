// Task Management System API — entry point
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { assertProductionSafety, ensureStorageDir, env, warnServerlessGaps } from './env';
import { ensureBucket, usingSupabaseStorage } from './services/storage.service';
import { errorMiddleware } from './lib/http';
import { apiRouter } from './routes';
import { startScheduler, stopScheduler } from './jobs/scheduler';
import { disconnect, prisma } from './db';

async function syncSuperAdminEmail(): Promise<void> {
  const targetEmail = env.superAdminEmail;
  if (!targetEmail) return;
  try {
    const role = await prisma.role.findUnique({ where: { key: 'SUPER_ADMIN' } });
    if (!role) return;
    const admin = await prisma.user.findFirst({ where: { roleId: role.id } });
    if (admin && admin.email !== targetEmail) {
      const collision = await prisma.user.findUnique({ where: { email: targetEmail } });
      if (!collision) {
        await prisma.user.update({
          where: { id: admin.id },
          data: { email: targetEmail },
        });
        console.log(`[auth] Auto-synced Super Admin email to: ${targetEmail}`);
      }
    }
  } catch (err) {
    console.error('[auth] Failed to sync Super Admin email:', err);
  }
}

export function createApp() {
  // Serverless containers construct the app without going through start(), so
  // the timezone pin and the configuration warnings belong here too.
  if (!process.env.TZ) process.env.TZ = 'Asia/Kolkata';
  warnServerlessGaps();
  void ensureBucket();
  void syncSuperAdminEmail();

  const app = express();
  app.disable('x-powered-by');

  // Behind Vercel/Render/Railway/Nginx the real client IP arrives in X-Forwarded-For.
  app.set('trust proxy', true);

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin, server-to-server calls, localhost, and Vercel domains are allowed.
        if (
          !origin ||
          env.corsOrigins.includes(origin) ||
          origin.endsWith('.vercel.app') ||
          origin.includes('localhost')
        ) {
          return callback(null, true);
        }
        callback(new Error(`Origin not allowed by CORS: ${origin}`));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use(
    '/api',
    rateLimit({
      windowMs: 60_000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      validate: { trustProxy: false },
    }),
  );

  app.use('/api', apiRouter);

  const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="#4f46e5"/>
  <text x="16" y="23" font-family="system-ui, -apple-system, sans-serif" font-size="20" font-weight="bold" fill="#ffffff" text-anchor="middle">T</text>
</svg>`;

  const faviconSvgPath = path.resolve(__dirname, '../../web/public/favicon.svg');
  const faviconIcoPath = path.resolve(__dirname, '../../web/public/favicon.ico');

  app.get('/favicon.svg', (_req, res) => {
    if (fs.existsSync(faviconSvgPath)) {
      res.sendFile(faviconSvgPath);
    } else {
      res.setHeader('Content-Type', 'image/svg+xml');
      res.send(FAVICON_SVG);
    }
  });

  app.get('/favicon.ico', (_req, res) => {
    if (fs.existsSync(faviconIcoPath)) {
      res.sendFile(faviconIcoPath);
    } else {
      res.status(204).end();
    }
  });

  const webDist = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
  });
  app.use(errorMiddleware);

  return app;
}

export function start() {
  assertProductionSafety();
  // Only needed for the local-disk backend; Supabase needs no directory.
  if (!usingSupabaseStorage()) ensureStorageDir();

  // The company clock comes from Settings, and every date helper is explicitly
  // timezone-aware — but pinning the process TZ keeps logs and any stray
  // `toLocaleString()` on Indian time too, which avoids confusing diagnostics.
  if (!process.env.TZ) process.env.TZ = 'Asia/Kolkata';

  const app = createApp();
  const server = app.listen(env.port, () => {
    console.log(`\n  Task Management System API`);
    console.log(`  ─────────────────────────────────────────`);
    console.log(`  http://localhost:${env.port}/api/health`);
    console.log(`  env: ${env.nodeEnv}  ·  scheduler: ${env.schedulerEnabled ? 'on' : 'off'}`);
    console.log(`  mail: ${env.smtp.host ? env.smtp.host : 'console (no SMTP configured)'}`);
    console.log(`  timezone: ${process.env.TZ} (company clock is set in Settings)\n`);
  });

  if (env.schedulerEnabled) startScheduler();

  const shutdown = (signal: string) => {
    console.log(`\n[${signal}] shutting down...`);
    stopScheduler();
    server.close(() => {
      void disconnect().then(() => process.exit(0));
    });
    // Don't hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

if (!process.env.VERCEL && process.env.NODE_ENV !== 'test') {
  start();
}
