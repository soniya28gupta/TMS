/**
 * Covers the three additions to the brief:
 *
 *   1. CEO → Manager → Employee hierarchy, with managers confined to their line
 *   2. Login/logout session tracking and consent-gated location capture
 *   3. Bidirectional SOD — manager-assigned duties and employee self-entries
 */
process.env.SCHEDULER_ENABLED = 'false';
process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import test, { after, before, describe } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from '../src/index';
import { prisma } from '../src/db';
import { todayInTz } from '../src/lib/dates';
import { getSettings, updateSettings } from '../src/services/settings.service';
import { subtreeUserIds, isInReportingLine } from '../src/services/hierarchy.service';

const PORT = 4998;
const BASE = `http://127.0.0.1:${PORT}/api`;
const PASSWORD = process.env.SEED_PASSWORD ?? 'Password@123';
const MARKER = `HAS-${Date.now()}`;

let server: Server;
let today = '';
const tokens: Record<string, string> = {};
const ids: Record<string, string> = {};
let originalSettings: { locationTrackingEnabled: boolean; locationPrecision: string };

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

async function login(email: string, body: Record<string, unknown> = {}) {
  const res = await api('/auth/login', { method: 'POST', body: { email, password: PASSWORD, ...body } });
  assert.equal(res.status, 200, `login failed for ${email}: ${JSON.stringify(res.json)}`);
  return res.json;
}

before(async () => {
  server = createApp().listen(PORT);
  await new Promise((resolve) => server.once('listening', resolve));

  const settings = await getSettings();
  today = todayInTz(settings.timezone);
  originalSettings = {
    locationTrackingEnabled: settings.locationTrackingEnabled,
    locationPrecision: settings.locationPrecision,
  };

  for (const [key, email] of Object.entries({
    ceo: 'ceo@acme.test',
    engManager: 'manager@acme.test',
    salesManager: 'sales.manager@acme.test',
    lead: 'lead@acme.test',
    ananya: 'ananya@acme.test',
    rohit: 'rohit@acme.test',
  })) {
    const session = await login(email);
    tokens[key] = session.accessToken;
    ids[key] = session.user.id;
  }
});

after(async () => {
  await prisma.sodItem.deleteMany({ where: { titleSnapshot: { contains: MARKER } } });
  await updateSettings(originalSettings);
  await prisma.$disconnect();
  server.close();
});

