# 2 · Development & Infrastructure Requirements

*Answers Question 2 of the requirement document, including expected monthly cost.*

The brief asks to use free things first. This plan starts at **₹0 / month** and stays
there until real usage forces a specific upgrade. Every paid step below is triggered by a
measurable condition, not by a calendar.

---

## What is actually needed

| # | Requirement | Free option chosen | When you would pay |
| --- | --- | --- | --- |
| 1 | Domain | Free subdomain from the host (`yourapp.vercel.app`) | A branded domain: ₹700–1,200/yr |
| 2 | Frontend hosting | Vercel / Netlify / Cloudflare Pages free tier | Beyond 100 GB bandwidth/month |
| 3 | API hosting | Render / Railway / Fly.io free tier | When cold starts become unacceptable |
| 4 | Database | Supabase Postgres free tier (500 MB) | Above ~500 MB, or when you need point-in-time recovery |
| 5 | Email | Brevo 300/day, Resend 3,000/month, or Gmail SMTP | Above those volumes |
| 6 | File storage | Local disk → Cloudflare R2 (10 GB free) | Above 10 GB |
| 7 | SSL | Automatic and free on all the above (Let's Encrypt) | Never |
| 8 | Backups | `pg_dump` on a free scheduled job to R2 | Managed PITR: ~$19/mo |
| 9 | Error monitoring | Sentry free tier (5k events/month) | Above that |
| 10 | Source control & CI | GitHub free + GitHub Actions (2,000 min/month) | Private org features |
| 11 | Third-party APIs | None required | WhatsApp Business API, if adopted later |

**No third-party API is required for the system to work.** Location capture uses the
browser's built-in Geolocation API, which is free and needs no key. Coordinates are
stored as numbers; no paid geocoding service is used. Maps links point at OpenStreetMap,
which is free.

---

## Environments

| Environment | Purpose | Cost |
| --- | --- | --- |
| Local development | SQLite file, mail printed to console, files on disk | ₹0, no accounts needed |
| Staging | Free-tier API + free Postgres, seeded demo data | ₹0 |
| Production | Free tier until the triggers below | ₹0 → ₹1,800/mo |

Local development deserves emphasis: `npm run setup && npm run dev` works with no Docker,
no database server, no SMTP account and no cloud login. A new developer is productive in
about two minutes, which matters more than it sounds.

---

## Monthly cost

### Stage 1 — launch, up to ~50 employees · **₹0 / month**

| Item | Service | Cost |
| --- | --- | --- |
| Frontend | Vercel Hobby | ₹0 |
| API | Render free web service | ₹0 |
| Database | Supabase free (500 MB) | ₹0 |
| Email | Brevo free (300/day) | ₹0 |
| Files | Local disk, or R2 free 10 GB | ₹0 |
| SSL, DNS | Included | ₹0 |
| Backups | GitHub Actions cron → `pg_dump` → R2 | ₹0 |
| Monitoring | Sentry free, plus host logs | ₹0 |
| **Total** | | **₹0** |

The one real limitation: free API instances sleep after inactivity, so the first request
after a quiet period takes 30–60 seconds. For an internal tool used in bursts at 9am and
6pm that is genuinely annoying, and it is the first thing worth paying to fix.

A free workaround that mostly solves it: a GitHub Actions cron pinging `/api/health`
every 10 minutes during working hours.

### Stage 2 — up to ~250 employees · **~₹1,150 / month**

| Item | Service | Cost |
| --- | --- | --- |
| API | Render Starter (always on, 512 MB) | ~₹600 ($7) |
| Database | Supabase Pro, or stay free if under 500 MB | ~₹0–2,100 |
| Domain | `.com`, amortised | ~₹80 |
| Everything else | Still free tier | ₹0 |
| **Total** | | **~₹700–2,300** |

### Stage 3 — up to ~1,000 employees · **~₹4,000 / month**

| Item | Service | Cost |
| --- | --- | --- |
| API | 2 × Starter instances behind the host's load balancer | ~₹1,200 |
| Database | Managed Postgres with daily backups and PITR | ~₹1,600 |
| Object storage | R2 beyond the free tier | ~₹200 |
| Email | Paid tier as volume grows | ~₹700 |
| Monitoring | Sentry Team | ~₹2,200 (optional) |
| **Total** | | **~₹3,700–5,900** |

For context: a per-seat SaaS HR tool at ₹150/user/month costs ₹150,000/month at 1,000
employees. Self-hosting stays under ₹6,000 because the cost scales with data and traffic,
not with headcount.

---

## Storage estimate

Rough per-employee-per-year figures from the actual schema:

| Data | Rows/employee/year | Approximate size |
| --- | --- | --- |
| Tasks | ~250 | 250 KB |
| SOD + items | 250 + ~800 | 200 KB |
| EOD + items | 250 + ~800 | 350 KB |
| Attendance | 250 | 60 KB |
| Notifications | ~600 | 120 KB |
| Sessions | ~500 | 80 KB |
| Audit log | ~800 | 200 KB |
| **Total** | | **~1.3 MB** |

So 100 employees ≈ 130 MB/year, and the 500 MB free tier covers roughly three years at
that size. Attachments dominate long before rows do, which is why they live in object
storage rather than the database.

---

## Deployment

**Frontend** — connect the repo to Vercel, build command `npm run build -w web`, output
`web/dist`. Set `VITE_API_TARGET` to the API URL. Push to `main` deploys.

**API** — a Render web service, build `npm install && npm run build -w server`, start
`npm run start -w server`. Required environment:

```
NODE_ENV=production
DATABASE_URL=postgresql://…:6543/postgres?pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://…:5432/postgres    # migrations only
TZ=Asia/Kolkata
JWT_ACCESS_SECRET=<openssl rand -base64 32>
JWT_REFRESH_SECRET=<a different one>
CORS_ORIGINS=https://yourapp.vercel.app
APP_URL=https://yourapp.vercel.app
SCHEDULER_ENABLED=true      # exactly one instance
SMTP_HOST=…  SMTP_USER=…  SMTP_PASS=…
```

The server refuses to start in production if the JWT secrets are still the development
defaults — see `assertProductionSafety()` in `server/src/env.ts`. That is deliberate: a
forgotten secret is the single most likely way this system gets compromised.

**Database** — create the Supabase project, then `npm run -w server db:use:postgres`
(switches the provider and adds `directUrl`). Set `DATABASE_URL` to the transaction
pooler and `DIRECT_URL` to the direct connection, then `npm run -w server
db:migrate:deploy`.

Bootstrap with `npm run -w server db:bootstrap`, **not** `db:seed` — the seed creates the
demo organisation with a shared password, while the bootstrap creates the role and
position catalogues plus exactly one admin whose password you choose.

**Backups** — a scheduled GitHub Action runs `pg_dump`, gzips, and uploads to R2 with a
30-day retention. Free, and the restore path is a single `psql` command. Test the restore
quarterly; an untested backup is a hope, not a backup.

---

## Ongoing maintenance

| Task | Frequency | Effort |
| --- | --- | --- |
| Dependency and security updates | Monthly | 1–2 h |
| Backup restore drill | Quarterly | 1 h |
| Review audit log and permissions | Quarterly | 1 h |
| Capacity check (DB size, response times) | Monthly | 30 min |
| Feature work and support | Ongoing | Per agreement |

Budget roughly **4–6 hours a month** to keep the system healthy, excluding new features.
