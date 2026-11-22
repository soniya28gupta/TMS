# Deployment — Vercel + Supabase

Everything runs on **two accounts you already have**. No Render, no GitHub required.

| Piece | Where | Status |
| --- | --- | --- |
| Frontend | Vercel (static) | ✅ live |
| API | Vercel (serverless function, `api/index.ts`) | ✅ deployed |
| Database | Supabase Postgres | ⏳ needs `DATABASE_URL` + `DIRECT_URL` |
| File uploads | Supabase Storage | ⏳ needs `SUPABASE_SERVICE_KEY` |
| Scheduler | External cron → `/api/jobs/tick` | ⏳ needs the pinger set up |

**Live:** https://task-management-system-nine-rouge.vercel.app

The frontend and API share one origin, so there is no CORS to configure and no
`VITE_API_URL` to set — the client's default `/api` resolves to the same deployment.

---

## What is already configured

Set on Vercel production, generated rather than reused:

```
JWT_ACCESS_SECRET     JWT_REFRESH_SECRET     CRON_SECRET
CORS_ORIGINS          APP_URL                SCHEDULER_ENABLED=false
SUPABASE_URL          SUPABASE_BUCKET=attachments
```

`SCHEDULER_ENABLED=false` is deliberate: a serverless function has no persistent
process, so the in-process tick is replaced by the HTTP endpoint below.

`TZ` cannot be set on Vercel (reserved name), so `createApp()` pins `Asia/Kolkata`
itself at startup.

---

## Step 1 · Three environment variables

In **Vercel → Project → Settings → Environment Variables**, add these to *Production*.
They are the only ones that involve your credentials, which is why they are not already
set.

| Variable | Where to get it |
| --- | --- |
| `DATABASE_URL` | Supabase → Settings → Database → **Transaction pooler**, port `6543`. Append `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | Same page → **Session pooler**, port `5432` |
| `SUPABASE_SERVICE_KEY` | Supabase → Settings → API Keys → the **secret** key |

Two connection strings are needed because Supabase pools through PgBouncer and Prisma
migrations cannot run over a transaction pooler — DDL needs a real session.

Use the **session pooler** for `DIRECT_URL`, not `db.<ref>.supabase.co`. That direct host
is IPv6-only on new projects, and Vercel's outbound is IPv4.

> Rotate the secret key and the database password first if either has ever been pasted
> into a chat, an issue tracker or a commit.

## Step 2 · Create the schema

Run once from your machine, against Supabase:

```bash
cd server && npm run db:use:postgres
```

```bash
DATABASE_URL="<pooler-url>" DIRECT_URL="<direct-url>" npm run db:migrate:deploy
```

Then create your Super Admin — **never `db:seed` in production**, that is the demo
organisation with a shared password:

```bash
DATABASE_URL="<pooler-url>" DIRECT_URL="<direct-url>" npm run db:bootstrap
```

…with `BOOTSTRAP_EMAIL`, `BOOTSTRAP_PASSWORD` and `BOOTSTRAP_COMPANY` set. It creates the
roles, the 58-position catalogue, departments, leave types, IST settings and exactly one
admin.

Restore local development afterwards:

```bash
npm run -w server db:use:sqlite
```

## Step 3 · Redeploy

```bash
vercel deploy --prod --yes
```

Then `curl https://task-management-system-nine-rouge.vercel.app/api/health` should return
`"ok": true` with `"timezone": "Asia/Kolkata"`.

## Step 4 · The scheduler

Serverless has no process to hold a timer, so an external scheduler calls the tick. The
endpoint is idempotent — calling it twice in a minute does nothing twice.

Sign up free at <https://cron-job.org> and create a job:

- **URL** — `https://task-management-system-nine-rouge.vercel.app/api/jobs/tick`
- **Method** — POST
- **Schedule** — every minute (or every 5 minutes; reminders then fire within 5 of their time)
- **Header** — `Authorization: Bearer <CRON_SECRET>`

Your `CRON_SECRET` is in Vercel's environment variables — copy it from there.

Without this, reminders, the overdue scan and the nightly roll-up do not run. Everything
else still works: SOD and EOD build themselves when an employee opens the page.

---

## Verified working

- `/api/health` → 503 with the exact reason while `DATABASE_URL` is unset, 200 once set
- `/api/jobs/tick` → **403** without the secret, authenticates with it
- Express routing survives Vercel's rewrite — `/api/nonexistent` returns the app's own JSON 404
- Prisma's `rhel-openssl-3.0.x` engine loads on Lambda
- 71/71 tests, 0 typecheck errors, clean build

---

## After it is live

- **Cold starts** are about a second, versus 30–60 on a sleeping container host.
- **Supabase free projects pause after ~7 days idle.** The cron pinger keeps it awake.
- **Backups:** the free tier keeps 7 days of daily snapshots and no point-in-time
  recovery. Add the `pg_dump` action from
  [docs/07-security-and-privacy.md](docs/07-security-and-privacy.md) before real data.
- **Function timeout** is 30s (`vercel.json`). Large PDF/Excel exports may need moving to
  a background job if they ever approach it.
- **Local development is unchanged** — SQLite and local-disk uploads, no cloud account
  needed. The storage layer picks its backend from whether `SUPABASE_URL` is set.
