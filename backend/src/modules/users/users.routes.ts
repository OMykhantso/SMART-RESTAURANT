import { z } from 'zod';
import { Prisma, Role } from '@prisma/client';
import { createRouter, idParam } from '../../lib/router';
import { prisma } from '../../lib/prisma';
import { badRequest, conflict } from '../../lib/errors';
import { hashPassword, publicUser } from '../auth/auth.service';
import { emailSchema, nameSchema, passwordSchema, phoneSchema } from '../auth/auth.schemas';

const { router, define } = createRouter('/users');

const listQuery = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.enum(Role).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

define({
  method: 'get',
  path: '/',
  summary: 'Список користувачів (пошук, фільтр за роллю, пагінація)',
  tags: ['Users (Admin)'],
  roles: ['ADMIN'],
  query: listQuery,
  handler: async ({ query }) => {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search } },
            ],
          }
        : {}),
    };
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { _count: { select: { reservations: true, orders: true } } },
      }),
    ]);
    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      items: users.map((u) => ({
        ...publicUser(u),
        reservationsCount: u._count.reservations,
        ordersCount: u._count.orders,
      })),
    };
  },
});

define({
  method: 'post',
  path: '/',
  summary: 'Створення користувача будь-якої ролі (наприклад, працівника)',
  tags: ['Users (Admin)'],
  roles: ['ADMIN'],
  status: 201,
  body: z.object({
    name: nameSchema,
    email: emailSchema,
    phone: phoneSchema.optional(),
    password: passwordSchema,
    role: z.enum(Role),
  }),
  handler: async ({ body }) => {
    const exists = await prisma.user.findUnique({ where: { email: body.email } });
    if (exists) throw conflict('Користувач з таким email вже існує', 'EMAIL_TAKEN');
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone,
        role: body.role,
        passwordHash: await hashPassword(body.password),
      },
    });
    return publicUser(user);
  },
});

define({
  method: 'patch',
  path: '/:id',
  summary: 'Зміна ролі / деактивація / редагування користувача',
  tags: ['Users (Admin)'],
  roles: ['ADMIN'],
  params: idParam,
  body: z.object({
    name: nameSchema.optional(),
    phone: phoneSchema.nullable().optional(),
    role: z.enum(Role).optional(),
    isActive: z.boolean().optional(),
    password: passwordSchema.optional(),
  }),
  handler: async ({ params, body, user }) => {
    if (params.id === user!.id && (body.isActive === false || (body.role && body.role !== 'ADMIN'))) {
      throw badRequest('Не можна деактивувати себе або зняти з себе роль адміністратора', 'SELF_LOCKOUT');
    }
    const { password, ...rest } = body;
    const updated = await prisma.user.update({
      where: { id: params.id },
      data: { ...rest, ...(password ? { passwordHash: await hashPassword(password) } : {}) },
    });
    if (body.isActive === false || password) {
      await prisma.refreshToken.updateMany({
        where: { userId: params.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    return publicUser(updated);
  },
});

export default router;