// ---------------------------------------------------------------------------
describe('1 · Organisational hierarchy and reporting-line access', () => {
  test('the reporting chain is CEO → Manager → Employee', async () => {
    const { status, json } = await api(`/employees/${ids.ananya}/reporting-line`, {
      token: tokens.ananya,
    });
    assert.equal(status, 200, JSON.stringify(json));

    const roles = json.chain.map((m: Json) => m.role.key);
    assert.deepEqual(roles, ['CEO', 'MANAGER', 'TEAM_LEAD'], `unexpected chain: ${roles}`);
  });

  test('a subtree contains the whole line beneath a manager', async () => {
    const subtree = await subtreeUserIds(ids.engManager);
    assert.ok(subtree.includes(ids.engManager), 'the manager is part of their own subtree');
    assert.ok(subtree.includes(ids.lead), 'the team lead reports into engineering');
    assert.ok(subtree.includes(ids.ananya), 'indirect reports are included');
    assert.ok(!subtree.includes(ids.rohit), 'sales must not appear under engineering');
  });

  test('the CEO subtree covers every operating employee', async () => {
    const subtree = await subtreeUserIds(ids.ceo);
    for (const key of ['engManager', 'salesManager', 'lead', 'ananya', 'rohit']) {
      assert.ok(subtree.includes(ids[key]), `CEO should see ${key}`);
    }
  });

  test('a manager cannot open an employee outside their line', async () => {
    const inside = await api(`/employees/${ids.ananya}`, { token: tokens.engManager });
    assert.equal(inside.status, 200, 'own line must be visible');

    const outside = await api(`/employees/${ids.rohit}`, { token: tokens.engManager });
    assert.equal(outside.status, 403, 'the sales employee is outside engineering');
  });

  test('a manager cannot assign a task outside their line', async () => {
    const { status, json } = await api('/tasks', {
      method: 'POST',
      token: tokens.engManager,
      body: { title: `Cross-line assignment ${MARKER}`, assigneeId: ids.rohit },
    });
    assert.equal(status, 403, JSON.stringify(json));
  });

  test('the CEO sees everyone; a manager sees only their branch', async () => {
    const ceoView = await api('/employees?pageSize=100', { token: tokens.ceo });
    const managerView = await api('/employees?pageSize=100', { token: tokens.engManager });
    assert.equal(ceoView.status, 200);
    assert.equal(managerView.status, 200);
    assert.ok(
      ceoView.json.meta.total > managerView.json.meta.total,
      'the CEO must see strictly more people than one manager',
    );

    const managerIds = managerView.json.data.map((u: Json) => u.id);
    assert.ok(!managerIds.includes(ids.rohit), 'sales must not leak into the engineering list');
  });

  test('the org chart is scoped to the caller', async () => {
    const ceo = await api('/employees/org-chart', { token: tokens.ceo });
    assert.equal(ceo.status, 200, JSON.stringify(ceo.json));
    assert.ok(ceo.json.data.length >= 1);

    const root = ceo.json.data.find((node: Json) => node.roleKey === 'CEO');
    assert.ok(root, 'the CEO should be a root of the chart');
    assert.ok(root.totalReports >= 5, `expected a populated tree, got ${root.totalReports}`);

    const manager = await api('/employees/org-chart', { token: tokens.engManager });
    assert.equal(manager.status, 200);
    const names = JSON.stringify(manager.json.data);
    assert.ok(!names.includes(ids.rohit), 'a manager chart must not include another branch');
  });

  test('reporting loops are rejected', async () => {
    // Making the CEO report to their own subordinate would create a cycle.
    const { status, json } = await api(`/employees/${ids.ceo}/manager`, {
      method: 'POST',
      token: tokens.ceo,
      body: { managerId: ids.ananya },
    });
    assert.equal(status, 409, JSON.stringify(json));
    assert.ok(await isInReportingLine(ids.ceo, ids.ananya), 'hierarchy must be unchanged');
  });
});

