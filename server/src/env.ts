import path from 'node:path';
import fs from 'node:fs';
import dotenv from 'dotenv';

const envCandidates = [
  path.resolve(__dirname, '../.env'),
  path.resolve(process.cwd(), 'server/.env'),
  path.resolve(process.cwd(), '.env'),
];
for (const cand of envCandidates) {
  if (fs.existsSync(cand)) {
    dotenv.config({ path: cand });
    break;
  }
}

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

const isProd = process.env.NODE_ENV === 'production';

// Dev falls back to a fixed secret so `npm run dev` works with no .env at all.
// Production refuses to boot without real secrets — see assertProductionSafety().
const DEV_SECRET = 'dev-only-insecure-secret-change-me';

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd,
  port: int('PORT', 4000),

  jwtAccessSecret: required('JWT_ACCESS_SECRET', DEV_SECRET),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', `${DEV_SECRET}-refresh`),
  accessTokenTtl: process.env.ACCESS_TOKEN_TTL ?? '30m',
  refreshTokenDays: int('REFRESH_TOKEN_DAYS', 14),

  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:4173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  storageDir: path.resolve(process.cwd(), process.env.STORAGE_DIR ?? 'storage'),
  maxUploadMb: int('MAX_UPLOAD_MB', 10),

  /**
   * Supabase Storage. Required in production — serverless filesystems are
   * ephemeral, so uploads must not go to local disk. Leave unset locally and
   * files land in `storageDir` instead.
   */
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    serviceKey: process.env.SUPABASE_SERVICE_KEY ?? '',
    bucket: process.env.SUPABASE_BUCKET ?? 'attachments',
  },

  /** Shared secret for the /api/jobs/tick endpoint an external cron calls. */
  cronSecret: process.env.CRON_SECRET ?? '',

  schedulerEnabled: bool('SCHEDULER_ENABLED', true),

  resendApiKey: process.env.RESEND_API_KEY ?? '',
  superAdminEmail: (process.env.SUPER_ADMIN_EMAIL ?? '').toLowerCase().trim(),

  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: int('SMTP_PORT', 587),
    secure: bool('SMTP_SECURE', false),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.EMAIL_FROM ?? process.env.MAIL_FROM ?? 'TaskFlow Support <no-reply@example.com>',
  },

  appUrl: process.env.APP_BASE_URL ?? process.env.APP_URL ?? 'http://localhost:5173',
  seedPassword: process.env.SEED_PASSWORD ?? 'Password@123',
};

export function isEmailConfigured(): boolean {
  return Boolean(env.smtp.host || env.resendApiKey);
}

export function assertProductionSafety(): void {
  if (!isProd) return;
  const problems: string[] = [];
  if (env.jwtAccessSecret.includes(DEV_SECRET)) problems.push('JWT_ACCESS_SECRET is unset');
  if (env.jwtRefreshSecret.includes(DEV_SECRET)) problems.push('JWT_REFRESH_SECRET is unset');
  if (!process.env.DATABASE_URL) problems.push('DATABASE_URL is unset');
  if (problems.length) {
    throw new Error(`Refusing to start in production: ${problems.join('; ')}`);
  }
}

/**
 * Warnings for a serverless deployment. These are not fatal — the API still
 * serves — but each one silently breaks a feature, so they are worth shouting
 * about in the logs rather than discovering later.
 */
export function warnServerlessGaps(): void {
  if (!isProd) return;
  if (!env.supabase.url || !env.supabase.serviceKey) {
    console.warn(
      '[storage] SUPABASE_URL / SUPABASE_SERVICE_KEY are unset. Uploads will be written to a ' +
        'serverless filesystem and lost when the function is frozen.',
    );
  }
  if (!env.cronSecret) {
    console.warn(
      '[scheduler] CRON_SECRET is unset, so /api/jobs/tick is disabled. Reminders, the overdue ' +
        'scan and the nightly roll-up will not run without an external scheduler.',
    );
  }
}

export function ensureStorageDir(): void {
  fs.mkdirSync(env.storageDir, { recursive: true });
}
