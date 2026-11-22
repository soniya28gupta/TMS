import type { Request } from 'express';
import { prisma } from '../db';
import { writeJson } from '../lib/json';

type AuditInput = {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
};

/**
 * Audit writes must never break the request they describe, so failures are
 * logged and swallowed.
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        meta: writeJson(input.meta ?? {}),
        ip: input.ip ?? null,
      },
    });
  } catch (error) {
    console.error('[audit] failed to record', input.action, error);
  }
}

export function auditFromRequest(
  req: Request,
  input: Omit<AuditInput, 'actorId' | 'ip'>,
): Promise<void> {
  return audit({ ...input, actorId: req.auth?.id ?? null, ip: clientIp(req) });
}

export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) return forwarded.split(',')[0].trim();
  return req.ip ?? '';
}
