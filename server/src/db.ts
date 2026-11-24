import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Supabase's Transaction Pooler (port 6543 / pooler.supabase.com) runs PgBouncer
 * in transaction mode, which rejects Prisma prepared statements unless
 * `pgbouncer=true` is present in the connection string.
 */
function resolveDatabaseUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw || !/^postgres(ql)?:\/\//i.test(raw)) return raw;
  try {
    const parsed = new URL(raw);
    const isPooler = parsed.port === '6543' || parsed.hostname.includes('pooler.supabase.com');
    if (isPooler) {
      if (!parsed.searchParams.has('pgbouncer')) parsed.searchParams.set('pgbouncer', 'true');
      if (!parsed.searchParams.has('connection_limit')) parsed.searchParams.set('connection_limit', '1');
    }
    return parsed.toString();
  } catch {
    return raw;
  }
}

const datasourceUrl = resolveDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
    log: process.env.PRISMA_LOG === 'true' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });

globalForPrisma.prisma = prisma;

export async function disconnect(): Promise<void> {
  await prisma.$disconnect();
}
