# 3 · Automation & System Architecture

*Answers Question 3 of the requirement document.*

The core loop the brief describes:

```
Admin assigns work → employee's SOD → employee works → progress tracked
      → EOD auto-filled → employee submits → admin reviews → daily record stored
```

Everything below is implemented; file references point at the real code.

---

## The scheduling engine

`server/src/jobs/scheduler.ts`

One `node-cron` job runs every minute. It reads the company timezone and the configured
times from the Settings table, then compares them to the current wall clock.

```ts
const day  = todayInTz(tz, now);   // "2026-08-10" in the company's timezone
const time = timeInTz(tz, now);    // "08:00"

if (time === settings.sodGenerateTime) {
  await once('recurring',    day, () => materialiseRecurringTasks(day));
  await once('sod.generate', day, () => runSodGeneration(day));
}
```

Two properties matter:

- **`once(key, day, fn)`** records that a job ran for a given day, so a job fires exactly
  once per day even though the tick runs 1,440 times. If a job throws, the marker is
  removed so the next tick retries.
- **Times come from the database, not from cron expressions.** An admin changing the EOD
  reminder in Settings sees it take effect on the next tick. No restart, no
  re-registration.

The trade-off: the scheduler must run on exactly one instance. This is documented in the
README and enforced by an environment flag rather than left to chance.

### Daily timeline

| Time | Job | What it does |
| --- | --- | --- |
| 08:00 | `materialiseRecurringTasks` | Turns due recurring templates into real tasks |
| 08:00 | `runSodGeneration` | Builds every active employee's SOD from their open tasks |
| 10:00 | `runSodReminder` | Chases anyone who has not confirmed their plan |
| hourly | `scanOverdueTasks` | Sets/clears `isOverdue`, notifies assignee and managers |
| hourly | `notifyApproachingDeadlines` | One nudge per task due within 24 h |
| 18:00 | `runEodReminder` | Pre-builds the EOD draft, then asks for submission |
| 21:00 | `runEodMissingCheck` | Escalates a missing EOD to the employee and their manager |
| 23:45 | `runDayClose` | Closes attendance, writes `DailyWorkRecord` |
| 23:45 | `expireIdleSessions`, `purgeExpiredActivityData` | Session and location retention |
| every tick | `flushOutbox` | Sends queued email with retries |

Every job is idempotent and can be re-run from **Settings → Jobs** (`POST /jobs/:key/run`).

---

## How tasks are created and assigned

`server/src/routes/tasks.routes.ts`, `services/task.service.ts`

`POST /tasks` accepts a single assignee, a list of assignees, a team or a department. A
team or department resolves to its active members and **one task is created per person**,
so progress, review and reporting stay per-employee rather than shared.

Assignment is bounded by access scope. Before creating anything, the route resolves the
creator's visible employees and rejects any target outside that set — this is what stops a
manager assigning work outside their reporting line.

Codes are sequential and human-readable (`TSK-000042`) from a counter in the Settings
table, with a uniqueness re-check and a timestamp fallback.

### Status workflow

```
CREATED → ASSIGNED → ACCEPTED → IN_PROGRESS → SUBMITTED_FOR_REVIEW ─┬→ COMPLETED
                                     ↑                              │
                                     └──── CHANGES_REQUIRED ←───────┘
        any open state → BLOCKED → back to IN_PROGRESS
        any open state → CANCELLED
```

Transitions are validated against a table (`TASK_TRANSITIONS` in `constants.ts`); an
illegal move returns `409` rather than silently corrupting history.

One deliberate behaviour: when an employee without `task.review` asks to mark a task
**Completed**, the API applies `SUBMITTED_FOR_REVIEW` instead and tells the client what it
did (`appliedStatus`). This reconciles section 3 of the brief ("mark task completed") with
section 9 ("submit for review → admin approves") without giving employees self-approval.

### Overdue

`OVERDUE` is listed as a status in the brief, but treating it as one destroys information:
a task that becomes overdue is still *in progress*. So the workflow state stays in
`status`, and a derived boolean `isOverdue` is maintained hourly.

