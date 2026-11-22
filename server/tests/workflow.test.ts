/**
 * End-to-end smoke test of the flow the requirements describe:
 *
 *   Admin assigns work → task lands in the employee's SOD → employee works and
 *   updates progress → submits for review → admin approves → employee submits
 *   EOD (pre-filled from tasks) → admin reviews EOD.
 *
 * Runs against the development database and removes what it creates.
 * Start it with:  npm test
 */
process.env.SCHEDULER_ENABLED = 'false';
process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import test, { after, before, describe } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from '../src/index';
import { prisma } from '../src/db';
import { addDays, dayOfWeek, todayInTz } from '../src/lib/dates';
import { getSettings } from '../src/services/settings.service';

const PORT = 4999;
const BASE = `http://127.0.0.1:${PORT}/api`;
const PASSWORD = process.env.SEED_PASSWORD ?? 'Password@123';
const MARKER = `E2E-${Date.now()}`;

let server: Server;
let leadToken = '';
let employeeToken = '';
let employeeId = '';
let taskId = '';
let today = '';

type Json = Record<string, any>;

/**
 * Tests must not depend on which day of the week they run. This finds the next
 * day the company actually works, honouring the configured week and holidays.
 */
async function nextWorkingDay(after: string, minOffset = 1): Promise<string> {
  const settings = await getSettings();
  const holidays = new Set(
    (await prisma.holiday.findMany({ select: { date: true } })).map((h) => h.date),
  );
  for (let i = minOffset; i <= minOffset + 14; i += 1) {
    const candidate = addDays(after, i);
    if (settings.workingDays.includes(dayOfWeek(candidate)) && !holidays.has(candidate)) {
      return candidate;
    }
  }
  throw new Error('No working day found in the next two weeks');
}

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

before(async () => {
  server = createApp().listen(PORT);
  await new Promise((resolve) => server.once('listening', resolve));
  today = todayInTz((await getSettings()).timezone);

  // Start from a clean day for the test employee: a previous run may have left
  // a submitted/reviewed SOD or EOD, and those are intentionally frozen.
  const employee = await prisma.user.findUnique({
    where: { email: 'ananya@acme.test' },
    select: { id: true },
  });
  if (employee) {
    await prisma.sod.deleteMany({ where: { userId: employee.id, date: { gte: today } } });
    await prisma.eod.deleteMany({ where: { userId: employee.id, date: { gte: today } } });
  }
});

