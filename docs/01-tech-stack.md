# 1 · Technology & Architecture

*Answers Question 1 of the requirement document.*

## Recommendation at a glance

| Layer | Choice | Licence / cost |
| --- | --- | --- |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS | Free, MIT |
| Backend | Node.js 20+ with Express 4 + TypeScript | Free, MIT |
| ORM | Prisma | Free, Apache 2.0 |
| Database | SQLite for development, PostgreSQL for production | Free, public domain / PostgreSQL licence |
| Authentication | Self-hosted JWT (access + rotating refresh) with bcrypt | Free, no vendor |
| Scheduling | `node-cron` in-process, one-minute tick | Free, MIT |
| File storage | Local disk behind a storage interface | Free, swappable for S3/R2 |
| Email | Nodemailer over SMTP, with a durable outbox | Free, works with any free SMTP tier |
| Reports | ExcelJS (xlsx), PDFKit (pdf), built-in CSV | Free, MIT |
| API style | REST, JSON, versionable under `/api` | — |

Total licensing cost: **zero**. Every component is open source and self-hostable, so
there is no per-seat fee that grows with headcount and no vendor that can change pricing
under you.

---

## Why this stack

### One language across the whole system

Frontend, backend, scripts and tests are all TypeScript. A single developer can move
between layers without a context switch, types for shared shapes are written once, and
hiring is easier because the skill set is one thing rather than three.

The alternative worth naming is **Laravel/PHP or Django/Python + a JS frontend**. Both
are excellent and would work. They lose on the second point below.

### Types that catch mistakes before the client does

The task workflow has ten statuses, the permission system has five scopes, and SOD/EOD
records aggregate data from four other modules. That is exactly the kind of domain where
a wrong string silently produces a wrong report. TypeScript plus Prisma's generated
client makes those mistakes compile errors.

This is not theoretical. During development, the admin portal was written against
endpoints that did not exist (`/attendance/daily`, `/leave/requests`). It type-checked
because the calls used `any`. A contract test now covers every endpoint the UI calls —
see `server/tests/api-contract.test.ts`.

### Prisma over hand-written SQL

Prisma gives migrations, a typed query API, and one schema file that doubles as the
system's data documentation. It also lets the same schema target SQLite locally and
PostgreSQL in production, which is what makes "free to develop, cheap to deploy"
possible without a Docker prerequisite on every developer machine.

The schema deliberately avoids native enums, scalar lists and database-specific column
types. Those are the only features that differ meaningfully between the two engines, so
switching is a one-line change to `provider`.

### JWT rather than a managed identity provider

Auth0, Clerk and Cognito are all good, and all start charging as monthly active users
grow — precisely the number that rises as this system succeeds. The requirements here are
ordinary: email and password, roles, sessions, remote sign-out. That is a well-understood
problem, and the implementation is about 200 lines:

- short-lived access token (30 min) carrying the user, role and session id
- opaque refresh token, stored only as a SHA-256 hash, rotated on every use
- refresh tokens tied to a `UserSession`, so ending a session kills its tokens
- bcrypt password hashing, cost factor 10

If SSO becomes a requirement later, the JWT layer is the natural place to add OIDC
without changing any route.

### In-process scheduling rather than a job queue

The workload is a few thousand rows once or twice a day. Redis + BullMQ would add a
service to run, a bill to pay and a failure mode to monitor, in exchange for throughput
this system will not use.

Instead a single one-minute tick compares the clock to the reminder times stored in
settings. That yields a property the requirements need: an admin who changes the EOD
reminder from 18:00 to 18:30 sees it apply on the next tick, with no restart and no cron
re-registration.

The constraint this creates is documented and deliberate: **run the scheduler on exactly
one instance**. When the API scales horizontally, set `SCHEDULER_ENABLED=false` on all
but one. If that becomes awkward, the migration path is a database advisory lock, then a
real queue — but not before the load justifies it.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Browser — React SPA                                             │
│  Employee portal        Admin portal (role-gated routes)         │
└───────────────────────────────┬──────────────────────────────────┘
                                │ HTTPS, JSON, Bearer token
