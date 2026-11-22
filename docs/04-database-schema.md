# 4 · Database & Entity Structure

Source of truth: `server/prisma/schema.prisma`.

The schema targets **SQLite in development** and **PostgreSQL in production** from one
file. To switch, change `provider` and point `DATABASE_URL` at the new database — no model
changes. That portability is bought by avoiding three things: native enums, scalar list
columns, and database-specific column types.

Enum-like columns are therefore `String`, validated by Zod at the API boundary and typed
as unions in `server/src/constants.ts`. Small structured values (working days, tags,
checklists, audit metadata) are JSON in `TEXT`, read through helpers in `lib/json.ts`.

---

## Entity map

```
                          ┌───────────┐
                          │   Role    │──< RolePermission
                          └─────┬─────┘
                                │
┌────────────┐   ┌──────────────▼──────────────┐   ┌──────────────┐
│ Department │──<│            User             │>──│ TeamMember   │>── Team
└────────────┘   │  managerId → User (self)    │   └──────────────┘
                 │  hierarchyPath (subtree)    │
                 └──┬────┬────┬────┬────┬───┬──┘
                    │    │    │    │    │   │
    ┌───────────────┘    │    │    │    │   └────────────┐
    │            ┌───────┘    │    │    └──────┐         │
┌───▼───┐   ┌────▼───┐   ┌────▼────┐   ┌───────▼──────┐ ┌▼──────────────┐
│ Task  │   │  Sod   │   │   Eod   │   │  Attendance  │ │ UserSession   │
└───┬───┘   └───┬────┘   └────┬────┘   └──────┬───────┘ └───┬───────────┘
    │           │             │               │             │
    │      ┌────▼────┐  ┌─────▼────┐  ┌───────▼──────────┐  └── RefreshToken
    │      │ SodItem │  │ EodItem  │  │ AttendanceCorr.  │
    │      └────┬────┘  └─────┬────┘  └──────────────────┘
    │           │             │
    └───────────┴─────────────┘   (both reference Task)

Task ──< TaskComment, TaskAttachment, TaskActivity, Task (subtasks)
RecurringTask ──< Task          TaskTemplate (standalone)
LeaveType ──< LeaveBalance, LeaveRequest        Holiday
User ──< Notification, Document, AuditLog, DailyWorkRecord
EmailOutbox, Setting (standalone)
```

---

## Access control

**Role** — `key`, `name`, `portal` (ADMIN | EMPLOYEE), `rank`, `isSystem`.
**RolePermission** — one row per granted permission string, unique per role.

Permissions are data, so a Super Admin retunes a role in the UI without a deploy. Format
is `resource.action` or `resource.action.scope`, with `*` as the Super Admin wildcard.

---

## People and hierarchy

**User** holds credentials, profile, employment details, work schedule and status. Notable
columns:

| Column | Why it exists |
| --- | --- |
| `managerId` | Self-relation forming the CEO → Manager → Employee chain |
| `hierarchyPath` | Materialised `/ceo/manager/self/`; makes "everyone under X" one indexed prefix query |
| `hierarchyDepth` | Level in the tree; used for ordering and the org chart |
| `workingDays`, `shiftStart`, `shiftEnd`, `timezone` | Per-employee schedule driving SOD skips, late detection and leave-day counting |
| `mustChangePassword` | Set for temporary passwords |
| `locationConsentAt`, `locationConsentVersion` | Versioned consent; a new notice invalidates the old acceptance |
| `status` | ACTIVE / INACTIVE / SUSPENDED — non-active accounts cannot authenticate |

**UserSession** — one row per sign-in: login, last-seen, logout, end reason, IP, device,
browser, OS, optional login coordinates. **RefreshToken** links to it, so rotation keeps
one session and ending a session revokes its tokens.

**Department**, **Team**, **TeamMember** — the structural org, separate from the reporting
chain. A person can sit in a department, lead a team, and report to someone in a different
department.

---

## Tasks

**Task** — the central work record.

| Group | Columns |
| --- | --- |
| Identity | `code` (TSK-000042), `title`, `description`, `tags` |
| Classification | `priority`, `status`, `departmentId`, `teamId` |
| People | `assigneeId`, `createdById`, `reviewedById` |
| Dates | `startDate`, `dueDate`, and timestamps for accepted/started/submitted/completed/cancelled |
| Effort | `estimatedHours`, `actualHours`, `progress` |
| Derived | `isOverdue`, `overdueSince` — maintained hourly |
| Review | `reviewNotes`, `reviewedAt`, `reviewRounds` |
| Blocking | `blockedReason`, `blockedAt` |
| Structure | `parentTaskId` (subtasks), `recurringTaskId` (origin) |

