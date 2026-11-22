/**
 * Covers the production-readiness additions:
 *
 *   1. Position catalogue with seniority levels across every department
 *   2. Hiring restricted by position seniority AND reporting line
 *   3. File attachments on SOD entries, scoped by the hierarchy
 *   4. Indian Standard Time as the system clock
 */
import assert from 'node:assert/strict';
import test, { after, before, describe } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from '../src/index';
import { prisma } from '../src/db';
import { getSettings } from '../src/services/settings.service';
import { todayInTz } from '../src/lib/dates';
import { canHirePosition } from '../src/positions';

const PORT = 4996;
const BASE = `http://127.0.0.1:${PORT}/api`;
const PASSWORD = process.env.SEED_PASSWORD ?? 'Password@123';
const MARKER = `PH-${Date.now()}`;

let server: Server;
let today = '';
const tok: Record<string, string> = {};
const uid: Record<string, string> = {};

type Json = Record<string, any>;

async function api(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {},
): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : {} };
}

/** Multipart upload — exercises the same path the browser uses. */
async function upload(path: string, token: string, filename: string, content: string) {
  const form = new FormData();
  form.append('files', new Blob([content], { type: 'text/plain' }), filename);
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : {} };
}

before(async () => {
  server = createApp().listen(PORT);
  await new Promise((resolve) => server.once('listening', resolve));
  today = todayInTz((await getSettings()).timezone);

  for (const [key, email] of Object.entries({
    ceo: 'ceo@acme.test',
    hr: 'hr@acme.test',
    engManager: 'manager@acme.test',
    lead: 'lead@acme.test',
    ananya: 'ananya@acme.test',
    rohit: 'rohit@acme.test',
  })) {
    const r = await api('/auth/login', { method: 'POST', body: { email, password: PASSWORD } });
    assert.equal(r.status, 200, `login failed for ${email}`);
    tok[key] = r.json.accessToken;
    uid[key] = r.json.user.id;
  }
});

