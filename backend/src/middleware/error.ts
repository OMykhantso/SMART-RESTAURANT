import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { AppError } from '../lib/errors';
import { env } from '../config';

function zodDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || null,
    message: issue.message,
  }));
}

/** Перетворює помилки PostgreSQL / Prisma / Zod у зрозумілі HTTP-відповіді. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Некоректні дані запиту', details: zodDetails(err) },
    });
  }
  if (err instanceof MulterError) {
    return res.status(400).json({ error: { code: 'UPLOAD_ERROR', message: err.message } });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: { code: 'DUPLICATE', message: 'Запис з такими унікальними даними вже існує', details: err.meta },
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ресурс не знайдено' } });
    }
    if (err.code === 'P2003') {
      return res.status(409).json({
        error: { code: 'FK_CONSTRAINT', message: 'Операція порушує звʼязки між даними (запис використовується)' },
      });
    }
    if (err.code === 'P2034') {
      return res.status(409).json({
        error: { code: 'TX_CONFLICT', message: 'Конкурентна зміна даних, повторіть спробу' },
      });
    }
  }
  const pgCode = extractPgCode(err);
  if (pgCode === '23P01') {
    return res.status(409).json({
      error: { code: 'TABLE_ALREADY_BOOKED', message: 'Цей столик щойно забронювали на цей час. Оберіть інший слот.' },
    });
  }
  if (pgCode === '23514') {
    return res.status(400).json({ error: { code: 'CONSTRAINT_VIOLATION', message: 'Дані порушують обмеження БД' } });
  }
  if (err instanceof SyntaxError && 'body' in (err as object)) {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Некоректний JSON у тілі запиту' } });
  }

  if (!env.isTest) console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL', message: 'Внутрішня помилка сервера' } });
}

export function extractPgCode(err: unknown): string | undefined {
  const text = err instanceof Error ? err.message : String(err);
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const meta = err.meta as Record<string, unknown> | undefined;
    const code = (meta?.code as string | undefined) ?? undefined;
    if (code) return code;
  }
  if (text.includes('reservations_no_overlap') || text.includes('23P01')) return '23P01';
  if (text.includes('23514') || text.includes('violates check constraint')) return '23514';
  return undefined;
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: 'ROUTE_NOT_FOUND', message: 'Endpoint не існує' } });
}
