# 6 · API Reference

Base URL `/api`. All responses are JSON. Every endpoint except `/auth/login`,
`/auth/refresh` and `/health` requires `Authorization: Bearer <accessToken>`.

This list is generated from the live Express router — **118 endpoints**.

---

## Conventions

**Success** — single records return `{ "data": … }`; lists return
`{ "data": [...], "meta": { page, pageSize, total, totalPages } }`.

**Error** — `{ "error": { "code": "...", "message": "...", "details": [...] } }` with
`400` validation, `401` unauthenticated, `403` out of permission or scope, `404` not found
or out of scope, `409` conflict (illegal transition, hierarchy loop), `429` rate limited.

**Dates** — calendar days are `YYYY-MM-DD` strings in the company timezone; timestamps are
ISO-8601 UTC.

**Scope** — list endpoints filter to what the caller may see. A manager receives only
their reporting line, and pagination totals reflect the filtered set.

---

## Authentication & privacy

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/login` | `{ email, password, position? }` → tokens, user, permissions, `sessionId`, privacy state |
| POST | `/auth/refresh` | `{ refreshToken }` → new pair; rotates the token, keeps the session |
| POST | `/auth/logout` | `{ allDevices?: boolean }` — ends this session or every session |
| GET | `/auth/me` | Current user, permissions, session id, privacy state |
| POST | `/auth/change-password` | Ends all sessions on success |
| GET | `/auth/privacy` | Notice text, version, precision, retention, consent state |
| POST | `/auth/privacy/consent` | `{ accepted }` — withdrawing erases stored coordinates |
| GET | `/auth/sessions` | The caller's own sign-in history |
| POST | `/auth/sessions/:id/revoke` | Sign out one of the caller's own devices |

Login rate limit: 20 attempts per 10 minutes per IP.

---

## Employees & hierarchy

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/employees` | `employee.read.*` — filters: `search`, `departmentId`, `teamId`, `roleId`, `status` |
| POST | `/employees` | `employee.create` — returns a temporary password if none supplied |
| GET | `/employees/:id` | `employee.read.*` + scope; includes task stats and leave balances |
| PATCH | `/employees/:id` | `employee.update.all` |
| PATCH | `/employees/me` | Any user — own contact details only |
| GET | `/employees/options` | Lightweight list for assignment dropdowns, scope-filtered |
| POST | `/employees/:id/status` | `employee.deactivate` — ends sessions when not ACTIVE |
| POST | `/employees/:id/reset-password` | `employee.resetPassword` |
| GET | `/employees/:id/work-history` | Day-by-day SOD → tasks → EOD → review |
| GET | `/employees/:id/reports` | Direct reports |
| **GET** | **`/employees/org-chart`** | `employee.hierarchy.read` — tree, scoped to the caller |
| **GET** | **`/employees/:id/reporting-line`** | Manager chain, direct and total report counts |
| **POST** | **`/employees/:id/manager`** | `employee.hierarchy.manage` — `409` on a loop |
| **POST** | **`/employees/hierarchy/rebuild`** | Recomputes every materialised path |

---

## Tasks

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/tasks` | Filters: `status` (comma list, `OVERDUE` allowed), `priority`, `assigneeId`, `departmentId`, `teamId`, `search`, `dueFrom`, `dueTo`, `sort`, `order` |
| POST | `/tasks` | `task.create`. One assignee, `assigneeIds`, `assignToTeamId` or `assignToDepartmentId` — bulk creates one task per person |
| GET | `/tasks/:id` | Full detail with comments, attachments, activity, subtasks |
| PATCH | `/tasks/:id` | Fields only; status has its own endpoint |
| POST | `/tasks/:id/status` | Validated transition. Employees asking for `COMPLETED` get `SUBMITTED_FOR_REVIEW`; the response says so in `appliedStatus` |
| POST | `/tasks/:id/progress` | `{ progress, hoursSpent?, note? }` — progress > 0 starts the task |
| POST | `/tasks/:id/reassign` | `task.reassign`, target must be in scope |
| POST | `/tasks/:id/review` | `task.review` — `{ action: APPROVE \| REQUEST_CHANGES, notes? }` |
| DELETE | `/tasks/:id` | `task.delete` — cancels, never destroys |
| POST | `/tasks/:id/comments` | `isInternal` requires the admin portal |
| POST | `/tasks/:id/attachments` | multipart `files`, ≤5 files, ≤10 MB each |
| DELETE | `/tasks/:id/attachments/:attachmentId` | |
| GET | `/tasks/review-queue` | Everything awaiting the caller's approval |
| GET | `/tasks/meta/options` | Status and priority vocabularies |

**Recurring & templates** — `GET POST /recurring-tasks`, `PATCH DELETE /recurring-tasks/:id`,
`POST /recurring-tasks/run-now`; `GET POST /task-templates`, `DELETE /task-templates/:id`.

---

## SOD — both directions

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/sod/today` | Creates and syncs today's plan, returns it with `taskCount` |
| GET | `/sod/:date` | Any date; `?userId=` requires `sod.read` scope over that person |
| GET | `/sod/history` | Filters: `userId`, `from`, `to`, `status` |
| POST | `/sod/:date/submit` | Confirms the plan and acknowledges its items |
| **POST** | **`/sod/:date/entries`** | Both directions — see below |
| **PATCH** | **`/sod/entries/:id`** | Outcome, hours, or `status` (`PENDING`/`IN_PROGRESS`/`DONE`/`DROPPED`) |
| **DELETE** | **`/sod/entries/:id`** | Task-generated entries cannot be removed |

`POST /sod/:date/entries` decides direction from the body:

```jsonc
// Employee adds their own work — needs sod.selfEntry
{ "title": "Pair with QA on the flaky checkout test", "plannedHours": 1 }

// Manager assigns a duty — needs sod.assign AND scope over every target
{
  "userIds": ["emp_1", "emp_2"],
  "title": "Run the release checklist",
  "instructions": "Cover staging and production.",
  "priority": "HIGH",
  "dueTime": "16:00"
}
```

Assigned entries carry `assignedBy`, need acknowledgement, notify the employee, and reopen
a day that was auto-skipped. Entries may be added after submission in both directions.

---

## EOD

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/eod/today` | Draft pre-filled from the day's task activity |
| GET | `/eod/:date` | `?userId=` requires `eod.read` scope |
| GET | `/eod/history` | Filters: `userId`, `from`, `to`, `status` |
| GET | `/eod/review-queue` | `eod.review` — submissions awaiting a decision |
| POST | `/eod/:date/submit` | Summary, pending reason, blockers, next-day plan, per-item hours, `extraItems` |
| POST | `/eod/:id/review` | `eod.review` — `{ action, notes? }` |

---

## Attendance

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/attendance/today` | Today's record plus `canCheckIn` / `canCheckOut` |
| POST | `/attendance/check-in` | `{ workMode?, note?, position? }` → `locationCaptured` |
| POST | `/attendance/check-out` | `{ note?, position? }` → worked hours |
| GET | `/attendance` | Range query `from`/`to` (a single day is `from == to`), `userId`, `status`; coordinates redacted without location rights |
| PATCH | `/attendance/:id` | `attendance.manage` — manual correction |
| POST | `/attendance/corrections` | Employee request |
| GET | `/attendance/corrections/list` | Scope-filtered |
| POST | `/attendance/corrections/:id/decide` | `attendance.correction.review` |

`position` is stored only when company tracking is on **and** the employee has consented.

---

## Leave

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/leave` | Filters: `status`, `userId`, `from`, `to` |
| POST | `/leave` | Checks overlap and balance; counts working days only |
| POST | `/leave/:id/decide` | `leave.approve` — `{ action: APPROVE \| REJECT, note? }` |
| POST | `/leave/:id/cancel` | Own requests; restores the balance |
| GET | `/leave/balance` | `?userId=`, `?year=` |
| GET | `/leave/types` | Active types |
| GET | `/leave/holidays` | `?year=` |
| GET | `/leave/estimate` | Working days a range would cost, before applying |

---

## Sessions & activity

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/sessions` | `session.read.*` — history, scope-filtered; `?userId=`, `?activeOnly=` |
| GET | `/sessions/active` | Who is signed in now, with idle flags |
| POST | `/sessions/:id/revoke` | `session.revoke` + scope; audited |
| POST | `/sessions/expire-idle` | Manual sweep of idle sessions |

---

## Dashboards & reports

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/dashboard/me` | Employee home: SOD, EOD, attendance, task counts, leave, upcoming work |
| GET | `/dashboard/admin` | Filters `date`, `departmentId`, `teamId`, `employeeId`; includes a 7-day trend |
| GET | `/reports/tasks` | Per-employee assigned, completed, on-time, overdue, hours |
| GET | `/reports/sod` | SOD compliance |
| GET | `/reports/eod` | EOD compliance with summaries and blockers |
| GET | `/reports/productivity` | Days present, hours, tasks/day, SOD & EOD compliance |
| GET | `/reports/department` | Department roll-up |
| GET | `/reports/attendance` | Present, WFH, late, half-day, leave, absent, hours |

All reports accept `from`, `to`, `departmentId`, `teamId`, `employeeId`, and
`format=json|xlsx|csv|pdf`. Any format other than `json` requires `report.export`.

---

## Organisation & administration

| Method | Path | Permission |
| --- | --- | --- |
| GET POST | `/org/departments`, PATCH `/org/departments/:id` | `org.manage` |
| GET POST | `/org/teams`, PATCH `/org/teams/:id` | `org.manage` |
| GET | `/org/roles` | Roles plus the full permission catalogue |
| POST PATCH DELETE | `/org/roles`, `/org/roles/:id` | `role.manage` |
| POST DELETE | `/org/holidays`, `/org/holidays/:id` | `holiday.manage` |
| GET POST PATCH | `/org/leave-types`, `/org/leave-types/:id` | `leave.manage` |
| POST | `/org/leave-balances` | `leave.manage` — adjust entitlement |
| GET | `/org/settings` | `settings.read` |
| PATCH | `/org/settings` | `settings.manage`; privacy fields additionally need `privacy.manage` |
| GET | `/org/audit` | `audit.read` |

---

## Notifications, documents, jobs

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/notifications` | `?unreadOnly=` |
| GET | `/notifications/unread-count` | Polled by the bell |
| POST | `/notifications/:id/read`, `/notifications/read-all` | |
| POST | `/notifications/broadcast` | `notification.broadcast`, scope-limited |
| GET POST | `/documents`, DELETE `/documents/:id` | Personal and company files |
| GET | `/files/documents/:id`, `/files/attachments/:id` | Permission-checked download |
| GET | `/jobs` | `settings.read` — available scheduled jobs |
| POST | `/jobs/:key/run` | `settings.manage` — run one now; all are idempotent |
| GET | `/health` | Unauthenticated liveness probe |

Job keys: `sodGeneration`, `sodReminder`, `eodReminder`, `eodMissing`, `dayClose`,
`recurring`, `overdue`, `deadlines`, `flushMail`, `expireIdleSessions`,
`purgeActivityData`.