`status` holds the workflow state; `isOverdue` is a separate derived flag so a task that
becomes overdue does not lose the fact that it is *in progress*. The API exposes both plus
a `displayStatus` for badges.

**TaskComment** (with `isInternal` for admin-only notes) · **TaskAttachment** (metadata;
bytes live in storage) · **TaskActivity** (append-only timeline).

**RecurringTask** — the template: frequency, applicable days, target (employee, team or
department), due offset and time, and `lastRunDate` which makes generation idempotent.
**TaskTemplate** — a reusable starting point for manual creation.

---

## SOD and EOD

**Sod** — one per employee per day (`@@unique([userId, date])`), with `status`
(PENDING / SUBMITTED / SKIPPED) and `skipReason` recording *why* a day needed no plan.

**SodItem** — the bidirectional part of the design:

| Column | Purpose |
| --- | --- |
| `source` | `AUTO_TASK` (from a task), `ASSIGNED` (a manager wrote it), `SELF` (the employee wrote it) |
| `assignedById`, `assignedAt`, `instructions`, `dueTime` | Populated for assigned duties |
| `status`, `completedAt` | Per-item tracking, so a small duty needs no task ticket |
| `titleSnapshot`, `prioritySnapshot`, `statusSnapshot`, `progressSnapshot` | Captured at generation, so history stays truthful if the task later changes |
| `taskId` | Nullable — assigned and self-added entries have no task behind them |

**Eod** — one per employee per day, with the narrative (`workSummary`, `pendingReason`,
`blockers`, `additionalWork`, `nextDayPlan`, `totalHours`) and the review outcome.

**EodItem** — `category` is COMPLETED / PENDING / BLOCKED / ADDITIONAL, plus
`statusAtEod`, `progressAtEod`, `hoursSpent` and notes. Snapshots again, so a report run
next year reflects what was true that day.

**DailyWorkRecord** — the nightly roll-up: counts, hours, average progress, and SOD / EOD /
attendance status, plus a JSON snapshot. Reports read this instead of recomputing joins
across a date range.

---

## Attendance and leave

**Attendance** — one per employee per day: check-in/out, worked minutes, status, work
mode, IPs, and the location block (consent flag, coordinates, accuracy, address, distance
from the office geofence, inside/outside flag, and `locationPurgedAt` for retention).

**AttendanceCorrection** — the employee's request and the reviewer's decision; approval
writes back to the attendance row.

**LeaveType** (entitlement, paid, half-day, carry-forward) · **LeaveBalance** (per user,
type and year: entitled, carried forward, used, pending) · **LeaveRequest** (dates,
working days counted, reason, status, approver) · **Holiday**.

Approved leave pre-fills attendance so those days are never counted absent, and SOD/EOD
generation skips them.

---

## Supporting tables

| Model | Purpose |
| --- | --- |
| `Notification` | In-app alerts: type, title, body, link, severity, read state |
| `EmailOutbox` | Durable mail queue with attempts and last error — free SMTP tiers are flaky |
| `Document` | Personal and company files, with a confidential flag |
| `Setting` | Key/JSON system configuration, editable in the UI |
| `AuditLog` | Actor, action, entity, metadata, IP for compliance-relevant events |

---

## Indexes

Chosen from the queries the screens actually run:

| Table | Index | Serves |
| --- | --- | --- |
| `User` | `hierarchyPath` | "Everyone under this manager" — the hot access-control query |
| `User` | `departmentId`, `managerId`, `roleId`, `status` | Employee lists and scope resolution |
| `Task` | `(assigneeId, status)` | "My open tasks", the most frequent query in the system |
| `Task` | `status`, `dueDate`, `departmentId`, `teamId` | Admin lists, overdue scan, dashboards |
| `Sod`, `Eod` | `(userId, date)` unique · `(date, status)` | Today's record; daily compliance monitors |
| `Attendance` | `(userId, date)` unique · `(date, status)` | Daily register and summaries |
| `LeaveRequest` | `(userId, status)`, `status`, `startDate` | Approval queue and calendar overlap checks |
| `UserSession` | `(userId, isActive)`, `lastSeenAt`, `loginAt` | Live sessions and history |
| `Notification` | `(userId, isRead)` | The unread badge, polled every minute |
| `AuditLog` | `(entity, entityId)`, `actorId`, `createdAt` | Audit search |

---

## Migrations

Development uses `prisma db push` for speed. For production, generate versioned
migrations:

```bash
npm run -w server db:migrate    # creates a migration from schema changes
npm run -w server db:deploy     # applies pending migrations
```

Two rules that avoid the usual pain: take a backup before every migration, and prefer
additive changes (add a column, backfill, then drop the old one in a later release) over
destructive ones, so a rollback never needs the data you just deleted.
