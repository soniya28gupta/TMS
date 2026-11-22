 HEAD
# Task Management System

Admin + Employee portals for assigning daily work, tracking progress, and automating the
SOD → Task → Progress → EOD → Review cycle, with attendance, leave, reporting, an
organisational hierarchy, session/location tracking and role-based access control.

Everything in the default setup is free: SQLite needs no server, mail falls back to the
console, files are stored on local disk, and the scheduler runs in-process. Nothing here
requires a paid account to run or to demo.

---

## Quick start

```bash
npm run setup
```

That installs both workspaces, creates the SQLite database and seeds a demo organisation.
Then:

```bash
npm run dev
```

- Web portal → <http://localhost:5173>
- API → <http://localhost:4000/api/health>

### Demo accounts

All use the password `Password@123`.

| Role | Email | What they see |
| --- | --- | --- |
| CEO | `ceo@acme.test` | The whole organisation |
| Super Admin | `admin@acme.test` | Everything, plus system settings and roles |
| HR Admin | `hr@acme.test` | All employees, attendance, leave, documents, privacy policy |
| Manager | `manager@acme.test` | Only their own reporting line (Engineering) |
| Sales Manager | `sales.manager@acme.test` | Only their own reporting line (Sales) |
| Team Lead | `lead@acme.test` | Their team |
| Employee | `ananya@acme.test` | Their own work only |

Sign in as `manager@acme.test` and then `ceo@acme.test` to see reporting-line access
control in action — the manager's employee list, org chart and reports contain only the
people beneath them.

---

## Commands

| Command | Does |
| --- | --- |
| `npm run setup` | Install, create the database, seed demo data |
| `npm run dev` | Run API and web together |
| `npm run build` | Type-check and build both for production |
| `npm test` | Run the API test suite (71 tests, against its own isolated database) |
| `npm run typecheck` | Type-check both workspaces |
| `npm run db:reset` | Wipe and re-seed the demo database |
| `npm run -w server db:bootstrap` | **Production** first-run: roles, positions, IST settings and one admin — no demo data |
| `npm run -w server db:use:postgres` | Switch the Prisma datasource to PostgreSQL |
| `npm run -w server db:studio` | Browse the database in Prisma Studio |

Running the two servers separately is sometimes handy:

```bash
npm run dev:server
```

```bash
npm run dev:web
```

---

## What is built

**Phase 1 — core**
Login and JWT auth · Admin portal · Employee portal · Employee management · Task
management with the full status workflow · SOD · EOD · progress tracking · in-app and
email notifications · dashboards and reports.

**Phase 2**
Attendance with check-in/out and corrections · leave with balances, approvals and a
holiday calendar · advanced reports with Excel/CSV/PDF export · recurring tasks · task
templates · configurable role-based permissions.

**Added on top of the original brief**
Organisational hierarchy (CEO → Manager → Employee) with reporting-line access control ·
login/logout session tracking with remote sign-out · consent-gated geolocation capture at
check-in/out · bidirectional SOD, where managers assign duties and employees add their
own entries.

**Production hardening**
A position catalogue across every department (Junior Software Engineer → Software
Engineer I/II/III → Senior → Project Lead → Manager → Director → CxO) with seniority
levels · hiring delegated down the hierarchy, so a lead may only add people more junior
than themselves and only inside their own reporting line · file attachments on SOD
entries, scoped by the same hierarchy · Indian Standard Time throughout · a production
bootstrap that creates one admin and no demo accounts.

---

## How the automation works

The scheduler is a single one-minute tick (`server/src/jobs/scheduler.ts`) that compares
the wall clock against times held in the Settings table. Changing a reminder time in the
UI takes effect on the next tick — there is no cron to re-register and no restart.

```
08:00  recurring templates → tasks, then SOD generated from each employee's open tasks
10:00  SOD reminder to anyone who has not confirmed
hourly overdue scan + "due within 24h" nudges
18:00  EOD drafts pre-filled from the day's task data, reminder sent
21:00  missing-EOD escalation to the employee and their manager
23:45  attendance closed, daily work record written, retention purge, next day warmed
```

Every job is idempotent, so a manual re-run from **Settings → Jobs** changes nothing that
has already happened.

---

## Project layout

```
server/                  Express + TypeScript API
  prisma/schema.prisma   Data model (SQLite by default, Postgres-ready)
  prisma/seed.ts         Demo organisation
  src/auth/              JWT, password hashing, RBAC and scope resolution
  src/jobs/              Scheduler and the individual automation jobs
  src/lib/               Dates, errors, HTTP helpers, JSON column helpers
  src/routes/            One router per module
  src/services/          Domain logic (tasks, SOD, EOD, attendance, leave, hierarchy…)
  tests/                 API test suites

web/                     React + Vite + Tailwind SPA
  src/components/        Design system, layout, shared task list
  src/lib/               API client, auth context, formatting, geolocation
  src/pages/employee/    Employee portal
  src/pages/admin/       Admin portal
  src/pages/shared/      Screens used by both

docs/                    Architecture, costs, schema, permissions, API, timeline
```

---

## Documentation

| Document | Covers |
| --- | --- |
| [docs/01-tech-stack.md](docs/01-tech-stack.md) | Recommended stack and why it scales |
| [docs/02-infrastructure-and-cost.md](docs/02-infrastructure-and-cost.md) | Hosting, services, monthly cost from ₹0 |
| [docs/03-automation-architecture.md](docs/03-automation-architecture.md) | SOD → Task → EOD → Review design |
| [docs/04-database-schema.md](docs/04-database-schema.md) | Entities and relationships |
| [docs/05-permission-matrix.md](docs/05-permission-matrix.md) | Roles, scopes and the hierarchy model |
| [docs/06-api-reference.md](docs/06-api-reference.md) | Every endpoint |
| [docs/07-security-and-privacy.md](docs/07-security-and-privacy.md) | Security, location consent, retention, backups |
| [docs/08-timeline-and-cost.md](docs/08-timeline-and-cost.md) | Phase plan, effort and development cost |
| [docs/09-screens-and-modules.md](docs/09-screens-and-modules.md) | Every screen in both portals, and the module map |
| [docs/10-deployment.md](docs/10-deployment.md) | Live URLs and step-by-step deployment |

---

## Moving to production

1. **Database** — run `npm run -w server db:use:postgres`, which switches the provider
   and adds `directUrl`. Point `DATABASE_URL` at your Supabase transaction pooler and
   `DIRECT_URL` at the direct connection, then `npm run -w server db:migrate:deploy`.
   The schema deliberately avoids SQLite-only and Postgres-only features, so no model
   changes are needed.
2. **Secrets** — set `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. The server refuses to
   boot in production with the development defaults.
3. **Mail** — set `SMTP_*` and turn on email notifications in Settings. Free tiers:
   Brevo (300/day), Resend (3,000/month), or Gmail SMTP.
4. **Files** — `storage.service.ts` is the single seam to swap local disk for S3,
   Supabase Storage or Cloudflare R2.
5. **Scheduler** — run exactly one instance with `SCHEDULER_ENABLED=true`. If you scale
   the API to several instances, keep it enabled on one of them only.

See [docs/02-infrastructure-and-cost.md](docs/02-infrastructure-and-cost.md) for the full
deployment plan.
=======
# TMS
>>>>>>> 00e2b625b22b071d572ed29303770236c6db050a
