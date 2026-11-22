# 9 · Screen & Module List

Two portals, as the brief specifies. Managers and team leaders use the Admin portal with
reduced permissions rather than a third portal.

Navigation is built from permissions, so a Team Lead and an HR Admin see different menus
without any role-specific code. Every route is additionally guarded server-side.

---

## Employee Portal

| # | Screen | Route | What it does |
| --- | --- | --- | --- |
| 1 | Dashboard | `/` | Today's SOD status, open/overdue/in-review task counts, attendance with check-in/out, leave balances, EOD status, upcoming tasks, unread notifications |
| 2 | My Tasks | `/tasks` | Filterable list — search, status (including Overdue), priority — with progress bars and deadlines |
| 3 | Task Detail | `/tasks/:id` | Description, status actions, progress slider, hours, comments, attachments, activity timeline, blocker and review notes |
| 4 | SOD | `/sod` | Today's auto-generated plan; assigned duties with instructions and their own status control; add own entries; submit; recent history |
| 5 | EOD | `/eod` | Draft grouped into Completed / Pending / Blocked / Additional, pre-filled from task data; per-item hours and notes; summary, blockers, next-day plan; history |
| 6 | Attendance | `/attendance` | Check in and out (with location when consented), today's status, 30-day history with hours and location, correction requests |
| 7 | Leave | `/leave` | Balances per type, apply with a live working-day estimate, request history, cancel, holiday calendar |
| 8 | Profile & Documents | `/profile` | Employment details, editable contact info, password change, **location consent**, **active sessions with remote sign-out**, personal and company documents |
| — | Notifications | Header panel | Unread badge, grouped list, click through to the relevant record, mark all read |

---

## Admin Portal

| # | Screen | Route | What it does |
| --- | --- | --- | --- |
| 1 | Overview | `/admin` | Employee counts, present/absent/late/WFH, task totals by state including overdue and blocked, SOD submitted vs pending, EOD submitted/pending/awaiting review, review and approval queues, 7-day trend. Filters by date, department, team, employee |
| 2 | Employees | `/admin/employees` | Scope-filtered directory with search and filters; create employees with role, department, teams, manager and shift |
| 3 | Employee Detail | `/admin/employees/:id` | Profile, task statistics, leave balances, recent SOD and EOD, work history, reporting line |
| 4 | **Org Chart** | `/admin/org-chart` | Interactive CEO → Manager → Employee tree, collapsible, searchable, scoped to the viewer's reporting line |
| 5 | All Tasks | `/admin/tasks` | Every task in scope; create and assign to a person, several people, a team or a department |
| 6 | Review Queue | `/admin/review` | Tasks submitted for review; approve or request changes with notes |
| 7 | **Assign Duties** | `/admin/assign-sod` | Write duties straight onto employees' SOD plans, with instructions, priority and deadline; multi-select employees; see the day's assigned and self-added entries |
| 8 | SOD / EOD Monitor | `/admin/sod-eod` | Daily compliance for both, with EOD review |
| 9 | **Login Activity** | `/admin/activity` | Who is signed in now with device and idle state; full sign-in history with locations where permitted; remote sign-out |
| 10 | Attendance | `/admin/attendance` | Daily register with status filters; manual corrections; approval of correction requests |
| 11 | Leave | `/admin/leave` | Approval queue with approve/reject and notes |
| 12 | Reports | `/admin/reports` | Six reports with date range and department filters, exportable to Excel, CSV and PDF |
| 13 | Settings | `/admin/settings` | Departments, teams, roles and permissions; system settings; holidays; leave types; recurring tasks; manual job runs |

Screens marked in **bold** were added for the hierarchy, activity-tracking and
bidirectional-SOD requirements.

---

## Module map

| Module | Server | Web |
| --- | --- | --- |
| Authentication & sessions | `auth/`, `routes/auth.routes.ts`, `services/session.service.ts` | `lib/auth.tsx`, `pages/Login.tsx` |
| Hierarchy & RBAC | `auth/rbac.ts`, `services/hierarchy.service.ts` | `pages/admin/OrgChart.tsx` |
| Employees | `routes/employees.routes.ts`, `services/user.service.ts` | `pages/admin/Employees.tsx`, `EmployeeDetail.tsx` |
| Tasks | `routes/tasks.routes.ts`, `services/task.service.ts` | `components/TaskListView.tsx`, `pages/shared/TaskDetail.tsx` |
| SOD | `routes/sod.routes.ts`, `services/sod.service.ts` | `pages/employee/Sod.tsx`, `pages/admin/AssignSod.tsx` |
| EOD | `routes/eod.routes.ts`, `services/eod.service.ts` | `pages/employee/Eod.tsx`, `pages/admin/SodEodMonitor.tsx` |
| Attendance & location | `routes/attendance.routes.ts`, `services/attendance.service.ts`, `services/geo.service.ts` | `pages/employee/Attendance.tsx`, `pages/admin/Attendance.tsx` |
| Leave | `routes/leave.routes.ts`, `services/leave.service.ts` | `pages/employee/Leave.tsx`, `pages/admin/Leave.tsx` |
| Notifications | `services/notification.service.ts`, `services/mailer.service.ts` | `components/Layout.tsx` |
| Automation | `jobs/` | Settings → Jobs |
| Reports | `routes/reports.routes.ts`, `services/export.service.ts` | `pages/admin/Reports.tsx` |
| Administration | `routes/org.routes.ts`, `services/settings.service.ts`, `services/audit.service.ts` | `pages/admin/Settings.tsx` |

---

## Design notes

**One task detail screen for both portals.** `pages/shared/TaskDetail.tsx` adapts its
actions to the viewer's permissions — an employee sees Accept / Start / Submit, a reviewer
additionally sees Approve and Request Changes. One screen means one place for bugs.

**Empty states carry the explanation.** A SOD showing nothing says *why* — weekly off,
holiday, or on approved leave — rather than leaving the employee guessing.

**Destructive and irreversible actions confirm.** Blocking a task requires a reason.
Requesting changes requires notes. Withdrawing location consent states that data will be
deleted.

**Responsive.** The sidebar collapses under 1024px and tables scroll horizontally rather
than forcing the page to.

**Accessibility.** Semantic HTML, labelled form controls, keyboard-dismissable modals,
and status conveyed by text as well as colour.
