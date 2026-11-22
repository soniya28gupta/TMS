/**
 * Guards the contract between the UI and the API.
 *
 * Every path here is one the frontend actually calls. A 404 means a page is
 * pointed at an endpoint that does not exist — a class of bug that typechecks
 * cleanly on the client and only shows up at runtime.
 */
process.env.SCHEDULER_ENABLED = 'false';
process.env.NODE_ENV = 'test';

import assert from 'node:assert/strict';
import test, { after, before, describe } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from '../src/index';
import { prisma } from '../src/db';
import { todayInTz } from '../src/lib/dates';
import { getSettings } from '../src/services/settings.service';

const PORT = 4997;
const BASE = `http://127.0.0.1:${PORT}/api`;
const PASSWORD = process.env.SEED_PASSWORD ?? 'Password@123';

let server: Server;
let adminToken = '';
let employeeToken = '';
let today = '';

before(async () => {
  server = createApp().listen(PORT);
  await new Promise((resolve) => server.once('listening', resolve));
  today = todayInTz((await getSettings()).timezone);

  const login = async (email: string) => {
    const res = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    assert.equal(res.status, 200, `could not sign in as ${email}`);
    return (await res.json()).accessToken as string;
  };

  adminToken = await login('admin@acme.test');
  employeeToken = await login('ananya@acme.test');
});

after(async () => {
  await prisma.$disconnect();
  server.close();
});

async function get(path: string, token: string): Promise<number> {
  const res = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` } });
  return res.status;
}

describe('API contract — every endpoint the UI calls exists', () => {
  test('admin portal endpoints resolve', async () => {
    const paths = [
      '/dashboard/admin',
      '/employees?page=1&pageSize=15',
      '/employees/options',
      '/employees/org-chart',
      '/tasks?status=SUBMITTED_FOR_REVIEW&pageSize=5',
      '/tasks/review-queue',
      '/tasks/meta/options',
      '/org/roles',
      '/org/departments',
      '/org/teams',
      '/org/settings',
      '/org/leave-types',
      '/org/audit?pageSize=5',
      `/sod/history?from=${today}&to=${today}&pageSize=50`,
      `/eod/history?from=${today}&to=${today}&pageSize=50`,
      '/eod/review-queue',
      `/attendance?from=${today}&to=${today}&page=1&pageSize=15`,
      '/attendance/corrections/list',
      '/leave?status=PENDING&page=1&pageSize=15',
      '/leave/types',
      '/leave/holidays',
      '/reports/tasks',
      '/reports/sod',
      '/reports/eod',
      '/reports/productivity',
      '/reports/department',
      '/reports/attendance',
      '/sessions?page=1&pageSize=25',
      '/sessions/active',
      '/recurring-tasks',
      '/task-templates',
      '/jobs',
      '/notifications?pageSize=12',
      '/documents',
    ];

    const failures: string[] = [];
    for (const path of paths) {
      const status = await get(path, adminToken);
      if (status !== 200) failures.push(`${path} → ${status}`);
    }
    assert.deepEqual(failures, [], `admin endpoints not returning 200:\n${failures.join('\n')}`);
  });

  test('employee portal endpoints resolve', async () => {
    const paths = [
      '/dashboard/me',
      '/tasks?pageSize=15',
      '/sod/today',
      '/sod/history?pageSize=10',
      `/sod/${today}`,
      '/eod/today',
      '/eod/history?pageSize=10',
      '/attendance/today',
      `/attendance?from=${today}&to=${today}&pageSize=31`,
      '/leave',
      '/leave/types',
      '/leave/balance',
      '/leave/holidays',
      `/leave/estimate?startDate=${today}&endDate=${today}`,
      '/notifications?pageSize=20',
      '/notifications/unread-count',
      '/documents',
      '/auth/me',
      '/auth/privacy',
      '/auth/sessions',
    ];

    const failures: string[] = [];
    for (const path of paths) {
      const status = await get(path, employeeToken);
      if (status !== 200) failures.push(`${path} → ${status}`);
    }
    assert.deepEqual(failures, [], `employee endpoints not returning 200:\n${failures.join('\n')}`);
  });

  test('an employee detail page loads its four panels', async () => {
    const employee = await prisma.user.findFirstOrThrow({
      where: { email: 'ananya@acme.test' },
      select: { id: true },
    });

    for (const path of [
      `/employees/${employee.id}`,
      `/tasks?assigneeId=${employee.id}&pageSize=20`,
      `/sod/history?userId=${employee.id}&pageSize=10`,
      `/eod/history?userId=${employee.id}&pageSize=10`,
      `/employees/${employee.id}/work-history`,
      `/employees/${employee.id}/reporting-line`,
    ]) {
      assert.equal(await get(path, adminToken), 200, `${path} should resolve`);
    }
  });

  test('unknown endpoints still 404 (the guard itself works)', async () => {
    assert.equal(await get('/attendance/daily', adminToken), 404);
    assert.equal(await get('/leave/requests', adminToken), 404);
  });
});
