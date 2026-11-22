/**
 * Test bootstrap, loaded via `node --test --import ./tests/setup.mjs`.
 *
 * Runs before any test module, which matters: `src/db.ts` constructs its
 * PrismaClient at import time, so DATABASE_URL has to be set before that.
 *
 * Tests get their own SQLite file. Sharing `dev.db` with a running dev server
 * made them flaky — SQLite locks the whole database for writes, so the dev
 * server's scheduler tick would intermittently collide with a test's write.
 *
 * The suites also run serially (`--test-concurrency=1` in the test script).
 * They share one database and the same seeded people, so two files checking the
 * same employee in on the same day would otherwise race. Serial execution costs
 * a few seconds and buys a deterministic suite.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(here, '..');
const testDbPath = resolve(serverRoot, 'prisma/test.db');

// Relative to schema.prisma's directory, so this lands in server/prisma/.
process.env.DATABASE_URL = 'file:./test.db';
process.env.NODE_ENV = 'test';
process.env.SCHEDULER_ENABLED = 'false';

const needsBuild = !existsSync(testDbPath) || process.env.TEST_DB_RESET === 'true';

if (needsBuild) {
  console.log('[tests] preparing a fresh test database…');
  // No --force-reset: `test:reset` deletes the file first, so a plain push
  // always starts from an empty database and never prompts.
  const options = { cwd: serverRoot, stdio: 'inherit', env: process.env };
  execSync('npx prisma db push --skip-generate', options);
  execSync('npx tsx prisma/seed.ts', options);
  console.log('[tests] test database ready.\n');
}
