import { prisma } from '../db';
import { getSettings } from './settings.service';
import { resolvePosition, type RawPosition } from './geo.service';
import { invalidateSessionCache } from '../auth/middleware';

/**
 * Login/logout and session monitoring.
 *
 * A session is created once per sign-in and survives refresh-token rotation,
 * so "logged in since" and "last seen" stay meaningful. Closing a session
 * revokes every refresh token issued under it, which is what makes remote
 * sign-out actually work.
 */

type ClientInfo = { ip?: string | null; userAgent?: string | null };

/** Deliberately small UA parse — enough to label a device, no fingerprinting. */
export function describeClient(userAgent: string | null | undefined): {
  device: string;
  browser: string;
  os: string;
} {
  const ua = userAgent ?? '';
  const device = /iPad|Tablet/i.test(ua) ? 'Tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'Mobile' : 'Desktop';

  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /OPR\//i.test(ua)
      ? 'Opera'
      : /Chrome\//i.test(ua)
        ? 'Chrome'
        : /Safari\//i.test(ua)
          ? 'Safari'
          : /Firefox\//i.test(ua)
            ? 'Firefox'
            : 'Unknown';

  const os = /Windows/i.test(ua)
    ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua)
      ? 'macOS'
      : /Android/i.test(ua)
        ? 'Android'
        : /iPhone|iPad|iOS/i.test(ua)
          ? 'iOS'
          : /Linux/i.test(ua)
            ? 'Linux'
            : 'Unknown';

  return { device, browser, os };
}

export async function startSession(
  userId: string,
  client: ClientInfo,
  position?: RawPosition | null,
): Promise<string> {
  const { device, browser, os } = describeClient(client.userAgent);
  const resolved = await resolvePosition(userId, position);

  const session = await prisma.userSession.create({
    data: {
      userId,
      ip: client.ip ?? null,
      userAgent: client.userAgent?.slice(0, 250) ?? null,
      device,
      browser,
      os,
      loginLatitude: resolved?.latitude ?? null,
      loginLongitude: resolved?.longitude ?? null,
      loginAccuracy: resolved?.accuracy ?? null,
    },
    select: { id: true },
  });
  return session.id;
}

/** Cheap heartbeat — called by the auth middleware, throttled to once a minute. */
const lastTouch = new Map<string, number>();

export async function touchSession(sessionId: string): Promise<void> {
  const now = Date.now();
  const previous = lastTouch.get(sessionId) ?? 0;
  if (now - previous < 60_000) return;
  lastTouch.set(sessionId, now);

  await prisma.userSession
    .updateMany({
      where: { id: sessionId, isActive: true },
      data: { lastSeenAt: new Date(now) },
    })
    .catch(() => undefined);
}

export async function endSession(sessionId: string, reason: string): Promise<void> {
  const now = new Date();
  await prisma.userSession.updateMany({
    where: { id: sessionId, isActive: true },
    data: { isActive: false, logoutAt: now, endedReason: reason },
  });
  await prisma.refreshToken.updateMany({
    where: { sessionId, revokedAt: null },
    data: { revokedAt: now },
  });
  lastTouch.delete(sessionId);
  invalidateSessionCache(sessionId);
}

export async function endAllSessions(userId: string, reason: string): Promise<number> {
  const active = await prisma.userSession.findMany({
    where: { userId, isActive: true },
    select: { id: true },
  });
  for (const session of active) await endSession(session.id, reason);
  return active.length;
}

/**
 * Marks sessions idle past the configured timeout as expired. Without this a
 * closed laptop would show as "online" forever.
 */
export async function expireIdleSessions(): Promise<number> {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.sessionIdleTimeoutMinutes * 60_000);

  const stale = await prisma.userSession.findMany({
    where: { isActive: true, lastSeenAt: { lt: cutoff } },
    select: { id: true },
  });
  for (const session of stale) await endSession(session.id, 'EXPIRED');
  return stale.length;
}

/** Retention: delete closed sessions and wipe stale coordinates. */
export async function purgeExpiredActivityData(): Promise<{
  sessionsDeleted: number;
  locationsPurged: number;
}> {
  const settings = await getSettings();

  const sessionCutoff = new Date(Date.now() - settings.sessionRetentionDays * 86_400_000);
  const { count: sessionsDeleted } = await prisma.userSession.deleteMany({
    where: { isActive: false, loginAt: { lt: sessionCutoff } },
  });

  const locationCutoffDate = new Date(Date.now() - settings.locationRetentionDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const { count: locationsPurged } = await prisma.attendance.updateMany({
    where: {
      date: { lt: locationCutoffDate },
      locationPurgedAt: null,
      OR: [{ checkInLatitude: { not: null } }, { checkOutLatitude: { not: null } }],
    },
    data: {
      checkInLatitude: null,
      checkInLongitude: null,
      checkInAccuracy: null,
      checkInAddress: null,
      checkOutLatitude: null,
      checkOutLongitude: null,
      checkOutAccuracy: null,
      checkOutAddress: null,
      locationPurgedAt: new Date(),
    },
  });

  return { sessionsDeleted, locationsPurged };
}
