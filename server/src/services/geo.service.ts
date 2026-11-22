import { prisma } from '../db';
import { getSettings } from './settings.service';
import type { AuthUser } from '../auth/rbac';

/**
 * Geolocation capture, governed by three gates that must all pass before a
 * single coordinate is written:
 *
 *   1. `locationTrackingEnabled` — the company has switched the feature on
 *   2. the employee has accepted the current privacy notice
 *   3. the client actually supplied a position
 *
 * Anything that fails simply results in no coordinates. Attendance still works;
 * location is an enrichment, never a precondition for marking a day.
 */

export type RawPosition = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  address?: string;
};

export type ResolvedPosition = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  address: string | null;
  distanceMeters: number | null;
  withinGeofence: boolean | null;
};

/** ~1 km buckets. Enough to answer "were they in the city", not "which desk". */
function roundToApproximate(value: number): number {
  return Math.round(value * 100) / 100;
}

export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return Math.round(2 * R * Math.asin(Math.min(1, Math.sqrt(h))));
}

export function isValidPosition(position: RawPosition | undefined | null): position is RawPosition {
  if (!position) return false;
  const { latitude, longitude, accuracy } = position;
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    // (0,0) is in the Atlantic — almost always a client that failed to get a fix.
    !(latitude === 0 && longitude === 0) &&
    (accuracy === undefined || accuracy === null || (Number.isFinite(accuracy) && accuracy >= 0))
  );
}

export async function hasLocationConsent(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { locationConsentAt: true },
  });
  return !!user?.locationConsentAt;
}

/**
 * Applies policy to a raw device position during attendance punch events.
 * Validates coordinates, calculates distance & geofence against configured office,
 * and saves coordinates so they are properly persisted in PostgreSQL.
 */
export async function resolvePosition(
  userId: string,
  position: RawPosition | undefined | null,
  options?: { exact?: boolean },
): Promise<ResolvedPosition | null> {
  if (!isValidPosition(position)) return null;

  const settings = await getSettings();
  const approximate = !options?.exact && settings.locationPrecision === 'APPROXIMATE';

  const latitude = approximate ? roundToApproximate(position.latitude) : position.latitude;
  const longitude = approximate ? roundToApproximate(position.longitude) : position.longitude;

  let distanceMeters: number | null = null;
  let withinGeofence: boolean | null = null;

  if (settings.officeRadiusMeters > 0 && (settings.officeLatitude || settings.officeLongitude)) {
    distanceMeters = haversineMeters(
      { latitude: position.latitude, longitude: position.longitude },
      { latitude: settings.officeLatitude, longitude: settings.officeLongitude },
    );
    withinGeofence = distanceMeters <= settings.officeRadiusMeters;
  }

  // Update employee location consent on explicit location submission
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        locationConsentAt: new Date(),
        locationConsentVersion: settings.locationConsentVersion || '1.0',
      },
    });
  } catch {
    /* ignore non-blocking user metadata update */
  }

  return {
    latitude,
    longitude,
    accuracy:
      position.accuracy != null && Number.isFinite(position.accuracy)
        ? Math.round(position.accuracy * 10) / 10
        : null,
    address: position.address?.slice(0, 250) ?? null,
    distanceMeters,
    withinGeofence,
  };
}

/**
 * Strips coordinates from a payload unless the viewer is allowed to see them.
 * Everyone keeps the derived signals (captured / inside geofence), because
 * those answer the operational question without exposing a person's position.
 */
export function redactLocation<T extends Record<string, unknown>>(
  record: T,
  viewerMaySeeCoordinates: boolean,
): T {
  if (viewerMaySeeCoordinates) return record;

  const clone: Record<string, unknown> = { ...record };
  for (const key of Object.keys(clone)) {
    if (/^(checkIn|checkOut|login)(Latitude|Longitude|Accuracy|Address)$/.test(key)) {
      clone[key] = null;
    }
  }
  clone.locationRedacted = true;
  return clone as T;
}

/** True when `viewer` may see raw coordinates for `targetUserId`. */
export function canSeeCoordinates(viewer: AuthUser, targetUserId: string, inScope: boolean): boolean {
  if (viewer.id === targetUserId) return true;
  if (viewer.permissions.has('*') || viewer.permissions.has('location.read.all')) return true;
  return (
    inScope &&
    ['location.read.reports', 'location.read.department', 'location.read.team'].some((permission) =>
      viewer.permissions.has(permission),
    )
  );
}
