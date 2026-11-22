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
import { createApp } from '../server/src/index';

// Created once per warm container and reused across invocations, so the
// middleware chain and Prisma client are not rebuilt on every request.
const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return (app as unknown as (r: IncomingMessage, s: ServerResponse) => void)(req, res);
}
