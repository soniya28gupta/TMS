/* eslint-disable no-console */
/**
 * Production bootstrap — the minimum a real deployment needs, with **no demo
 * data and no shared passwords**.
 *
 * Creates: the role catalogue, system settings on IST, the position catalogue,
 * the departments those positions reference, and exactly one Super Admin whose
 * password you supply.
 *
 *   BOOTSTRAP_EMAIL=you@company.com \
 *   BOOTSTRAP_PASSWORD='<strong password>' \
 *   BOOTSTRAP_COMPANY='Your Company' \
 *   npm run -w server db:bootstrap
 *
 * Safe to re-run: everything is upserted, and it refuses to touch an existing
 * admin's password.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DEFAULT_ROLES, DEFAULT_SETTINGS } from '../src/constants';
import { POSITION_CATALOGUE } from '../src/positions';
import { rebuildAllPaths } from '../src/services/hierarchy.service';
import { prisma as sharedPrisma } from '../src/db';
import { passwordProblems } from '../src/auth/password';

const prisma = new PrismaClient();

const email = (process.env.BOOTSTRAP_EMAIL ?? '').toLowerCase().trim();
const password = process.env.BOOTSTRAP_PASSWORD ?? '';
const company = process.env.BOOTSTRAP_COMPANY ?? 'Your Company';
const firstName = process.env.BOOTSTRAP_FIRST_NAME ?? 'System';
const lastName = process.env.BOOTSTRAP_LAST_NAME ?? 'Administrator';

const DEPARTMENTS = [
  { name: 'Engineering', code: 'ENG' },
  { name: 'Sales', code: 'SLS' },
  { name: 'Human Resources', code: 'HR' },
  { name: 'Finance', code: 'FIN' },
  { name: 'Operations', code: 'OPS' },
];

async function main() {
  if (!email || !password) {
    throw new Error(
      'BOOTSTRAP_EMAIL and BOOTSTRAP_PASSWORD are required.\n' +
        "Example: BOOTSTRAP_EMAIL=admin@company.com BOOTSTRAP_PASSWORD='...' npm run -w server db:bootstrap",
    );
  }
  const problems = passwordProblems(password);
  if (problems.length) {
    throw new Error(`BOOTSTRAP_PASSWORD needs ${problems.join(', ')}.`);
  }

  console.log('Bootstrapping production instance…');

  // --- Roles --------------------------------------------------------------
  const roles = new Map<string, string>();
  for (const role of DEFAULT_ROLES) {
    const record = await prisma.role.upsert({
      where: { key: role.key },
      create: {
        key: role.key,
        name: role.name,
        portal: role.portal,
        rank: role.rank,
        description: role.description,
        isSystem: true,
      },
      update: { name: role.name, portal: role.portal, rank: role.rank },
    });
    roles.set(role.key, record.id);

    await prisma.rolePermission.deleteMany({ where: { roleId: record.id } });
    await prisma.rolePermission.createMany({
      data: role.permissions.map((permission) => ({ roleId: record.id, permission })),
    });
  }
  console.log(`  roles: ${roles.size}`);

  // --- Settings (Indian Standard Time) ------------------------------------
  const settings = { ...DEFAULT_SETTINGS, companyName: company, timezone: 'Asia/Kolkata' };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(value) },
      update: {}, // never overwrite settings an admin has already tuned
    });
  }
  console.log(`  settings: timezone Asia/Kolkata, company "${company}"`);

  // --- Departments & positions -------------------------------------------
  const departments = new Map<string, string>();
  for (const dept of DEPARTMENTS) {
    const record = await prisma.department.upsert({
      where: { code: dept.code },
      create: dept,
      update: {},
    });
    departments.set(dept.code, record.id);
  }

  for (const p of POSITION_CATALOGUE) {
    await prisma.position.upsert({
      where: { code: p.code },
      create: {
        code: p.code,
        title: p.title,
        level: p.level,
        band: p.band,
        track: p.track,
        canHire: p.canHire,
        departmentId: p.dept ? departments.get(p.dept)! : null,
      },
      update: {
        title: p.title,
        level: p.level,
        band: p.band,
        track: p.track,
        canHire: p.canHire,
      },
    });
  }
  console.log(`  departments: ${departments.size} · positions: ${POSITION_CATALOGUE.length}`);

  // --- Leave types --------------------------------------------------------
  const leaveTypes = [
    { name: 'Casual Leave', code: 'CL', defaultDays: 12, color: '#3b82f6' },
    { name: 'Sick Leave', code: 'SL', defaultDays: 8, color: '#ef4444' },
    { name: 'Earned Leave', code: 'EL', defaultDays: 15, color: '#10b981', carryForward: true, maxCarryForward: 10 },
    { name: 'Unpaid Leave', code: 'LWP', defaultDays: 0, color: '#6b7280', isPaid: false },
  ];
  for (const type of leaveTypes) {
    await prisma.leaveType.upsert({ where: { code: type.code }, create: type, update: {} });
  }

  // --- The one administrator ---------------------------------------------
  const ceoPosition = await prisma.position.findUniqueOrThrow({ where: { code: 'CEO' } });
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    // Re-running must not silently reset a live account's password.
    console.log(`  admin: ${email} already exists — left untouched`);
  } else {
    const created = await prisma.user.create({
      data: {
        employeeCode: 'EMP001',
        email,
        passwordHash: await bcrypt.hash(password, 10),
        firstName,
        lastName,
        roleId: roles.get('SUPER_ADMIN')!,
        positionId: ceoPosition.id,
        departmentId: departments.get('OPS')!,
        designation: 'System Administrator',
        dateOfJoining: new Date(),
        timezone: 'Asia/Kolkata',
        // They chose this password themselves, so no forced change.
        mustChangePassword: false,
        status: 'ACTIVE',
      },
    });
    console.log(`  admin: ${created.email} created`);
  }

  await rebuildAllPaths();

  const counts = {
    users: await prisma.user.count(),
    positions: await prisma.position.count(),
    roles: await prisma.role.count(),
  };
  console.log('\nBootstrap complete.', counts);
  console.log('Sign in, then add your leadership team from Employees → Add employee.');
}

main()
  .catch((error) => {
    console.error('\nBootstrap failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await Promise.all([prisma.$disconnect(), sharedPrisma.$disconnect()]);
  });
