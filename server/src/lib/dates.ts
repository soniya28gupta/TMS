/**
 * Timezone-aware date helpers built only on Intl — no date library, no cost,
 * no dependency drift.
 *
 * Convention used across the system: a "day" is the string `YYYY-MM-DD` as it
 * reads in the company timezone. Timestamps stay as real UTC `Date`s. This
 * keeps SOD/EOD/attendance uniqueness correct regardless of server location.
 */

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Offset (ms) between the given instant's wall-clock time in `tz` and UTC. */
export function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

/** Current calendar day in `tz`, as YYYY-MM-DD. */
export function todayInTz(tz: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** Wall-clock time in `tz`, as HH:mm. */
export function timeInTz(tz: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
}

/** Convert a local wall-clock date+time in `tz` into the corresponding UTC instant. */
export function zonedToUtc(dateStr: string, timeStr: string, tz: string): Date {
  assertDate(dateStr);
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  // Two passes settle DST boundaries: the first offset guess is refined once.
  let instant = new Date(naive - tzOffsetMs(new Date(naive), tz));
  instant = new Date(naive - tzOffsetMs(instant, tz));
  return instant;
}

export function startOfDayUtc(dateStr: string, tz: string): Date {
  return zonedToUtc(dateStr, '00:00', tz);
}

export function endOfDayUtc(dateStr: string, tz: string): Date {
  return new Date(zonedToUtc(addDays(dateStr, 1), '00:00', tz).getTime() - 1);
}

export function assertDate(dateStr: string): void {
  if (!DATE_RE.test(dateStr)) throw new Error(`Invalid date (expected YYYY-MM-DD): ${dateStr}`);
}

/** Day of week for a calendar day string. 0 = Sunday. */
export function dayOfWeek(dateStr: string): number {
  assertDate(dateStr);
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

export function addDays(dateStr: string, days: number): string {
  assertDate(dateStr);
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function diffDays(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Inclusive list of calendar days between two day strings. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  const total = diffDays(from, to);
  if (total < 0) return out;
  for (let i = 0; i <= total; i += 1) out.push(addDays(from, i));
  return out;
}

export function dayOfMonth(dateStr: string): number {
  return Number(dateStr.slice(8, 10));
}

export function monthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** First and last calendar day of the month containing `dateStr`. */
export function monthBounds(dateStr: string): { start: string; end: string } {
  const start = `${dateStr.slice(0, 7)}-01`;
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return { start, end: d.toISOString().slice(0, 10) };
}

export function minutesBetween(from: Date, to: Date): number {
  const diffMs = to.getTime() - from.getTime();
  if (diffMs <= 0) return 0;
  // Ensure any positive duration credits at least 1 minute rather than rounding down to 0
  return Math.max(1, Math.round(diffMs / 60_000));
}

export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/** "7h 45m" — used in reports and exports. */
export function formatDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '0h 0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

/** Minutes since local midnight for an HH:mm string. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function isWorkingDay(
  dateStr: string,
  workingDays: number[],
  holidayDates: Set<string> = new Set(),
): boolean {
  if (holidayDates.has(dateStr)) return false;
  return workingDays.includes(dayOfWeek(dateStr));
}

/** Working days in a range, excluding weekends (per config) and holidays. */
export function countWorkingDays(
  from: string,
  to: string,
  workingDays: number[],
  holidayDates: Set<string> = new Set(),
): number {
  return eachDay(from, to).filter((d) => isWorkingDay(d, workingDays, holidayDates)).length;
}

/** Human date for emails/exports, e.g. "08 Aug 2026". */
export function formatDisplayDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}
