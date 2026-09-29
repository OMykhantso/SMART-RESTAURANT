import rateLimit from 'express-rate-limit';
import { createRouter } from '../../lib/router';
import { prisma } from '../../lib/prisma';
import { env } from '../../config';
import * as auth from './auth.service';
import {
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  updateProfileSchema,
} from './auth.schemas';

const { router, define } = createRouter('/auth');

const authLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => env.isTest,
  message: { error: { code: 'RATE_LIMITED', message: 'Забагато спроб. Спробуйте за хвилину.' } },
});

define({
  method: 'post',
  path: '/register',
  summary: 'Реєстрація нового клієнта',
  tags: ['Auth'],
  body: registerSchema,
  status: 201,
  middleware: [authLimiter],
  responses: { 201: 'Користувача створено, повертає токени', 409: 'Email вже зайнятий' },
  handler: ({ body, req }) => auth.register(body, req.headers['user-agent']),
});

define({
  method: 'post',
  path: '/login',
  summary: 'Вхід (email + пароль) → access + refresh токени',
  tags: ['Auth'],
  body: loginSchema,
  middleware: [authLimiter],
  responses: { 200: 'Успішний вхід', 401: 'Неправильні облікові дані', 403: 'Акаунт деактивовано' },
  handler: ({ body, req }) => auth.login(body, req.headers['user-agent']),
});

define({
  method: 'post',
  path: '/refresh',
  summary: 'Оновлення пари токенів (ротація refresh-токена)',
  tags: ['Auth'],
  body: refreshSchema,
  handler: ({ body, req }) => auth.refresh(body.refreshToken, req.headers['user-agent']),
});

define({
  method: 'post',
  path: '/fork',
  summary: 'Нова незалежна сесія для іншої вкладки (refresh-токен не споживається)',
  tags: ['Auth'],
  body: refreshSchema,
  middleware: [authLimiter],
  responses: { 200: 'Нова пара токенів', 401: 'Сесію не знайдено або відкликано' },
  handler: ({ body, req }) => auth.fork(body.refreshToken, req.headers['user-agent']),
});

define({
  method: 'post',
  path: '/logout',
  summary: 'Вихід — відкликання refresh-токена',
  tags: ['Auth'],
  body: refreshSchema,
  handler: async ({ body }) => {
    await auth.logout(body.refreshToken);
    return undefined;
  },
});

define({
  method: 'get',
  path: '/me',
  summary: 'Поточний користувач',
  tags: ['Auth'],
  auth: true,
  handler: async ({ user }) => {
    const u = await prisma.user.findUniqueOrThrow({ where: { id: user!.id } });
    return auth.publicUser(u);
  },
});

define({
  method: 'patch',
  path: '/me',
  summary: 'Оновлення профілю (імʼя, телефон)',
  tags: ['Auth'],
  auth: true,
  body: updateProfileSchema,
  handler: async ({ user, body }) => {
    const u = await prisma.user.update({ where: { id: user!.id }, data: body });
    return auth.publicUser(u);
  },
});

define({
  method: 'post',
  path: '/change-password',
  summary: 'Зміна пароля (відкликає всі сесії)',
  tags: ['Auth'],
  auth: true,
  body: changePasswordSchema,
  handler: async ({ user, body }) => {
    await auth.changePassword(user!.id, body.currentPassword, body.newPassword);
    return undefined;
  },
});

export default router;
