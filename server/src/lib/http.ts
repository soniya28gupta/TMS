import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { AppError, badRequest } from './errors';

/** Wraps async route handlers so rejected promises reach the error middleware. */
export function handler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

/**
 * Returns the schema's *output* type, so `.default()` and `.coerce` produce
 * fully-populated values instead of `T | undefined` at every call site.
 */
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  try {
    return schema.parse(data) as z.output<S>;
  } catch (error) {
    if (error instanceof ZodError) {
      throw badRequest(
        'Validation failed',
        error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    throw error;
  }
}

export type PageMeta = { page: number; pageSize: number; total: number; totalPages: number };

export function paginated<T>(items: T[], total: number, page: number, pageSize: number) {
  return {
    data: items,
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    } satisfies PageMeta,
  };
}

export function skipTake(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/** Central error translator. Keeps internal details out of client responses. */
export function errorMiddleware(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (
    error instanceof AppError ||
    (error && typeof error === 'object' && 'status' in error && 'code' in error && typeof (error as any).status === 'number')
  ) {
    const appErr = error as AppError;
    res.status(appErr.status).json({
      error: { code: appErr.code, message: appErr.message, details: appErr.details },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Validation failed',
        details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }

  const err = error as {
    code?: string;
    meta?: { target?: string[] };
    status?: number;
    statusCode?: number;
    type?: string;
    message?: string;
  };

  // Malformed JSON from client body parser
  if (err?.type === 'entity.parse.failed' || (err?.status === 400 && error instanceof SyntaxError)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Malformed JSON payload' } });
    return;
  }
  // Prisma unique-constraint violation
  if (err?.code === 'P2002') {
    res.status(409).json({
      error: {
        code: 'CONFLICT',
        message: `A record with this ${err.meta?.target?.join(', ') ?? 'value'} already exists`,
      },
    });
    return;
  }
  // Prisma foreign key constraint violation
  if (err?.code === 'P2003') {
    res.status(400).json({
      error: {
        code: 'BAD_REQUEST',
        message: 'Related record not found',
      },
    });
    return;
  }
  if (err?.code === 'P2025') {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    return;
  }

  console.error('[unhandled]', error);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
}