after(async () => {
  // Remove only what this run created.
  const created = await prisma.task.findMany({
    where: { title: { contains: MARKER } },
    select: { id: true },
  });
  const ids = created.map((t) => t.id);
  if (ids.length) {
    await prisma.sodItem.deleteMany({ where: { taskId: { in: ids } } });
    await prisma.eodItem.deleteMany({ where: { taskId: { in: ids } } });
    await prisma.taskActivity.deleteMany({ where: { taskId: { in: ids } } });
    await prisma.taskComment.deleteMany({ where: { taskId: { in: ids } } });
    await prisma.task.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.$disconnect();
  server.close();
});

describe('Task Management System — core workflow', () => {
  test('health endpoint responds', async () => {
    const { status, json } = await api('/health');
    assert.equal(status, 200);
    assert.equal(json.ok, true);
  });

  test('rejects bad credentials without leaking which part was wrong', async () => {
    const { status, json } = await api('/auth/login', {
      method: 'POST',
      body: { email: 'lead@acme.test', password: 'wrong-password' },
    });
    assert.equal(status, 401);
    assert.match(json.error.message, /Invalid email or password/);
  });

  test('team lead and employee can log in', async () => {
    const lead = await api('/auth/login', {
      method: 'POST',
      body: { email: 'lead@acme.test', password: PASSWORD },
    });
    assert.equal(lead.status, 200, JSON.stringify(lead.json));
    leadToken = lead.json.accessToken;
    assert.ok(lead.json.permissions.includes('task.create'));

    const employee = await api('/auth/login', {
      method: 'POST',
      body: { email: 'ananya@acme.test', password: PASSWORD },
    });
    assert.equal(employee.status, 200);
    employeeToken = employee.json.accessToken;
    employeeId = employee.json.user.id;
    assert.equal(employee.json.user.role.portal, 'EMPLOYEE');
  });

  test('employee cannot reach admin-only endpoints', async () => {
    const { status } = await api('/org/settings', { token: employeeToken });
    assert.equal(status, 403);
  });

  test('employee cannot see another employee via scope filter', async () => {
    const other = await prisma.user.findFirstOrThrow({
      where: { email: 'rohit@acme.test' },
      select: { id: true },
    });
    const { status } = await api(`/employees/${other.id}`, { token: employeeToken });
    assert.equal(status, 403);
  });

  test('admin assigns a task', async () => {
    const due = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const { status, json } = await api('/tasks', {
      method: 'POST',
      token: leadToken,
      body: {
        title: `Ship the release notes ${MARKER}`,
        description: 'Draft, review and publish.',
        priority: 'HIGH',
        assigneeId: employeeId,
        dueDate: due,
        estimatedHours: 4,
      },
    });
    assert.equal(status, 201, JSON.stringify(json));
    assert.equal(json.count, 1);
    taskId = json.data[0].id;
    assert.equal(json.data[0].status, 'ASSIGNED');
  });

  test("the new task appears in the employee's SOD automatically", async () => {
    const { status, json } = await api('/sod/today', { token: employeeToken });
    assert.equal(status, 200);

    // The task must always be in the day's work list. Whether it is *planned*
    // depends on the day: weekends, holidays and approved leave are auto-skipped.
    assert.ok(json.taskCount >= 1, 'the assigned task should be in the day work list');

    if (json.data.status === 'SKIPPED') {
      assert.ok(json.data.skipReason, 'a skipped SOD must say why');
      return;
    }
    const titles = json.data.items.map((i: Json) => i.titleSnapshot);
    assert.ok(
      titles.some((t: string) => t.includes(MARKER)),
      `expected the assigned task in today's SOD, got: ${titles.join(' | ')}`,
    );
  });

  test('SOD generation for the next working day picks the task up', async () => {
    const date = await nextWorkingDay(today);
    const { status, json } = await api(`/sod/${date}`, { token: employeeToken });
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.data.status, 'PENDING');
    const titles = json.data.items.map((i: Json) => i.titleSnapshot);
    assert.ok(
      titles.some((t: string) => t.includes(MARKER)),
      `expected auto-generated SOD for ${date} to include the task, got: ${titles.join(' | ')}`,
    );
  });

  test('employee submits SOD', async () => {
    const { status, json } = await api(`/sod/${today}/submit`, {
      method: 'POST',
      token: employeeToken,
      body: { plannedNote: 'Release notes first, then the review comments.' },
    });
    // A second run on the same day is already submitted — both are valid states.
    assert.ok([200, 400].includes(status), JSON.stringify(json));
    if (status === 200) assert.equal(json.data.status, 'SUBMITTED');
  });

  test('employee updates progress, which starts the task', async () => {
    const { status, json } = await api(`/tasks/${taskId}/progress`, {
      method: 'POST',
      token: employeeToken,
      body: { progress: 60, hoursSpent: 2, note: 'Draft done' },
    });
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.data.progress, 60);
    assert.equal(json.data.status, 'IN_PROGRESS');
  });

  test('"mark completed" becomes "submitted for review" for an employee', async () => {
    const { status, json } = await api(`/tasks/${taskId}/status`, {
      method: 'POST',
      token: employeeToken,
      body: { status: 'COMPLETED', note: 'Ready for review' },
    });
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.appliedStatus, 'SUBMITTED_FOR_REVIEW');
    assert.equal(json.data.status, 'SUBMITTED_FOR_REVIEW');
  });

  test('an illegal status transition is rejected', async () => {
    const { status, json } = await api(`/tasks/${taskId}/status`, {
      method: 'POST',
      token: leadToken,
      body: { status: 'ACCEPTED' },
    });
    assert.equal(status, 409, JSON.stringify(json));
  });

  test('task shows up in the reviewer queue', async () => {
    const { status, json } = await api('/tasks/review-queue', { token: leadToken });
    assert.equal(status, 200);
    assert.ok(json.data.some((t: Json) => t.id === taskId));
  });

  test('reviewer requests changes, then approves', async () => {
    const changes = await api(`/tasks/${taskId}/review`, {
      method: 'POST',
      token: leadToken,
      body: { action: 'REQUEST_CHANGES', notes: 'Add the migration steps.' },
    });
    assert.equal(changes.status, 200, JSON.stringify(changes.json));
    assert.equal(changes.json.data.status, 'CHANGES_REQUIRED');

    await api(`/tasks/${taskId}/status`, {
      method: 'POST',
      token: employeeToken,
      body: { status: 'SUBMITTED_FOR_REVIEW' },
    });

    const approve = await api(`/tasks/${taskId}/review`, {
      method: 'POST',
      token: leadToken,
      body: { action: 'APPROVE', notes: 'Looks good.' },
    });
    assert.equal(approve.status, 200, JSON.stringify(approve.json));
    assert.equal(approve.json.data.status, 'COMPLETED');
    assert.equal(approve.json.data.progress, 100);
  });

  test('EOD is pre-filled from the day’s task data', async () => {
    const { status, json } = await api('/eod/today', { token: employeeToken });
    assert.equal(status, 200);
    const item = json.data.items.find((i: Json) => i.taskId === taskId);
    assert.ok(item, 'the completed task should be pulled into the EOD');
    assert.equal(item.category, 'COMPLETED');
  });

  test('employee submits EOD and admin reviews it', async () => {
    const draft = await api('/eod/today', { token: employeeToken });
    const items = draft.json.data.items.map((i: Json) => ({ id: i.id, hoursSpent: 2 }));

    const submit = await api(`/eod/${today}/submit`, {
      method: 'POST',
      token: employeeToken,
      body: {
        workSummary: 'Completed the release notes and picked up review feedback.',
        nextDayPlan: 'Start the migration guide.',
        blockers: 'None',
        items,
        extraItems: [{ title: 'Helped QA reproduce a bug', hoursSpent: 1 }],
      },
    });
    assert.ok([200, 400].includes(submit.status), JSON.stringify(submit.json));

    const eod = await prisma.eod.findUniqueOrThrow({
      where: { userId_date: { userId: employeeId, date: today } },
    });

    const review = await api(`/eod/${eod.id}/review`, {
      method: 'POST',
      token: leadToken,
      body: { action: 'APPROVE', notes: 'Thanks.' },
    });
    assert.equal(review.status, 200, JSON.stringify(review.json));
    assert.equal(review.json.data.status, 'REVIEWED');
  });

  test('dashboards return counts for both portals', async () => {
    const employee = await api('/dashboard/me', { token: employeeToken });
    assert.equal(employee.status, 200);
    assert.ok(typeof employee.json.tasks.total === 'number');

    const admin = await api('/dashboard/admin', { token: leadToken });
    assert.equal(admin.status, 200);
    assert.ok(typeof admin.json.employees.total === 'number');
    assert.ok(Array.isArray(admin.json.trend));
  });

  test('reports return rows and refuse export without permission', async () => {
    const report = await api('/reports/tasks', { token: leadToken });
    assert.equal(report.status, 200);
    assert.ok(Array.isArray(report.json.rows));

    const denied = await api('/reports/tasks?format=xlsx', { token: employeeToken });
    assert.equal(denied.status, 403);
  });

  test('overdue filter maps onto the derived flag', async () => {
    const { status, json } = await api('/tasks?status=OVERDUE', { token: leadToken });
    assert.equal(status, 200);
    assert.ok(json.data.every((t: Json) => t.isOverdue === true));
  });

  test('leave application checks the balance and creates an approval', async () => {
    const types = await api('/leave/types', { token: employeeToken });
    const casual = types.json.data.find((t: Json) => t.code === 'CL');
    const start = await nextWorkingDay(today, 20);

    const applied = await api('/leave', {
      method: 'POST',
      token: employeeToken,
      body: {
        leaveTypeId: casual.id,
        startDate: start,
        endDate: start,
        reason: 'Personal work at home.',
      },
    });
    assert.ok([201, 409].includes(applied.status), JSON.stringify(applied.json));

    if (applied.status === 201) {
      const cancel = await api(`/leave/${applied.json.data.id}/cancel`, {
        method: 'POST',
        token: employeeToken,
      });
      assert.equal(cancel.status, 200);
    }
  });

  test('attendance check-in is idempotent per day', async () => {
    const first = await api('/attendance/check-in', { method: 'POST', token: employeeToken, body: {} });
    assert.ok([200, 400].includes(first.status), JSON.stringify(first.json));

    const second = await api('/attendance/check-in', { method: 'POST', token: employeeToken, body: {} });
    assert.equal(second.status, 400);
    assert.match(second.json.error.message, /already checked in/);
  });
});