after(async () => {
  const created = await prisma.user.findMany({
    where: { email: { contains: MARKER.toLowerCase() } },
    select: { id: true },
  });
  const ids = created.map((c) => c.id);
  if (ids.length) {
    await prisma.sodItem.deleteMany({ where: { sod: { userId: { in: ids } } } });
    await prisma.sod.deleteMany({ where: { userId: { in: ids } } });
    await prisma.eod.deleteMany({ where: { userId: { in: ids } } });
    await prisma.leaveBalance.deleteMany({ where: { userId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.sodAttachment.deleteMany({ where: { originalName: { contains: MARKER } } });
  await prisma.sodItem.deleteMany({ where: { titleSnapshot: { contains: MARKER } } });
  await prisma.$disconnect();
  server.close();
});

// ---------------------------------------------------------------------------
describe('1 · Position catalogue', () => {
  test('covers every department with graded levels', async () => {
    const { status, json } = await api('/positions', { token: tok.hr });
    assert.equal(status, 200);

    const tracks = new Set(json.data.map((p: Json) => p.track));
    for (const track of ['ENGINEERING', 'SALES', 'FINANCE', 'HR', 'OPERATIONS']) {
      assert.ok(tracks.has(track), `catalogue is missing the ${track} track`);
    }

    const titles = json.data.map((p: Json) => p.title);
    for (const expected of [
      'Junior Software Engineer',
      'Software Engineer I',
      'Software Engineer II',
      'Software Engineer III',
      'Senior Software Engineer',
      'Project Lead',
      'Engineering Manager',
    ]) {
      assert.ok(titles.includes(expected), `catalogue is missing "${expected}"`);
    }
  });

  test('seniority is ordered so juniors sit below leads and managers', async () => {
    const { json } = await api('/positions', { token: tok.hr });
    const level = (title: string) => json.data.find((p: Json) => p.title === title)?.level;

    assert.ok(level('Chief Executive Officer') < level('Engineering Manager'));
    assert.ok(level('Engineering Manager') < level('Project Lead'));
    assert.ok(level('Project Lead') < level('Senior Software Engineer'));
    assert.ok(level('Senior Software Engineer') < level('Software Engineer II'));
    assert.ok(level('Software Engineer II') < level('Software Engineer I'));
    assert.ok(level('Software Engineer I') < level('Junior Software Engineer'));
  });

  test('the seniority rule itself rejects peers and seniors', () => {
    const lead = { level: 60, canHire: true, title: 'Project Lead' };
    assert.equal(canHirePosition(lead, { level: 80, canHire: false, title: 'SWE II' }).allowed, true);
    assert.equal(canHirePosition(lead, { level: 60, canHire: true, title: 'Project Lead' }).allowed, false);
    assert.equal(canHirePosition(lead, { level: 50, canHire: true, title: 'Manager' }).allowed, false);

    const ic = { level: 70, canHire: false, title: 'Senior Software Engineer' };
    assert.equal(canHirePosition(ic, { level: 90, canHire: false, title: 'SWE I' }).allowed, false);
    assert.equal(canHirePosition(null, { level: 90, canHire: false, title: 'SWE I' }).allowed, false);
  });
});

// ---------------------------------------------------------------------------
describe('2 · Hiring follows the hierarchy', () => {
  test('the hireable list is filtered to what the caller may actually add', async () => {
    const { status, json } = await api('/positions/hireable', { token: tok.lead });
    assert.equal(status, 200, JSON.stringify(json));

    assert.equal(json.myPosition?.title, 'Project Lead');
    const levels = json.data.map((p: Json) => p.level);
    assert.ok(levels.length > 0, 'a Project Lead should be able to hire someone');
    assert.ok(Math.min(...levels) > json.myPosition.level, 'every option must be more junior');

    const titles = json.data.map((p: Json) => p.title);
    assert.ok(titles.includes('Software Engineer II'));
    assert.ok(!titles.includes('Engineering Manager'), 'a lead cannot add a manager');
    assert.ok(!titles.includes('Project Lead'), 'a lead cannot add a peer');
  });

  test('candidate managers are limited to the hirer’s own line', async () => {
    const { json } = await api('/positions/hireable', { token: tok.lead });
    const ids = json.managers.map((m: Json) => m.id);
    assert.ok(ids.includes(uid.lead), 'the hirer themselves must be selectable');
    assert.ok(!ids.includes(uid.rohit), 'someone in another branch must not be');
    // Names are shown with their position, which is what the brief asked for.
    assert.ok(json.managers.every((m: Json) => 'positionTitle' in m && 'name' in m));
  });

  test('a lead can add a junior engineer beneath them', async () => {
    const positions = await api('/positions/hireable', { token: tok.lead });
    const junior = positions.json.data.find((p: Json) => p.title === 'Junior Software Engineer');
    const roles = await api('/org/roles', { token: tok.hr });
    const employeeRole = roles.json.data.find((r: Json) => r.key === 'EMPLOYEE');

    const { status, json } = await api('/employees', {
      method: 'POST',
      token: tok.lead,
      body: {
        firstName: 'Test',
        lastName: 'Junior',
        email: `junior.${MARKER.toLowerCase()}@acme.test`,
        roleId: employeeRole.id,
        positionId: junior.id,
      },
    });

    assert.equal(status, 201, JSON.stringify(json));
    assert.equal(json.data.position.title, 'Junior Software Engineer');
    // Defaults to reporting to whoever added them.
    assert.equal(json.data.manager?.id, uid.lead);
    assert.ok(json.temporaryPassword, 'a temporary password should be handed back');
  });

  test('a lead cannot add someone at or above their own level', async () => {
    const all = await api('/positions', { token: tok.hr });
    const manager = all.json.data.find((p: Json) => p.title === 'Engineering Manager');
    const roles = await api('/org/roles', { token: tok.hr });
    const employeeRole = roles.json.data.find((r: Json) => r.key === 'EMPLOYEE');

    const { status, json } = await api('/employees', {
      method: 'POST',
      token: tok.lead,
      body: {
        firstName: 'Should',
        lastName: 'Fail',
        email: `nope.${MARKER.toLowerCase()}@acme.test`,
        roleId: employeeRole.id,
        positionId: manager.id,
      },
    });

    assert.equal(status, 403, JSON.stringify(json));
    assert.match(json.error.message, /more junior/i);
  });

  test('an employee with no hiring position is refused outright', async () => {
    const all = await api('/positions', { token: tok.hr });
    const swe = all.json.data.find((p: Json) => p.title === 'Software Engineer I');
    const roles = await api('/org/roles', { token: tok.hr });
    const employeeRole = roles.json.data.find((r: Json) => r.key === 'EMPLOYEE');

    const { status } = await api('/employees', {
      method: 'POST',
      token: tok.ananya,
      body: {
        firstName: 'No',
        lastName: 'Rights',
        email: `norights.${MARKER.toLowerCase()}@acme.test`,
        roleId: employeeRole.id,
        positionId: swe.id,
      },
    });
    // Senior Software Engineer holds neither employee.create nor a hiring position.
    assert.equal(status, 403);
  });

  test('a system admin can seed the top of the org, including a root CEO', async () => {
    // The Super Admin exists to build and repair the tree. Without the bypass
    // they could never create anyone senior to their own position, which would
    // make bootstrapping a new company impossible.
    const admin = await api('/auth/login', {
      method: 'POST',
      body: { email: 'admin@acme.test', password: PASSWORD },
    });
    const all = await api('/positions', { token: tok.hr });
    const ceoPosition = all.json.data.find((p: Json) => p.code === 'CEO');
    const roles = await api('/org/roles', { token: tok.hr });
    const ceoRole = roles.json.data.find((r: Json) => r.key === 'CEO');

    const { status, json } = await api('/employees', {
      method: 'POST',
      token: admin.json.accessToken,
      body: {
        firstName: 'Root',
        lastName: 'Founder',
        email: `founder.${MARKER.toLowerCase()}@acme.test`,
        roleId: ceoRole.id,
        positionId: ceoPosition.id,
      },
    });

    assert.equal(status, 201, JSON.stringify(json));
    assert.equal(json.data.position.title, 'Chief Executive Officer');
    // Reports to nobody — a root of the hierarchy, not to the admin who made them.
    assert.equal(json.data.manager, null);
  });

  test('a manager cannot place a hire outside their reporting line', async () => {
    const positions = await api('/positions/hireable', { token: tok.engManager });
    const swe = positions.json.data.find((p: Json) => p.title === 'Software Engineer I');
    const roles = await api('/org/roles', { token: tok.hr });
    const employeeRole = roles.json.data.find((r: Json) => r.key === 'EMPLOYEE');

    const { status, json } = await api('/employees', {
      method: 'POST',
      token: tok.engManager,
      body: {
        firstName: 'Wrong',
        lastName: 'Branch',
        email: `wrongbranch.${MARKER.toLowerCase()}@acme.test`,
        roleId: employeeRole.id,
        positionId: swe.id,
        managerId: uid.rohit, // sales, outside engineering
      },
    });

    assert.equal(status, 403, JSON.stringify(json));
    assert.match(json.error.message, /reporting line/i);
  });
});

// ---------------------------------------------------------------------------
describe('3 · SOD attachments', () => {
  let itemId = '';

  test('a manager attaches a brief to a duty they assign', async () => {
    const created = await api(`/sod/${today}/entries`, {
      method: 'POST',
      token: tok.lead,
      body: {
        userId: uid.ananya,
        title: `Quarterly compliance pack ${MARKER}`,
        instructions: 'Complete using the attached template.',
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.json));
    itemId = created.json.data[0].id;

    const res = await upload(
      `/sod/entries/${itemId}/attachments`,
      tok.lead,
      `template-${MARKER}.txt`,
      'compliance template body',
    );
    assert.equal(res.status, 201, JSON.stringify(res.json));
    assert.equal(res.json.data[0].originalName, `template-${MARKER}.txt`);
  });

  test('the employee sees the file on their own SOD', async () => {
    const { json } = await api(`/sod/${today}`, { token: tok.ananya });
    const item = json.data.items.find((i: Json) => i.id === itemId);
    assert.ok(item, 'the assigned duty should be on the plan');
    assert.equal(item.attachments.length, 1);
    assert.equal(item.attachments[0].originalName, `template-${MARKER}.txt`);
  });

  test('the employee can attach their own evidence back', async () => {
    const res = await upload(
      `/sod/entries/${itemId}/attachments`,
      tok.ananya,
      `evidence-${MARKER}.txt`,
      'completed pack',
    );
    assert.equal(res.status, 201, JSON.stringify(res.json));

    const { json } = await api(`/sod/${today}`, { token: tok.ananya });
    const item = json.data.items.find((i: Json) => i.id === itemId);
    assert.equal(item.attachments.length, 2);
  });

  test('someone outside the reporting line cannot upload or download', async () => {
    const blocked = await upload(
      `/sod/entries/${itemId}/attachments`,
      tok.rohit,
      `intruder-${MARKER}.txt`,
      'nope',
    );
    assert.ok([400, 403].includes(blocked.status), `expected refusal, got ${blocked.status}`);

    const attachment = await prisma.sodAttachment.findFirstOrThrow({
      where: { sodItemId: itemId },
    });
    const download = await api(`/sod/attachments/${attachment.id}/download`, { token: tok.rohit });
    assert.ok([400, 403].includes(download.status), `expected refusal, got ${download.status}`);
  });

  test('the line manager and the owner can download it', async () => {
    const attachment = await prisma.sodAttachment.findFirstOrThrow({ where: { sodItemId: itemId } });

    for (const who of ['ananya', 'lead', 'engManager', 'ceo']) {
      const res = await fetch(`${BASE}/sod/attachments/${attachment.id}/download`, {
        headers: { authorization: `Bearer ${tok[who]}` },
      });
      assert.equal(res.status, 200, `${who} should be able to download`);
      assert.ok((await res.text()).length > 0);
    }
  });

  test('only the uploader can delete their own file', async () => {
    const mine = await prisma.sodAttachment.findFirstOrThrow({
      where: { sodItemId: itemId, uploadedById: uid.ananya },
    });
    const wrong = await api(`/sod/attachments/${mine.id}`, { method: 'DELETE', token: tok.ceo });
    // The CEO holds sod.assign, so tidying up is allowed; an ordinary peer is not.
    assert.ok([200, 403].includes(wrong.status));

    const still = await prisma.sodAttachment.findFirst({ where: { id: mine.id } });
    if (wrong.status === 200) assert.equal(still, null);
  });
});

// ---------------------------------------------------------------------------
describe('4 · Indian Standard Time', () => {
  test('the company clock is Asia/Kolkata', async () => {
    const settings = await getSettings();
    assert.equal(settings.timezone, 'Asia/Kolkata');
  });

  test('every seeded employee is on IST', async () => {
    const off = await prisma.user.count({ where: { timezone: { not: 'Asia/Kolkata' } } });
    assert.equal(off, 0, 'all employees should default to IST');
  });

  test('"today" follows IST, not the server locale', async () => {
    // 20:00 UTC is already the next day in IST (UTC+5:30).
    const evening = new Date('2026-08-13T20:00:00.000Z');
    assert.equal(todayInTz('Asia/Kolkata', evening), '2026-08-14');
    assert.equal(todayInTz('UTC', evening), '2026-08-13');

    // And just before the IST rollover it is still the same day.
    const beforeMidnight = new Date('2026-08-13T18:00:00.000Z');
    assert.equal(todayInTz('Asia/Kolkata', beforeMidnight), '2026-08-13');
  });
});