// ---------------------------------------------------------------------------
describe('2 · Sessions, activity tracking and location', () => {
  test('logging in creates a session with device details', async () => {
    const session = await login('ananya@acme.test');
    assert.ok(session.sessionId, 'login should return a session id');

    const { status, json } = await api('/auth/sessions', { token: session.accessToken });
    assert.equal(status, 200);
    const current = json.data.find((s: Json) => s.id === session.sessionId);
    assert.ok(current, 'the new session should appear in the employee history');
    assert.equal(current.isActive, true);
    assert.ok(current.device, 'device should be recorded');
    assert.equal(current.isCurrent, true);
  });

  test('logging out ends the session and its access token stops working', async () => {
    const session = await login('karan@acme.test');
    const token = session.accessToken;

    assert.equal((await api('/dashboard/me', { token })).status, 200);
    assert.equal((await api('/auth/logout', { method: 'POST', token })).status, 200);

    const after = await api('/dashboard/me', { token });
    assert.equal(after.status, 401, 'a signed-out session must be rejected immediately');

    const record = await prisma.userSession.findUniqueOrThrow({ where: { id: session.sessionId } });
    assert.equal(record.isActive, false);
    assert.equal(record.endedReason, 'LOGOUT');
    assert.ok(record.logoutAt);
  });

  test('a manager can monitor sessions in their line but not outside it', async () => {
    const inLine = await api(`/sessions?userId=${ids.ananya}`, { token: tokens.engManager });
    assert.equal(inLine.status, 200, JSON.stringify(inLine.json));

    const outside = await api(`/sessions?userId=${ids.rohit}`, { token: tokens.engManager });
    assert.equal(outside.status, 403);
  });

  test('an employee cannot read another employee’s sessions', async () => {
    const { status } = await api(`/sessions?userId=${ids.rohit}`, { token: tokens.ananya });
    assert.equal(status, 403);
  });

  test('location is not stored without company tracking enabled', async () => {
    await updateSettings({ locationTrackingEnabled: false });
    await prisma.attendance.deleteMany({ where: { userId: ids.ananya, date: today } });

    const { status, json } = await api('/attendance/check-in', {
      method: 'POST',
      token: tokens.ananya,
      body: { position: { latitude: 19.076, longitude: 72.8777, accuracy: 12 } },
    });
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.locationCaptured, false, 'tracking is off — nothing may be stored');
    assert.equal(json.data.checkInLatitude, null);
  });

  test('location is not stored without employee consent', async () => {
    await updateSettings({ locationTrackingEnabled: true });
    await prisma.user.update({
      where: { id: ids.ananya },
      data: { locationConsentAt: null, locationConsentVersion: null },
    });
    await prisma.attendance.deleteMany({ where: { userId: ids.ananya, date: today } });

    const { json } = await api('/attendance/check-in', {
      method: 'POST',
      token: tokens.ananya,
      body: { position: { latitude: 19.076, longitude: 72.8777 } },
    });
    assert.equal(json.locationCaptured, false, 'no consent — no coordinates');
  });

  test('with consent the position is captured and rounded when APPROXIMATE', async () => {
    await updateSettings({ locationTrackingEnabled: true, locationPrecision: 'APPROXIMATE' });

    const consent = await api('/auth/privacy/consent', {
      method: 'POST',
      token: tokens.ananya,
      body: { accepted: true },
    });
    assert.equal(consent.status, 200);
    assert.equal(consent.json.consentGiven, true);

    await prisma.attendance.deleteMany({ where: { userId: ids.ananya, date: today } });
    const { json } = await api('/attendance/check-in', {
      method: 'POST',
      token: tokens.ananya,
      body: { position: { latitude: 19.0765432, longitude: 72.8777123, accuracy: 14 } },
    });

    assert.equal(json.locationCaptured, true, JSON.stringify(json));
    assert.equal(json.data.checkInLatitude, 19.08, 'APPROXIMATE should round to ~1km');
    assert.equal(json.data.checkInLongitude, 72.88);
    assert.equal(json.data.locationConsent, true);
  });

  test('withdrawing consent erases the coordinates already held', async () => {
    const before = await prisma.attendance.findUniqueOrThrow({
      where: { userId_date: { userId: ids.ananya, date: today } },
    });
    assert.notEqual(before.checkInLatitude, null, 'precondition: a position is stored');

    const res = await api('/auth/privacy/consent', {
      method: 'POST',
      token: tokens.ananya,
      body: { accepted: false },
    });
    assert.equal(res.status, 200);

    const wiped = await prisma.attendance.findUniqueOrThrow({
      where: { userId_date: { userId: ids.ananya, date: today } },
    });
    assert.equal(wiped.checkInLatitude, null, 'withdrawal must erase stored coordinates');
    assert.equal(wiped.checkInLongitude, null);
  });

  test('an employee without location rights gets coordinates redacted', async () => {
    await updateSettings({ locationTrackingEnabled: true });
    await api('/auth/privacy/consent', { method: 'POST', token: tokens.rohit, body: { accepted: true } });
    await prisma.attendance.deleteMany({ where: { userId: ids.rohit, date: today } });
    await api('/attendance/check-in', {
      method: 'POST',
      token: tokens.rohit,
      body: { position: { latitude: 12.97, longitude: 77.59 } },
    });

    // The sales manager holds location.read.reports over Rohit.
    const manager = await api(`/attendance?userId=${ids.rohit}&from=${today}&to=${today}`, {
      token: tokens.salesManager,
    });
    assert.equal(manager.status, 200, JSON.stringify(manager.json));
    assert.notEqual(manager.json.data[0].checkInLatitude, null, 'the line manager may see it');

    // The team lead has no location permission at all.
    const lead = await api(`/attendance?from=${today}&to=${today}`, { token: tokens.lead });
    assert.equal(lead.status, 200);
    for (const row of lead.json.data) {
      if (row.userId !== ids.lead) {
        assert.equal(row.checkInLatitude, null, 'coordinates must be redacted');
      }
    }
  });
});