The API exposes both, plus a `displayStatus` for badges, and `?status=OVERDUE` filters on
the derived flag. The UI shows "Overdue" exactly as the brief asks; the database keeps the
truth.

### Recurring tasks

`jobs/recurring.job.ts`

A `RecurringTask` template carries a frequency (daily/weekly/monthly), the applicable days,
a start and optional end date, and a target that may be an employee, a team or a
department. Each morning the job asks whether the template is due today, skips holidays if
configured, resolves targets, and creates tasks with `dueDate = today + dueAfterDays` at
`dueTime`.

`lastRunDate` on the template makes the job idempotent — running it twice on the same day
creates nothing the second time. A monthly template set to the 31st still fires on the last
day of shorter months.

---

## How SOD is generated — and assigned

`services/sod.service.ts`

SOD is **not** a separate form the employee retypes. `ensureSodForUser(userId, date)` is
idempotent and does the work:

1. Decide whether the day is workable at all — holiday, the employee's own weekly off, or
   approved leave produce a `SKIPPED` SOD carrying the reason, so history has no holes and
   nobody is chased for a plan on a day off.
2. Create the SOD if missing.
3. While it is still `PENDING`, sync its items against the employee's open tasks: add new
   ones, drop those that closed or moved away.

That third step is what makes the brief's example work. When an admin assigns four tasks
at 9:30am, the create-task route calls `ensureSodForUser` for the assignee, and the tasks
appear on today's plan immediately — the employee does not wait for tomorrow's job.

The same function is called by the morning job, by task assignment, by reassignment, and
by the employee opening the page. Being idempotent is what allows that.

### Bidirectional SOD

Every line on a plan carries a `source`:

| `source` | Created by | Behaviour |
| --- | --- | --- |
| `AUTO_TASK` | The system, from an assigned task | Synced with the task; cannot be deleted from the plan |
| `ASSIGNED` | An admin, manager or team lead | Carries `assignedBy`, `instructions`, optional `dueTime`; needs acknowledgement |
| `SELF` | The employee | Their own planned work; they can edit or remove it |

`POST /sod/:date/entries` serves both directions. Omitting `userId` creates a `SELF`
entry; naming other employees creates `ASSIGNED` entries and requires the `sod.assign`
permission **plus** scope over each target. One call can assign the same duty to several
people.

Assigned duties are tracked on the plan itself with their own status
(`PENDING → IN_PROGRESS → DONE / DROPPED`), so a small instruction does not need a full
task ticket with a review cycle. Assigning to a day that was auto-skipped reopens it — an
explicit instruction outranks the calendar. The employee is notified immediately.

Entries can be added after the SOD is submitted, in both directions. Work genuinely
arrives mid-morning, and letting managers write to a submitted plan while blocking the
employee would be an odd asymmetry.

---

## How EOD pulls task information

`services/eod.service.ts`

`ensureEodForUser` builds the draft from the day's task data, so the employee never
retypes what the system knows:

| Bucket | Rule |
| --- | --- |
| `COMPLETED` | Completed or submitted for review within the day, in company time |
| `BLOCKED` | Currently blocked, carrying the blocker reason |
| `PENDING` | Still open — everything else that was worked or planned |
| `ADDITIONAL` | Typed by the employee at submission: work outside the task list |

Tasks planned in the morning SOD are included even if they were reassigned during the day,
so the day's story stays complete.

The draft refreshes on every load while the EOD is `PENDING` or `CHANGES_REQUESTED`, and
anything the employee has already typed (hours, notes) is preserved. Once `SUBMITTED` or
`REVIEWED`, it is frozen.

Submission adds the narrative the system cannot infer: work summary, reason for pending
work, blockers, additional work, next-day plan, and total hours (defaulting to the hours
from attendance). Supervisors are then notified for review.

---

## How review works

Both review flows follow the same shape.

**Tasks** — employee submits → task appears in `GET /tasks/review-queue` for anyone with
`task.review` in scope → reviewer approves (`COMPLETED`) or requests changes
(`CHANGES_REQUIRED`, notes mandatory) → employee is notified and the task returns to them.
`reviewRounds` counts the loops, which is a useful quality signal in reports.

