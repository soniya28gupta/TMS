/** JSON-in-TEXT column helpers — the price of staying portable across SQLite/Postgres. */

export function readJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function readStringArray(raw: string | null | undefined): string[] {
  const parsed = readJson<unknown>(raw, []);
  return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
}

export function readNumberArray(raw: string | null | undefined, fallback: number[]): number[] {
  const parsed = readJson<unknown>(raw, fallback);
  return Array.isArray(parsed) ? parsed.filter((v): v is number => typeof v === 'number') : fallback;
}
