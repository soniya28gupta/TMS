import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../env';
import { prisma } from '../db';
import { unauthorized } from '../lib/errors';

export type AccessPayload = { sub: string; role: string; portal: string; sid?: string };

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret, {
    expiresIn: env.accessTokenTtl,
  } as jwt.SignOptions);
}

export function verifyAccessToken(token: string): AccessPayload {
  try {
    return jwt.verify(token, env.jwtAccessSecret) as AccessPayload;
  } catch {
    throw unauthorized('Session expired or invalid');
  }
}

/**
 * Refresh tokens are opaque random strings; only their SHA-256 hash is stored,
 * so a database leak cannot be replayed. Each use rotates the token.
 */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function generatePasswordResetToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function issueRefreshToken(
  userId: string,
  meta: { userAgent?: string; ip?: string; sessionId?: string | null },
): Promise<string> {
  const { token, hash } = generateRefreshToken();
  const expiresAt = new Date(Date.now() + env.refreshTokenDays * 86_400_000);

  let validSessionId: string | null = null;
  if (meta.sessionId) {
    try {
      const session = await prisma.userSession.findUnique({
        where: { id: meta.sessionId },
        select: { id: true, isActive: true },
      });
      if (session?.isActive) {
        validSessionId = session.id;
      }
    } catch {
      validSessionId = null;
    }
  }

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hash,
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 250),
      ip: meta.ip,
      sessionId: validSessionId,
    },
  });
  return token;
}

/**
 * Single-use: the presented token is revoked and the caller issues a new one.
 * The originating session id travels with it so rotation does not look like a
 * fresh login.
 */
export async function consumeRefreshToken(
  token: string,
): Promise<{ userId: string; sessionId: string | null }> {
  let record;
  try {
    record = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } });
  } catch {
    throw unauthorized('Refresh token is no longer valid');
  }

  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw unauthorized('Refresh token is no longer valid');
  }
  // A revoked session must not be resurrected by a token that predates it.
  if (record.sessionId) {
    const session = await prisma.userSession.findUnique({
      where: { id: record.sessionId },
      select: { isActive: true },
    });
    if (session && !session.isActive) throw unauthorized('This session has been signed out');
  }
  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });
  return { userId: record.userId, sessionId: record.sessionId };
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