**EOD** — employee submits → supervisors notified → reviewer approves (`REVIEWED`) or
requests changes (`CHANGES_REQUESTED`) → employee is notified and can edit and resubmit.

"Supervisors" is computed by `supervisorsOf(userId)`: the employee's manager, the leaders
of their teams, and their department head, de-duplicated.

---

## How reminders are triggered

All notifications go through `services/notification.service.ts`. Every alert creates an
in-app `Notification` row; those marked `email: true` are also queued when email is
enabled globally.

Email is written to an `EmailOutbox` table rather than sent inline. Free SMTP tiers are
rate-limited and occasionally fail, and request latency should not depend on a mail
server. The flush job sends queued mail with up to five attempts and records the last
error.

This is also the seam for the brief's future channels. Adding WhatsApp, Telegram, Slack or
Teams means adding a branch inside `notify()` — no caller changes.

---

## How employee work history is stored

Two layers, because the two questions have different shapes.

**Live detail** — `GET /employees/:id/work-history?from&to` joins SOD, EOD and attendance
by date and returns one entry per day: attendance, the plan, the EOD with its items, and
the review status. This is the `Employee → Date → SOD → Tasks → EOD → Review` view.

**Nightly roll-up** — `runDayClose` writes one `DailyWorkRecord` per employee per day with
counts (planned, completed, pending, blocked, overdue), hours worked, average progress,
SOD/EOD/attendance status, and a JSON snapshot of the narrative. Reports read this instead
of recomputing joins across a date range, which is what keeps productivity reporting fast
as history grows.

---

## Organisational hierarchy and access

`services/hierarchy.service.ts`

The reporting chain is CEO → Manager → Employee, at any depth. Each user stores a
materialised path:

```
/ceoId/managerId/ownId/
```

Which turns the two questions that access control keeps asking into cheap operations:

- **Everyone under X** — one indexed prefix match: `hierarchyPath startsWith X.hierarchyPath`
- **X's managers** — already inside X's own path; zero queries

Paths are rebuilt when a manager changes (`setManager`), which also rejects cycles: you
cannot be moved under someone who reports to you. `rebuildAllPaths()` repairs the whole
tree if anything is ever inconsistent.

A Manager's permissions use the `reports` scope, so their employee lists, tasks, SOD/EOD,
attendance, leave, reports and org chart all resolve to their own subtree — and nothing
else. The CEO sits at the root with `.all` scopes. Full detail in
[05-permission-matrix.md](05-permission-matrix.md).

---

## Sessions and location

`services/session.service.ts`, `services/geo.service.ts`

A `UserSession` row is created per sign-in with device, browser, OS and IP. Refresh-token
rotation keeps the same session id, so "logged in since" stays truthful. Ending a session
revokes its refresh tokens, and the auth middleware checks session liveness on every
request — so a remote sign-out takes effect immediately rather than when the access token
expires.

Location is captured only at check-in, check-out and sign-in, and only when three gates
all pass: the company has tracking enabled, the employee has accepted the current privacy
notice, and the device actually returned a fix. Coordinates can be stored rounded to ~1 km
(`APPROXIMATE`), are visible only to the employee, their reporting line and HR, and are
deleted by the retention job — or immediately if consent is withdrawn. Full detail in
[07-security-and-privacy.md](07-security-and-privacy.md).

---

## Extending later

**AI insights.** `DailyWorkRecord` is already the feature table an analysis job would
want: one row per employee per day with counts, hours, progress and compliance. A weekly
job could summarise blockers or flag falling completion rates, reading that table and
writing `Notification` rows. No schema change needed.

**WhatsApp / Telegram.** Add a channel inside `notify()` and a per-user channel
preference. The message content already exists — title, body, and a deep link.

**Two-way chat bots.** A webhook endpoint mapping an inbound message to an employee, then
calling the same service functions the HTTP API uses. Because business rules live in
services rather than routes, "submit my EOD from WhatsApp" reuses `submitEod()` exactly.

**Mobile app.** The API is already token-based and stateless. A React Native client would
consume the same endpoints; geolocation and push would come from the device.
