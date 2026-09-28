import bcrypt from 'bcryptjs';
import type { User } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { signAccessToken } from '../../lib/jwt';
import { randomToken, sha256 } from '../../lib/http';
import { AppError, conflict, unauthorized } from '../../lib/errors';
import { env } from '../../config';

export const BCRYPT_ROUNDS = 10;

export function publicUser(user: Pick<User, 'id' | 'email' | 'name' | 'phone' | 'role' | 'createdAt'> & { isActive?: boolean }) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive ?? true,
    createdAt: user.createdAt,
  };
}

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_ROUNDS);

async function issueTokens(user: User, userAgent?: string) {
  const refreshToken = randomToken(48);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + env.refreshTokenTtlDays * 86400000),
      userAgent: userAgent?.slice(0, 255),
    },
  });
  return {
    user: publicUser(user),
    accessToken: signAccessToken(user.id, user.role),
    refreshToken,
    expiresIn: env.accessTokenTtlMin * 60,
  };
}

export async function register(input: { name: string; email: string; phone?: string; password: string }, userAgent?: string) {
  const email = input.email.toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw conflict('Користувач з таким email вже зареєстрований', 'EMAIL_TAKEN');
  const user = await prisma.user.create({
    data: {
      email,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      passwordHash: await hashPassword(input.password),
      role: 'CLIENT',
    },
  });
  return issueTokens(user, userAgent);
}

export async function login(input: { email: string; password: string }, userAgent?: string) {
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  // Однакове повідомлення для неіснуючого email і неправильного пароля — захист від перебору акаунтів
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw unauthorized('Неправильний email або пароль', 'INVALID_CREDENTIALS');
  }
  if (!user.isActive) throw new AppError(403, 'ACCOUNT_DISABLED', 'Обліковий запис деактивовано');
  return issueTokens(user, userAgent);
}

/**
 * Ротація refresh-токенів: кожен refresh-токен одноразовий.
 * Повторне використання вже відкликаного токена = ознака викрадення → відкликаємо всі сесії.
 */
export async function refresh(refreshToken: string, userAgent?: string) {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(refreshToken) },
    include: { user: true },
  });
  if (!record) throw unauthorized('Сесію не знайдено', 'REFRESH_INVALID');
  if (record.revokedAt) {
    await prisma.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw unauthorized('Сесію відкликано з міркувань безпеки', 'REFRESH_REUSED');
  }
  if (record.expiresAt < new Date()) throw unauthorized('Сесія закінчилась', 'REFRESH_EXPIRED');
  if (!record.user.isActive) throw new AppError(403, 'ACCOUNT_DISABLED', 'Обліковий запис деактивовано');

  await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
  return issueTokens(record.user, userAgent);
}

/**
 * Окрема сесія для нової вкладки браузера: чинний refresh-токен НЕ споживається (на відміну від /refresh),
 * а видається нова незалежна пара токенів. Так кожна вкладка має власну ротацію і вкладки не «крадуть»
 * токени одна в одної (що інакше спрацьовувало б як REFRESH_REUSED).
 */
export async function fork(refreshToken: string, userAgent?: string) {
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(refreshToken) },
    include: { user: true },
  });
  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw unauthorized('Сесію не знайдено', 'REFRESH_INVALID');
  }
  if (!record.user.isActive) throw new AppError(403, 'ACCOUNT_DISABLED', 'Обліковий запис деактивовано');
  return issueTokens(record.user, userAgent);
}

export async function logout(refreshToken: string) {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function changePassword(userId: number, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new AppError(400, 'WRONG_PASSWORD', 'Поточний пароль введено неправильно');
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } }),
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}
