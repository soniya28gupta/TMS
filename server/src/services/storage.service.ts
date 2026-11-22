import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Request, RequestHandler, Response } from 'express';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import multer from 'multer';
import { env } from '../env';
import { badRequest, notFound } from '../lib/errors';

type UploadRequest = Request & { uploadFolder?: string };

/**
 * File storage behind one interface, with two backends:
 *
 *   • **Supabase Storage** when SUPABASE_URL + SUPABASE_SERVICE_KEY are set.
 *     Required in production: serverless filesystems are ephemeral, so a file
 *     written to disk vanishes when the function is frozen.
 *   • **Local disk** otherwise, so `npm run dev` needs no cloud account.
 *
 * Uploads are buffered in memory either way — files are capped at MAX_UPLOAD_MB,
 * which comfortably fits a function's memory budget.
 */

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/zip',
]);

let supabase: SupabaseClient | null = null;

export function usingSupabaseStorage(): boolean {
  return Boolean(env.supabase.url && env.supabase.serviceKey);
}

function client(): SupabaseClient {
  if (!supabase) {
    supabase = createClient(env.supabase.url, env.supabase.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabase;
}

function sanitizeSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'general';
}

/** Relative key stored in the database, e.g. `tasks/1712…-ab12.pdf`. */
export function storageKeyFor(folder: string, filename: string): string {
  return `${sanitizeSegment(folder)}/${filename}`;
}

function generateFilename(originalName: string): string {
  const ext = path.extname(originalName).slice(0, 12);
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

/**
 * Memory storage for both backends. Multer's diskStorage cannot be used on
 * serverless, and buffering keeps a single code path for the size/type checks.
 */
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 5 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(badRequest(`File type not allowed: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

/**
 * Route helper: `router.post('/x', ...uploadTo('tasks'), handler)`.
 *
 * Files arrive in `req.files` as buffers; the handler then calls
 * `persistUpload()` for each, which writes to whichever backend is configured.
 */
export function uploadTo(folder: string, field = 'files', max = 5): RequestHandler[] {
  return [
    (req, _res, next) => {
      (req as UploadRequest).uploadFolder = folder;
      next();
    },
    upload.array(field, max),
  ];
}

/** Writes one buffered upload and returns the key to store in the database. */
export async function persistUpload(
  folder: string,
  file: Express.Multer.File,
): Promise<string> {
  const key = storageKeyFor(folder, generateFilename(file.originalname));

  if (usingSupabaseStorage()) {
    const { error } = await client()
      .storage.from(env.supabase.bucket)
      .upload(key, file.buffer, { contentType: file.mimetype, upsert: false });
    if (error) throw badRequest(`Upload failed: ${error.message}`);
    return key;
  }

  const target = path.resolve(env.storageDir, key);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, file.buffer);
  return key;
}

// ---------------------------------------------------------------------------
// Download & delete
// ---------------------------------------------------------------------------

function resolveLocalPath(key: string): string {
  const target = path.resolve(env.storageDir, key);
  // Refuse anything escaping the storage root (path traversal guard).
  if (!target.startsWith(path.resolve(env.storageDir))) throw badRequest('Invalid file key');
  if (!fs.existsSync(target)) throw notFound('File');
  return target;
}

/**
 * Sends a stored file to the client.
 *
 * Callers must have already checked permission — on Supabase this issues a
 * short-lived signed URL and redirects, so the bytes never pass through the
 * function. The URL expires in 60 seconds, which is long enough for the
 * browser to follow the redirect and useless if it leaks afterwards.
 */
export async function sendStoredFile(
  res: Response,
  key: string,
  originalName: string,
): Promise<void> {
  if (usingSupabaseStorage()) {
    const { data, error } = await client()
      .storage.from(env.supabase.bucket)
      .createSignedUrl(key, 60, { download: originalName });
    if (error || !data) throw notFound('File');
    res.redirect(data.signedUrl);
    return;
  }

  res.download(resolveLocalPath(key), originalName);
}

export async function deleteStoredFile(key: string): Promise<void> {
  if (usingSupabaseStorage()) {
    // A missing object is not an error worth surfacing — the row is going away.
    await client().storage.from(env.supabase.bucket).remove([key]).catch(() => undefined);
    return;
  }

  try {
    fs.unlinkSync(path.resolve(env.storageDir, key));
  } catch {
    /* already gone — nothing to do */
  }
}

/**
 * Creates the storage bucket if it is missing. Called at boot so a fresh
 * Supabase project works without a manual dashboard step. Private by design:
 * every download goes through a permission check and a signed URL.
 */
export async function ensureBucket(): Promise<void> {
  if (!usingSupabaseStorage()) return;
  const { data } = await client().storage.listBuckets();
  if (data?.some((b) => b.name === env.supabase.bucket)) return;

  const { error } = await client().storage.createBucket(env.supabase.bucket, {
    public: false,
    fileSizeLimit: `${env.maxUploadMb}MB`,
  });
  if (error && !/already exists/i.test(error.message)) {
    console.error('[storage] could not create bucket:', error.message);
  }
}
