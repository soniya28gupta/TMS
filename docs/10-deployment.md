# 10 · Deployment Guide

Live frontend: **https://task-management-system-nine-rouge.vercel.app**

The system deploys as two pieces, because they have different needs:

| Piece | Host | Why |
| --- | --- | --- |
| Frontend (`web/`) | Vercel | Static files on a CDN — free, instant |
| API (`server/`) | Render | Needs a **persistent process** for the one-minute scheduler tick |
| Database | Supabase | Postgres, free tier |

**Vercel cannot host this API.** Serverless functions are stateless and short-lived; the
scheduler that drives SOD generation, EOD reminders and the overdue scan needs a process
that stays alive. SQLite and local file storage also do not survive on a serverless
filesystem. That is why the API goes elsewhere.

---

## Status

- [x] Frontend deployed to Vercel, publicly reachable
- [x] `/api/*` excluded from the SPA rewrite (it used to answer with `index.html`, which
      made every API call parse HTML as JSON)
- [x] API base URL made configurable via `VITE_API_URL`
- [x] Postgres switch script and Render blueprint prepared
- [ ] `VITE_API_URL` set on Vercel and the frontend redeployed

### What the live link does right now

The frontend is deployed against the **real API**, which is not connected yet, so signing
in reports:

> Cannot reach the server. Check that the API is running on port 4000.

That is correct behaviour, not a bug — it disappears once step 4 below is done.

If you need something presentable before the backend exists, a demo build with canned data
is one env var away:

```bash
vercel env add VITE_DEMO_MODE production   # value: true
```

Remove it again before wiring the real API — while set, it serves mock data and ignores
`VITE_API_URL` entirely.

---

## Step 1 · Database (Supabase, free)

1. Sign in at <https://supabase.com> and create a project (no card).
2. Region: South Asia (Mumbai) · ap-south-1 for an India-based team.
3. Project Settings → Database → Connection string. Copy **two**:
   - `DATABASE_URL` — Transaction pooler, port 6543, plus `?pgbouncer=true&connection_limit=1`
   - `DIRECT_URL` — Direct/Session, port 5432, used only for migrations

   Both are required: Supabase pools through PgBouncer, and Prisma migrations cannot run
   over a transaction pooler.

## Step 2 · Push the code to GitHub

Render deploys from a Git repository. From the project root:

```bash
git init && git add -A && git commit -m "Task Management System"
```

Then create an empty repo on GitHub and:

```bash
git remote add origin https://github.com/<you>/task-management-system.git && git push -u origin main
```

`.gitignore` already excludes `.env`, `dev.db`, `node_modules/`, `.vercel` and uploaded
files, so no secrets or local data go up.

## Step 3 · API (Render, free)

1. Sign up at <https://render.com> and connect your GitHub account.
2. **New → Blueprint**, select the repo. Render reads `render.yaml` and configures the
   service, build command, health check and generated JWT secrets automatically.
3. Fill the three values it asks for:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Supabase transaction pooler string (6543) |
   | `DIRECT_URL` | Supabase direct string (5432) |
   | `CORS_ORIGINS` | `https://task-management-system-nine-rouge.vercel.app` |
   | `APP_URL` | The same Vercel URL |

4. Deploy. The build runs `db:use:postgres`, compiles, and applies the migration in
   `server/prisma/migrations/` to Supabase.
5. Once live, confirm: `https://<your-service>.onrender.com/api/health` returns
   `{"ok":true,...}`.

### Bootstrap the first account

**Do not run `db:seed` in production** — it creates the demo organisation with a shared
password. Use the production bootstrap instead, which creates the role catalogue, the
position catalogue, departments, leave types, IST settings, and exactly **one** Super
Admin with a password you choose:

```bash
cd server && npm run db:use:postgres && DATABASE_URL="<pooler-url>" DIRECT_URL="<direct-url>" BOOTSTRAP_EMAIL="you@company.com" BOOTSTRAP_PASSWORD="<a strong password>" BOOTSTRAP_COMPANY="Your Company" npm run db:bootstrap
```

It is safe to re-run: everything is upserted, and it will never reset an existing
account's password. Sign in, then build the org downwards from **Employees → Add
employee** — the hierarchy rules mean each person you add can go on to add their own
juniors.

## Step 4 · Point the frontend at the API

```bash
vercel env add VITE_API_URL production
```

Paste `https://<your-service>.onrender.com/api` (include `/api`, no trailing slash), then
redeploy:

```bash
vercel deploy --prod --yes
```

Sign in. If it fails, the error message names the exact cause.

---

## Gotchas worth knowing up front

**Cold starts.** The free Render instance sleeps after ~15 minutes idle, so the first
request takes 30–60 seconds. A free fix: a cron-job.org task pinging `/api/health` every
10 minutes during working hours.

**CORS is exact.** `CORS_ORIGINS` must match the browser's origin character for character
— no trailing slash, right protocol. A mismatch shows as a CORS error in the console, not
as a server error.

**One scheduler only.** `SCHEDULER_ENABLED=true` belongs on exactly one instance. The free
plan is single-instance, so it is safe as configured; revisit when you scale out.

**Timezone.** The API's "day" comes from the company timezone in Settings, not the
server's clock, so hosting in another region does not shift anyone's SOD date.

**Prisma provider.** The schema ships as `sqlite` for zero-setup local dev. `render.yaml`
runs `db:use:postgres` during the build. If you deploy another way, run that first, or
Prisma will try to open a SQLite file.

---

## Standalone demo (no backend)

For a link that needs no API at all — a click-through with canned data:

```bash
VITE_DEMO_MODE=true npm run build -w web
```

The mock layer covers every screen-critical endpoint — dashboards, tasks, SOD/EOD,
attendance, leave, org chart, sessions and reports — so the whole UI is clickable. Nothing
persists: writes are acknowledged and dropped. It is for showing the product, not running
it.

---

## Rolling back

Vercel keeps every deployment: `vercel rollback <url>` or use the dashboard.
Render keeps build history with one-click rollback. Take a Supabase backup or `pg_dump`
before any schema change — see [07-security-and-privacy.md](07-security-and-privacy.md).
