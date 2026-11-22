# 7 · Security, Privacy & Backups

---

## Authentication

| Control | Implementation |
| --- | --- |
| Password storage | bcrypt, cost 10. Plain text never stored or logged. |
| Password policy | Minimum 8 characters with upper, lower and a digit, enforced on every write. |
| Access token | JWT, 30-minute lifetime, carries user, role, portal and session id. |
| Refresh token | 48 random bytes, stored only as a SHA-256 hash, rotated on every use. |
| Token reuse | A refresh token is single-use; presenting a rotated one fails. |
| Brute force | Login limited to 20 attempts per 10 minutes per IP. |
| Account enumeration | Unknown email and wrong password return the identical 401. |
| Temporary passwords | Flagged `mustChangePassword`; the UI nags until changed. |
| Password change | Ends every session and revokes every refresh token. |
| Deactivation | Ends sessions immediately; the next request fails. |

---

## Session tracking and remote sign-out

Each sign-in creates a `UserSession` recording login time, last-seen, IP, device, browser
and OS. Refresh rotation keeps the same session id, so "logged in since" reflects the
actual sign-in rather than the last token refresh.

The auth middleware checks session liveness on every request. That is what makes remote
sign-out immediate — without it, a revoked session would keep working until its 30-minute
access token expired.

- Employees see their own sessions in **Profile** and can sign out any device.
- Managers and HR see sessions within their scope under **Login activity**.
- `session.revoke` is required to end someone else's session, and the target must be in
  scope. Every revocation is written to the audit log.
- Sessions idle beyond `sessionIdleTimeoutMinutes` (default 12 h) are closed nightly, so a
  closed laptop does not show as "online" forever.

---

## Location capture — privacy by default

The brief asks for geolocation at check-in and check-out. Location data is unusually
sensitive, so the design starts from "collect nothing" and requires explicit steps to
collect anything.

### Three gates, all of which must pass

1. **Company switch** — `locationTrackingEnabled` is **off** by default. While off, no
   coordinate is stored for anyone, regardless of what a client sends.
2. **Employee consent** — the employee must accept the current privacy notice. Consent is
   versioned; changing the notice invalidates prior acceptance and re-asks.
3. **A real fix** — the browser must return a valid position. Denied permission, no GPS or
   a timeout all mean no location, and **attendance still succeeds**. Location is an
   enrichment, never a precondition for marking a day.

`(0,0)` is rejected as a failed fix rather than stored as the Atlantic Ocean.

### What is captured, and when

Only at three discrete events: **check-in**, **check-out**, and **sign-in**. There is no
background sampling and no tracking between events. The client only asks the browser for a
position when tracking is on and consent exists, so employees are not prompted pointlessly.

### Minimisation

`locationPrecision` defaults to `APPROXIMATE`, which rounds to two decimal places — about
1 km. That answers "were they at the office or working remotely" without recording which
building someone was in. `EXACT` is available where a business case justifies it.

An optional office geofence (`officeLatitude`, `officeLongitude`, `officeRadiusMeters`)
stores distance and an inside/outside flag. Where that flag is enough, reviewers never
need the coordinates at all.

### Access

| Who | Sees |
| --- | --- |
| The employee | Their own coordinates, always |
| Their reporting line | Coordinates, with `location.read.reports` |
| HR Admin / Super Admin | Coordinates, with `location.read.all` |
| Everyone else | Coordinates stripped; the captured/geofence flags remain |

Redaction happens server-side before the response is built, so coordinates never reach a
client that should not have them.

### Retention and withdrawal

- Coordinates older than `locationRetentionDays` (default 90) are wiped nightly, while the
  attendance record itself is kept.
- Closed sessions older than `sessionRetentionDays` (default 180) are deleted.
- **Withdrawing consent erases immediately** — all stored check-in/out coordinates and all
  session coordinates for that employee are deleted on the spot. Consent is the only basis
  this system claims for holding the data, so removing consent removes the data.
- Consent given and withdrawn are both written to the audit log with the notice version.

### Compliance posture