// ---------------------------------------------------------------------------
describe('3 · Bidirectional SOD', () => {
  test('an employee can create their own SOD entry', async () => {
    const { status, json } = await api(`/sod/${today}/entries`, {
      method: 'POST',
      token: tokens.ananya,
      body: { title: `Self study session ${MARKER}`, plannedHours: 1 },
    });
    assert.equal(status, 201, JSON.stringify(json));
    assert.equal(json.data[0].source, 'SELF');
    assert.equal(json.data[0].assignedById, null);
    assert.equal(json.data[0].isAcknowledged, true);
  });

  test('a manager can assign a SOD duty to an employee in their line', async () => {
    const { status, json } = await api(`/sod/${today}/entries`, {
      method: 'POST',
      token: tokens.lead,
      body: {
        userId: ids.ananya,
        title: `Run the release checklist ${MARKER}`,
        instructions: 'Cover staging and production.',
        priority: 'HIGH',
        plannedHours: 2,
      },
    });
    assert.equal(status, 201, JSON.stringify(json));

    const item = json.data[0];
    assert.equal(item.source, 'ASSIGNED');
    assert.equal(item.assignedById, ids.lead);
    assert.equal(item.instructions, 'Cover staging and production.');
    assert.equal(item.isAcknowledged, false, 'assigned work needs acknowledgement');

    const sod = await api(`/sod/${today}`, { token: tokens.ananya });
    const titles = sod.json.data.items.map((i: Json) => i.titleSnapshot);
    assert.ok(titles.some((t: string) => t.includes('Run the release checklist')));
  });

  test('the employee is notified of an assigned duty', async () => {
    const notification = await prisma.notification.findFirst({
      where: { userId: ids.ananya, title: { contains: 'Run the release checklist' } },
    });
    assert.ok(notification, 'assigning a duty should notify the employee');
  });

  test('a manager cannot assign SOD outside their reporting line', async () => {
    const { status } = await api(`/sod/${today}/entries`, {
      method: 'POST',
      token: tokens.lead,
      body: { userId: ids.rohit, title: `Out of line ${MARKER}` },
    });
    assert.equal(status, 403);
  });

  test('an employee cannot assign SOD to someone else', async () => {
    const { status } = await api(`/sod/${today}/entries`, {
      method: 'POST',
      token: tokens.ananya,
      body: { userId: ids.rohit, title: `Not allowed ${MARKER}` },
    });
    assert.equal(status, 403);
  });

  test('one duty can be assigned to several employees at once', async () => {
    const { status, json } = await api(`/sod/${today}/entries`, {
      method: 'POST',
      token: tokens.lead,
      body: {
        userIds: [ids.ananya, ids.lead],
        title: `Team sync prep ${MARKER}`,
        priority: 'LOW',
      },
    });
    assert.equal(status, 201, JSON.stringify(json));
    assert.equal(json.count, 2);
  });

  test('the employee can progress an assigned duty', async () => {
    const item = await prisma.sodItem.findFirstOrThrow({
      where: { titleSnapshot: { contains: 'Run the release checklist' } },
    });

    const { status, json } = await api(`/sod/entries/${item.id}`, {
      method: 'PATCH',
      token: tokens.ananya,
      body: { status: 'DONE', plannedOutcome: 'Checklist completed on both environments.' },
    });
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.data.status, 'DONE');
    assert.ok(json.data.completedAt);
  });

  test('an employee cannot reword a duty someone else assigned', async () => {
    const item = await prisma.sodItem.findFirstOrThrow({
      where: { titleSnapshot: { contains: 'Run the release checklist' } },
    });
    const { status } = await api(`/sod/entries/${item.id}`, {
      method: 'PATCH',
      token: tokens.ananya,
      body: { title: 'Something else entirely' },
    });
    assert.equal(status, 400);
  });

  test('task-generated entries cannot be deleted from the plan', async () => {
    const auto = await prisma.sodItem.findFirst({
      where: { sod: { userId: ids.ananya, date: today }, source: 'AUTO_TASK' },
    });
    if (!auto) return; // no open tasks today — nothing to assert

    const { status, json } = await api(`/sod/entries/${auto.id}`, {
      method: 'DELETE',
      token: tokens.ananya,
    });
    assert.equal(status, 400, JSON.stringify(json));
  });

  test('an employee can remove an entry they created themselves', async () => {
    const own = await prisma.sodItem.findFirstOrThrow({
      where: { titleSnapshot: { contains: 'Self study session' }, source: 'SELF' },
    });
    const { status } = await api(`/sod/entries/${own.id}`, { method: 'DELETE', token: tokens.ananya });
    assert.equal(status, 200);
  });
});
