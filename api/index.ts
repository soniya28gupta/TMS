/**
 * Vercel serverless entry point for the whole API.
 *
 * The Express app is built by `createApp()`, which is deliberately separate
 * from `start()` — `start()` binds a port, creates the storage directory and
 * launches the in-process scheduler, none of which belong in a function that
 * may be frozen between requests.
 *
 * Every `/api/*` path is rewritten to this one function (see vercel.json), and
 * Express does its own routing from there, exactly as it does locally.
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import zlib from 'node:zlib';
import { createApp } from '../server/src/index';

// Created once per warm container and reused across invocations, so the
// middleware chain and Prisma client are not rebuilt on every request.
const app = createApp();

function sendCompressed(
  req: IncomingMessage,
  res: ServerResponse,
  body: Buffer | string,
  contentType: string
) {
  const rawBuffer = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
  const acceptEncoding = String(req.headers['accept-encoding'] || '');

  res.setHeader('Content-Type', contentType);
  res.setHeader('Vary', 'Accept-Encoding');

  // Compress payloads greater than 1 KB when the client supports gzip/deflate
  if (rawBuffer.length > 1024 && !res.getHeader('Content-Encoding')) {
    if (acceptEncoding.includes('gzip')) {
      res.setHeader('Content-Encoding', 'gzip');
      res.end(zlib.gzipSync(rawBuffer, { level: zlib.constants.Z_BEST_SPEED }));
      return;
    }
    if (acceptEncoding.includes('deflate')) {
      res.setHeader('Content-Encoding', 'deflate');
      res.end(zlib.deflateSync(rawBuffer, { level: zlib.constants.Z_BEST_SPEED }));
      return;
    }
  }

  res.end(rawBuffer);
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const method = (req.method || 'GET').toUpperCase();
  const urlPath = (req.url || '/').split('?')[0];

  // Never cache auth endpoints or write/mutating requests
  if (
    method !== 'GET' ||
    urlPath.startsWith('/api/auth') ||
    urlPath.startsWith('/api/jobs')
  ) {
    res.setHeader('Cache-Control', 'no-store');
  } else if (urlPath.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'private, max-age=5');
  }

  // Intercept end() for non-streaming JSON/text responses so large payloads compress fast
  const originalEnd = res.end.bind(res) as (
    chunk?: unknown,
    encoding?: BufferEncoding | (() => void),
    cb?: () => void
  ) => ServerResponse;

  let responseContentType = 'application/json; charset=utf-8';
  const originalSetHeader = res.setHeader.bind(res);
  res.setHeader = ((name: string, value: number | string | readonly string[]) => {
    if (name.toLowerCase() === 'content-type') {
      responseContentType = Array.isArray(value) ? value.join('; ') : String(value);
    }
    return originalSetHeader(name, value);
  }) as typeof res.setHeader;

  res.end = ((
    chunk?: unknown,
    encoding?: BufferEncoding | (() => void),
    cb?: () => void
  ) => {
    const callback = typeof encoding === 'function' ? encoding : cb;
    const enc = typeof encoding === 'function' ? undefined : encoding;

    if (
      chunk !== undefined &&
      chunk !== null &&
      !res.headersSent &&
      !res.getHeader('Content-Encoding') &&
      typeof responseContentType === 'string' &&
      (responseContentType.includes('application/json') ||
        responseContentType.includes('text/'))
    ) {
      const buf = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(String(chunk), enc || 'utf8');

      res.setHeader = originalSetHeader;
      res.end = originalEnd;
      sendCompressed(req, res, buf, responseContentType);
      if (callback) callback();
      return res;
    }

    res.setHeader = originalSetHeader;
    res.end = originalEnd;
    return originalEnd(chunk, enc as BufferEncoding, callback);
  }) as typeof res.end;

  return (app as unknown as (r: IncomingMessage, s: ServerResponse) => void)(req, res);
}