This maps onto the principles common to GDPR and India's DPDP Act: a lawful basis
(explicit, informed, revocable consent), purpose limitation (attendance verification
only), data minimisation (approximate by default, three events only), storage limitation
(automatic retention windows), access control (reporting line and HR only), and the rights
to access and erase (visible in Profile; withdrawal erases).

Two things to complete before going live with tracking enabled:

1. Have the privacy notice text reviewed by whoever handles HR policy — the built-in text
   is a clear starting point, not legal advice.
2. Decide the retention window with that same person. 90 days is a reasonable default, not
   a researched one.

---

## Authorisation

Covered in detail in [05-permission-matrix.md](05-permission-matrix.md). The security
properties worth repeating:

- Every route resolves permissions server-side. UI hiding is convenience only.
- Scope filters the database query, so out-of-scope rows are never loaded and never appear
  in counts or aggregates.
- By-id routes call `assertCanTouchUser`, so guessing an id gains nothing.
- Managers are bounded by the reporting hierarchy, not by department membership.

---

## Application security

| Risk | Mitigation |
| --- | --- |
| SQL injection | Prisma parameterises everything; no string-built SQL. |
| XSS | React escapes by default; no `dangerouslySetInnerHTML` anywhere. |
| CSRF | Bearer tokens in headers, not ambient cookies; CORS is an explicit allow-list. |
| Clickjacking, MIME sniffing | `helmet` security headers. |
| Path traversal | Upload keys resolved and verified to stay inside the storage root. |
| Malicious uploads | MIME allow-list, 10 MB cap, max 5 files, randomised stored filenames. |
| Unauthenticated file access | Downloads go through the API, which re-checks permissions. |
| Mass assignment | Zod schemas whitelist fields; unknown keys are dropped. |
| Rate abuse | 300 requests/min per IP globally, 20 logins/10 min. |
| Information leak in errors | Internal errors return a generic message; details stay in server logs. |
| Secret leakage | Production refuses to boot with development JWT secrets. |

---

## Audit trail

`AuditLog` records actor, action, entity, id, metadata, IP and timestamp for security- and
compliance-relevant events: sign-in and sign-out, password changes and resets, employee
create/update/status, reporting-line changes, task create/update/review/reassign/cancel,
leave decisions, attendance edits, role and settings changes, session revocation, and
consent given or withdrawn.

Task history additionally lives in `TaskActivity`, which is what the task timeline renders.

Audit writes never fail the request that triggered them — a failure is logged and
swallowed, because losing an audit line is better than losing the user's work.

---

## Backups

**Development** — SQLite is a single file; copy `server/prisma/dev.db`.

**Production** — a scheduled GitHub Action (free) runs nightly:

```bash
pg_dump "$DATABASE_URL" --no-owner --format=custom \
  | gzip > "backup-$(date +%F).dump.gz"
# upload to Cloudflare R2, 30-day retention
```

| Property | Value |
| --- | --- |
| Frequency | Nightly, plus before every migration |
| Retention | 30 daily, 12 monthly |
| Location | Object storage in a different provider from the database |
| Encryption | At rest by the provider; the dump can be `age`-encrypted before upload |
| Restore target | Under 1 hour |
| Restore test | Quarterly, into a scratch database |

Uploaded files are backed up by object-storage versioning once storage moves off local
disk. On local disk, include `server/storage/` in the same nightly job.

**Test the restore.** An untested backup is a hope, not a backup. The quarterly drill is
the only way to know the dump is complete and the procedure works.

---

## Hardening checklist before go-live

- [ ] `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` set to fresh random values
- [ ] `CORS_ORIGINS` restricted to the real frontend origin
- [ ] Every seeded demo account removed or its password changed
- [ ] HTTPS enforced (automatic on the recommended hosts)
- [ ] Nightly backup job running, and one restore tested
- [ ] Error monitoring connected
- [ ] Privacy notice reviewed; retention window agreed with HR
- [ ] Location tracking left off unless there is a stated business need
- [ ] Role permissions reviewed against the actual org chart
- [ ] `SCHEDULER_ENABLED=true` on exactly one instance
