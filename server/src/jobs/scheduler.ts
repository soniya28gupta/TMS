import cron, { type ScheduledTask } from 'node-cron';
import { addDays, timeInTz, todayInTz } from '../lib/dates';
import { getSettings } from '../services/settings.service';
import { flushOutbox } from '../services/mailer.service';
import { materialiseRecurringTasks } from './recurring.job';
import { notifyApproachingDeadlines, scanOverdueTasks } from './overdue.job';
import { expireIdleSessions, purgeExpiredActivityData } from '../services/session.service';
import {
  runDayClose,
  runEodMissingCheck,
  runEodReminder,
  runSodGeneration,
  runSodReminder,
  warmNextDay,
} from './daily.job';

/**
 * One minute-resolution tick drives every scheduled workflow.
 *
 * Deliberately not one cron expression per job: the reminder times live in the
 * Settings table and admins change them from the UI. Comparing the wall clock
 * against the current settings each minute means a change takes effect
 * immediately with no process restart and no cron re-registration.
 */

const lastRun = new Map<string, string>();

/** Runs `fn` at most once for a given key per day. */
async function once(key: string, day: string, fn: () => Promise<unknown>): Promise<void> {
  if (lastRun.get(key) === day) return;
  lastRun.set(key, day);
  try {
    const result = await fn();
    console.log(`[scheduler] ${key} (${day})`, result ?? '');
  } catch (error) {
    // A failed job must never take the tick — or the process — down.
    lastRun.delete(key);
    console.error(`[scheduler] ${key} failed`, error);
  }
}

export async function tick(now = new Date()): Promise<void> {
  const settings = await getSettings();
  const tz = settings.timezone;
  const day = todayInTz(tz, now);
  const time = timeInTz(tz, now);

  if (time === settings.sodGenerateTime) {
    await once('recurring', day, () => materialiseRecurringTasks(day));
    await once('sod.generate', day, () => runSodGeneration(day));
  }
  if (time === settings.sodReminderTime) {
    await once('sod.remind', day, () => runSodReminder(day));
  }
  if (time === settings.eodReminderTime) {
    await once('eod.remind', day, () => runEodReminder(day));
  }
  if (time === settings.eodMissingCheckTime) {
    await once('eod.missing', day, () => runEodMissingCheck(day));
  }
  if (time === settings.dayCloseTime) {
    await once('day.close', day, () => runDayClose(day));
    await once('day.warm', day, () => warmNextDay(addDays(day, 1)));
    // Privacy housekeeping: close abandoned sessions, then drop anything past
    // its retention window.
    await once('activity.expire', day, () => expireIdleSessions());
    await once('activity.purge', day, () => purgeExpiredActivityData());
  }

  // Deadline hygiene runs on the hour, independent of configured times.
  if (time.endsWith(':00')) {
    const hourKey = `${day}T${time}`;
    if (lastRun.get('overdue') !== hourKey) {
      lastRun.set('overdue', hourKey);
      try {
        const overdue = await scanOverdueTasks(now);
        const dueSoon = await notifyApproachingDeadlines(now);
        if (overdue.marked || overdue.cleared || dueSoon) {
          console.log('[scheduler] overdue scan', { ...overdue, dueSoon });
        }
      } catch (error) {
        console.error('[scheduler] overdue scan failed', error);
      }
    }
  }

  // Drain queued email every tick; it is a no-op when the queue is empty.
  try {
    await flushOutbox();
  } catch (error) {
    console.error('[scheduler] mail flush failed', error);
  }
}

let task: ScheduledTask | null = null;

export function startScheduler(): void {
  if (task) return;
  task = cron.schedule('* * * * *', () => {
    void tick();
  });
  console.log('[scheduler] started — 1-minute tick driving SOD/EOD/recurring/overdue jobs');
}

export function stopScheduler(): void {
  task?.stop();
  task = null;
}

/** Exposed so admins can fire a workflow immediately from the UI. */
export const manualJobs = {
  sodGeneration: runSodGeneration,
  sodReminder: runSodReminder,
  eodReminder: runEodReminder,
  eodMissing: runEodMissingCheck,
  dayClose: runDayClose,
  recurring: materialiseRecurringTasks,
  overdue: scanOverdueTasks,
  deadlines: notifyApproachingDeadlines,
  flushMail: flushOutbox,
  expireIdleSessions,
  purgeActivityData: purgeExpiredActivityData,
};