┌───────────────────────────────▼──────────────────────────────────┐
│  Express API                                                     │
│                                                                  │
│  middleware   helmet · CORS allow-list · rate limit · JWT verify │
│               session liveness check · permission + scope guard  │
│                                                                  │
│  routes       auth · employees · tasks · sod · eod · attendance  │
│               leave · documents · reports · dashboard · org      │
│               sessions · jobs · notifications                    │
│                                                                  │
│  services     task · sod · eod · attendance · leave · hierarchy  │
│               session · geo · notification · export · audit      │
│                                                                  │
│  jobs         one-minute tick → SOD, EOD, recurring, overdue,    │
│               day-close, retention purge, mail flush             │
└───────────────┬──────────────────────────────┬───────────────────┘
                │ Prisma                       │ adapters
┌───────────────▼──────────────┐  ┌────────────▼────────────────────┐
│  PostgreSQL (prod)           │  │  Disk → S3/R2 · SMTP · future   │
│  SQLite (dev)                │  │  WhatsApp / Slack / Teams       │
└──────────────────────────────┘  └─────────────────────────────────┘
```

Three rules keep this maintainable as it grows:

1. **Routes validate, services decide.** Every route parses input with Zod and resolves
   permissions, then hands work to a service. Business rules live in services, which is
   why the scheduler and the HTTP API can share them without duplication.
2. **Access control is data, not code.** Permissions are rows in `RolePermission`, so a
   Super Admin can retune a role in the UI without a deploy.
3. **Adapters at the edges.** Mail, file storage and notifications each sit behind one
   module, so replacing SMTP with a provider API, or adding a WhatsApp channel, touches
   one file and no callers.

---

## Will it scale?

For the workload this system implies — employees, tasks, one SOD and one EOD per person
per day — the honest answer is that a single small server handles it comfortably for a
long time.

| Headcount | What is needed |
| --- | --- |
| Up to ~200 | One 512 MB API instance, free-tier Postgres. Current design, unchanged. |
| 200 – 2,000 | Paid Postgres (~$19/mo) for connection headroom and backups; 1–2 GB API instance. Add Redis only if dashboards feel slow. |
| 2,000 – 10,000 | Two or more API instances behind a load balancer, scheduler pinned to one. Read replica for reports. Move report exports to a background job. |
| Beyond that | Split reporting into its own service reading a replica; consider a real queue for notifications. |

Design choices that keep those steps cheap:

- **Stateless API.** No session state in memory, so adding instances needs no sticky
  sessions. The only exception is the scheduler, which is explicitly single-instance.
- **Indexed hot paths.** Composite indexes on `(assigneeId, status)`, `(date, status)`
  for SOD/EOD/attendance, and `dueDate`. The reporting-line lookup uses a materialised
  `hierarchyPath` with a prefix index, so "everyone under this manager" is one indexed
  query rather than a recursive walk.
- **Pre-aggregated history.** The nightly `DailyWorkRecord` roll-up means the work-history
  screen and productivity reports read one row per employee per day instead of joining
  four tables across a date range.
- **Derived flags, not scans.** `isOverdue` is a stored boolean maintained hourly, so
  dashboards filter on an indexed column instead of computing comparisons per request.

---

## What was deliberately not chosen

| Option | Why not, for this system |
| --- | --- |
| Next.js | The app is a private dashboard behind a login. SEO and SSR add build complexity for no benefit; a static SPA deploys free anywhere. |
| GraphQL | One client, well-understood screens. REST is simpler to cache, log and secure here. |
| Microservices | The modules share employees, tasks and dates constantly. Splitting now would trade one deploy for distributed transactions. |
| MongoDB | The data is deeply relational — employees, managers, tasks, SOD items, approvals. Referential integrity is worth more here than schema flexibility. |
| Redis / BullMQ | Real value at high volume; today it is a service to run and pay for that does nothing the tick cannot. |
| Auth0 / Clerk | Cost scales with active employees — the wrong axis for an internal HR tool. |
