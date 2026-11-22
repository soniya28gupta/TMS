export type Position = {
  latitude: number;
  longitude: number;
  accuracy?: number;
};

/**
 * Asks the browser for a position, but never blocks the action that needs it.
 *
 * Attendance must work when the employee denies permission, when the device
 * has no GPS, or when a fix takes too long — so every failure path resolves to
 * `null` rather than throwing. The server independently re-checks consent, so
 * sending a position is only ever a suggestion.
 */
export async function requestPosition(timeoutMs = 8000): Promise<Position | null> {
  const result = await getDetailedPosition(timeoutMs);
  return result.position;
}

export async function getDetailedPosition(timeoutMs = 8000): Promise<{
  position: Position | null;
  error: string | null;
}> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { position: null, error: 'GPS Unavailable (Geolocation is not supported by your browser).' };
  }

  const mapError = (err: GeolocationPositionError): string => {
    if (err.code === 1) {
      return 'Location permission denied. Please allow location access in your browser.';
    }
    if (err.code === 2) {
      return 'GPS Unavailable (position unavailable).';
    }
    if (err.code === 3) {
      return 'GPS Unavailable (request timed out).';
    }
    return 'GPS Unavailable';
  };

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: { position: Position | null; error: string | null }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ position: null, error: 'GPS Unavailable (request timed out).' });
    }, timeoutMs + 500);

    // Try high accuracy first (e.g. mobile GPS / high-accuracy Wi-Fi)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        finish({
          position: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy ? Math.round(pos.coords.accuracy * 10) / 10 : undefined,
          },
          error: null,
        });
      },
      (err) => {
        // If permission was denied, do not retry
        if (err.code === 1) {
          clearTimeout(timer);
          finish({ position: null, error: mapError(err) });
          return;
        }

        // On laptops/desktops without dedicated GPS, high accuracy may fail. Try standard accuracy fallback.
        try {
          navigator.geolocation.getCurrentPosition(
            (fallbackPos) => {
              clearTimeout(timer);
              finish({
                position: {
                  latitude: fallbackPos.coords.latitude,
                  longitude: fallbackPos.coords.longitude,
                  accuracy: fallbackPos.coords.accuracy ? Math.round(fallbackPos.coords.accuracy * 10) / 10 : undefined,
                },
                error: null,
              });
            },
            (fallbackErr) => {
              clearTimeout(timer);
              finish({ position: null, error: mapError(fallbackErr || err) });
            },
            { enableHighAccuracy: false, timeout: 3500, maximumAge: 60_000 },
          );
        } catch {
          clearTimeout(timer);
          finish({ position: null, error: mapError(err) });
        }
      },
      { enableHighAccuracy: true, timeout: 4500, maximumAge: 30_000 },
    );
  });
}

/** True when the browser has already been granted location permission. */
export async function hasBrowserPermission(): Promise<boolean> {
  try {
    if (!navigator.permissions?.query) return false;
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state === 'granted';
  } catch {
    return false;
  }
}

export function formatCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): string | null {
  if (latitude == null || longitude == null) return null;
  const lat = typeof latitude === 'number' ? latitude : parseFloat(String(latitude));
  const lon = typeof longitude === 'number' ? longitude : parseFloat(String(longitude));
  if (Number.isNaN(lat) || Number.isNaN(lon)) return null;
  return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

export function mapsUrl(latitude: number | null | undefined, longitude: number | null | undefined): string {
  if (latitude == null || longitude == null) return '#';
  return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}`;
}
