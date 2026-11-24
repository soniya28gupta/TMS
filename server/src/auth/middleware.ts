import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { prisma } from '../db';
import { forbidden, unauthorized } from '../lib/errors';
import { touchSession } from '../services/session.service';
import { verifyAccessToken } from './tokens';
import { can, loadAuthUser, requireScope, type AuthUser } from './rbac';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookieToken = (req as Request & { cookies?: Record<string, string> }).cookies?.accessToken;
  return cookieToken ?? null;
}

const SESSION_CACHE_TTL_MS = 10_000;
const sessionActiveCache = new Map<string, { active: boolean; expiresAt: number }>();

export function invalidateSessionCache(sessionId?: string): void {
  if (sessionId) {
    sessionActiveCache.delete(sessionId);
  } else {
    sessionActiveCache.clear();
  }
}

async function isSessionActive(sessionId: string): Promise<boolean> {
  const now = Date.now();
  const cached = sessionActiveCache.get(sessionId);
  if (cached && cached.expiresAt > now) {
    return cached.active;
  }
  const session = await prisma.userSession.findUnique({
    where: { id: sessionId },
    select: { isActive: true },
  });
  // If session row doesn't exist, treat as valid unless explicitly inactive (preserves original logic)
  const active = session ? session.isActive : true;
  sessionActiveCache.set(sessionId, { active, expiresAt: now + SESSION_CACHE_TTL_MS });
  return active;
}

export const authenticate: RequestHandler = (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next(unauthorized());

  void (async () => {
    try {
      const payload = verifyAccessToken(token);
      const [user, sessionOk] = await Promise.all([
        loadAuthUser(payload.sub),
        payload.sid ? isSessionActive(payload.sid) : Promise.resolve(true),
      ]);
      if (!user) return next(unauthorized('Account no longer exists'));
      if (user.status !== 'ACTIVE') return next(forbidden('Your account is not active'));
      if (!sessionOk) return next(unauthorized('This session has been signed out'));

      if (payload.sid) {
        user.sessionId = payload.sid;
        void touchSession(payload.sid);
      }

      req.auth = user;
      next();
    } catch (error) {
      next(error);
    }
  })();
};

export function currentUser(req: Request): AuthUser {
  if (!req.auth) throw unauthorized();
  return req.auth;
}

/** Route guard for a flat permission, e.g. `task.create`. */
export function requirePermission(permission: string): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.auth;
    if (!user) return next(unauthorized());
    if (!can(user, permission)) return next(forbidden(`Missing permission: ${permission}`));
    next();
  };
}

/** Route guard for a scoped permission base, e.g. `task.read`. */
export function requireAnyScope(base: string): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const user = req.auth;
    if (!user) return next(unauthorized());
    try {
      requireScope(user, base);
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Blocks employee-portal roles from admin-only routers. */
export const requireAdminPortal: RequestHandler = (req, _res, next) => {
  const user = req.auth;
  if (!user) return next(unauthorized());
  if (user.portal !== 'ADMIN') return next(forbidden('Admin portal access required'));
  next();
};
