import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { verifyAccessToken } from '../lib/jwt';
import { AppError, unauthorized } from '../lib/errors';

export interface AuthUser {
  id: number;
  role: Role;
  name: string;
  email: string;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}

function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/**
 * Перевіряє JWT та актуальний стан користувача в БД
 * (деактивований користувач втрачає доступ одразу, навіть з валідним токеном).
 */
export async function resolveUser(token: string): Promise<AuthUser> {
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw unauthorized('Токен недійсний або прострочений', 'TOKEN_INVALID');
  }
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, name: true, email: true, isActive: true },
  });
  if (!user) throw unauthorized('Користувача не знайдено', 'TOKEN_INVALID');
  if (!user.isActive) throw new AppError(403, 'ACCOUNT_DISABLED', 'Обліковий запис деактивовано');
  return { id: user.id, role: user.role, name: user.name, email: user.email };
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next(unauthorized());
  try {
    req.user = await resolveUser(token);
    next();
  } catch (e) {
    next(e);
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) return next();
  try {
    req.user = await resolveUser(token);
  } catch {
    // для публічних endpoint недійсний токен ігнорується
  }
  next();
}

export const isStaffRole = (role: Role) => role === 'STAFF' || role === 'ADMIN';
export const isKitchenRole = (role: Role) => role === 'KITCHEN' || role === 'ADMIN';
