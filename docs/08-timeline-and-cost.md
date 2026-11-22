# 8 · Development Timeline & Cost

---

## Status

Everything below is **built, type-checked and tested** in this repository:

- Phase 1 — core system, complete
- Phase 2 — attendance, leave, advanced reports, recurring tasks, templates, RBAC, exports, complete
- Additional scope — organisational hierarchy with reporting-line access control, session
  and location tracking with privacy controls, bidirectional SOD, complete

Verification: 52 API tests across 5 suites, both workspaces type-check clean, and the web
app builds for production. The suites cover the SOD → task → EOD → review flow,
reporting-line isolation, session and consent behaviour, bidirectional SOD, and a contract
test asserting every endpoint the UI calls exists.

The estimates below are what this work costs to build from scratch — for scoping
comparable projects, and for planning Phase 3.

---

## Effort by module

| Module | Days | Included |
| --- | ---: | --- |
| Project setup, CI, environments | 2 | Monorepo, TypeScript, Tailwind, Prisma, seed |
| Auth & RBAC | 5 | JWT + rotating refresh, bcrypt, permission catalogue, scope resolution |
| Organisational hierarchy | 3 | Materialised paths, cycle protection, org chart, reporting-line scope |
| Employee management | 4 | CRUD, departments, teams, profile, documents |
| Task management | 8 | CRUD, bulk assign, status workflow, progress, comments, attachments, review |
| SOD (both directions) | 4 | Auto-generation, skip logic, assignment, self-entries, per-item status |
| EOD | 4 | Draft build from task data, submission, review |
| Attendance | 4 | Check-in/out, late/half-day rules, corrections, geolocation |
| Leave | 4 | Types, balances, working-day counting, approvals, holidays |
| Sessions & privacy | 3 | Session tracking, remote sign-out, consent, retention purge |
| Notifications | 3 | In-app, email outbox with retries, supervisor resolution |
| Scheduler & automation | 4 | Tick engine, seven jobs, idempotency, manual triggers |
| Dashboards | 3 | Admin and employee, filters, trend chart |
| Reports & exports | 4 | Six reports, Excel, PDF, CSV |
| Frontend — employee portal | 7 | Dashboard, tasks, SOD, EOD, attendance, leave, profile |
| Frontend — admin portal | 9 | Dashboard, employees, tasks, review, monitors, org chart, activity, reports, settings |
| Testing & hardening | 5 | Test suites, permission edge cases, error handling |
| Documentation & handover | 3 | These documents, README, deployment notes |
| **Total** | **79 days** | |

At a five-day week that is **roughly 16 working weeks for one developer**, or **8–9 weeks
with two** working in parallel across backend and frontend.

---

## Phase plan

### Phase 1 — Core system · 6–7 weeks

Login and authentication, both portals, employee management, task management, SOD, EOD,
task status and progress, notifications, basic reports.

*Delivers:* work can be assigned, tracked and reported end to end.

### Phase 2 — Operations · 4–5 weeks

Attendance, leave management, advanced reports, recurring tasks, task templates,
configurable role-based permissions, report export.

*Delivers:* the system replaces the manual HR and task-tracking work the brief describes.

### Additional scope — Hierarchy, activity, bidirectional SOD · 2 weeks

Organisational hierarchy with reporting-line access control, login/logout and session
monitoring, consent-gated location capture, manager-assigned and self-created SOD entries.

*Delivers:* access follows the real org structure, and SOD works in both directions.

### Phase 3 — Future scope · not built

Estimates only, for planning:

| Module | Estimate |
| --- | --- |
| Performance management (goals, reviews, ratings) | 3–4 weeks |
| Recruitment (openings, applicants, interviews) | 4–5 weeks |
| Employee onboarding workflows | 2–3 weeks |
| Payroll (salary structures, payslips, statutory) | 6–8 weeks |
| Advanced document management with e-sign | 2–3 weeks |
| WhatsApp / Telegram / Slack / Teams integration | 2–3 weeks |
| AI productivity insights | 3–4 weeks |
| Mobile app (React Native) | 6–8 weeks |

Payroll deserves a flag: it is the one item where statutory rules (PF, ESI, TDS, state
professional tax) change with regulation and jurisdiction. Estimate it separately once the
exact requirements are known, and consider integrating an existing payroll provider rather
than building it.

---

## Development cost

Rates vary widely; these are illustrative bands for 79 days of work.

| Engagement | Day rate | Total |
| --- | ---: | ---: |
| Freelance / small studio (India) | ₹6,000–10,000 | ₹4.7 – 7.9 lakh |
| Mid-size agency (India) | ₹12,000–18,000 | ₹9.5 – 14.2 lakh |
| Offshore team (Eastern Europe / SE Asia) | $250–400 | $19,750 – 31,600 |
| Onshore (US / Western Europe) | $600–1,000 | $47,400 – 79,000 |

Two things to hold in mind when comparing quotes:

**Infrastructure is not the cost.** Running this system costs ₹0/month at launch and under
₹6,000/month at a thousand employees. The cost is engineering time, which is one-off.

**Compare against per-seat SaaS.** At ₹150/user/month, 200 employees is ₹3.6 lakh a year,
every year. A built system has a higher first year and a much lower second — the crossover
is usually 18–30 months, and you keep the data and the ability to change it.

---

## Ongoing costs after launch

| Item | Monthly |
| --- | --- |
| Infrastructure (see doc 02) | ₹0 → ₹6,000 depending on scale |
| Maintenance: dependency updates, backups, monitoring | 4–6 hours |
| Support and small changes | Per agreement, typically 8–16 hours |

---

## Assumptions and risks

**Assumed**

- One timezone per company (configurable, but not per-employee multi-region payroll rules)
- Email as the only external channel at launch; chat platforms are Phase 3
- Under 1,000 employees at launch; the scaling path is in doc 01
- Location capture is optional and off unless the business asks for it

**Risks worth naming now**

| Risk | Mitigation |
| --- | --- |
| Scope growth in Phase 3, particularly payroll | Fix Phase 3 scope in writing before starting; estimate payroll separately |
| Adoption — SOD/EOD only works if people submit | Automation removes retyping; reminders and the missing-EOD escalation are built |
| Free-tier limits (cold starts, 0.5 GB database) | Documented triggers and a costed upgrade path in doc 02 |
| Privacy expectations around location | Off by default, consent-gated, minimised and auto-deleted; review the notice with HR |
| Single-instance scheduler | Documented and flag-controlled; advisory lock is the next step if needed |
