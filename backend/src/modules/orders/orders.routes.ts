import { z } from 'zod';
import { DateTime } from 'luxon';
import { OrderItemStatus, OrderStatus, OrderType, type Prisma } from '@prisma/client';
import { createRouter, idParam } from '../../lib/router';
import { prisma } from '../../lib/prisma';
import { conflict, forbidden, unprocessable } from '../../lib/errors';
import { now, TZ } from '../../lib/time';
import * as svc from './orders.service';

const { router, define } = createRouter('');

define({
  method: 'post',
  path: '/orders',
  summary: 'Створити замовлення за столиком',
  description:
    'Клієнт може замовляти лише після check-in (активний візит CHECKED_IN). Замовлення клієнта має статус NEW і ' +
    'потребує підтвердження офіціантом; замовлення офіціанта одразу CONFIRMED і потрапляє на кухню. ' +
    'Ціни фіксуються з БД на момент замовлення; недоступні страви (стоп-лист) відхиляються.',
  tags: ['Orders'],
  roles: ['CLIENT', 'STAFF', 'ADMIN'],
  status: 201,
  body: z.object({
    reservationId: z.number().int().positive().optional(),
    tableId: z.number().int().positive().optional(),
    notes: z.string().trim().max(500).optional(),
    items: z
      .array(
        z.object({
          dishId: z.number().int().positive(),
          quantity: z.number().int().min(1).max(50),
          notes: z.string().trim().max(255).optional(),
        }),
      )
      .min(1, 'Додайте хоча б одну страву')
      .max(40),
  }),
  handler: ({ user, body }) => svc.createOrder(user!, body),
});

define({
  method: 'get',
  path: '/orders/my',
  summary: 'Мої замовлення (історія клієнта)',
  tags: ['Orders'],
  auth: true,
  query: z.object({ active: z.stringbool().optional(), type: z.enum(OrderType).optional() }),
  handler: async ({ user, query }) => {
    const orders = await prisma.order.findMany({
      where: {
        userId: user!.id,
        ...(query.type ? { type: query.type } : {}),
        ...(query.active ? { status: { notIn: ['PAID', 'DELIVERED', 'CANCELLED'] } } : {}),
      },
      include: svc.orderInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return orders.map((o) => svc.serializeOrder(o, user));
  },
});

define({
  method: 'get',
  path: '/orders',
  summary: 'Замовлення ресторану (працівник): фільтр за статусами, датою, столиком',
  tags: ['Orders'],
  roles: ['STAFF', 'KITCHEN', 'ADMIN'],
  query: z.object({
    status: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(',') : undefined))
      .pipe(z.array(z.enum(OrderStatus)).optional()),
    date: z.iso.date().optional(),
    tableId: z.coerce.number().int().positive().optional(),
    reservationId: z.coerce.number().int().positive().optional(),
    type: z.enum(OrderType).optional(),
  }),
  handler: async ({ user, query }) => {
    // неоплачені онлайн-замовлення доставки ще не стосуються ні залу, ні кухні
    const where: Prisma.OrderWhereInput = { NOT: { type: 'DELIVERY', status: 'NEW' } };
    if (query.status) where.status = { in: query.status };
    if (query.type) where.type = query.type;
    if (query.tableId) where.tableId = query.tableId;
    if (query.reservationId) where.reservationId = query.reservationId;
    const day = query.date
      ? DateTime.fromISO(query.date, { zone: TZ() }).startOf('day')
      : DateTime.fromJSDate(now(), { zone: TZ() }).startOf('day');
    if (!query.reservationId) where.createdAt = { gte: day.toJSDate(), lt: day.plus({ days: 1 }).toJSDate() };
    const orders = await prisma.order.findMany({ where, include: svc.orderInclude, orderBy: { createdAt: 'asc' } });
    return orders.map((o) => svc.serializeOrder(o, user));
  },
});

define({
  method: 'get',
  path: '/orders/:id',
  summary: 'Деталі замовлення з історією статусів',
  tags: ['Orders'],
  auth: true,
  params: idParam,
  handler: async ({ user, params }) => {
    const o = await svc.loadOrder(params.id);
    svc.assertCanView(user!, o);
    const history = await prisma.statusChange.findMany({
      where: { orderId: o.id },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { name: true, role: true } } },
    });
    return {
      ...svc.serializeOrder(o, user),
      history: history.map((h) => ({
        from: h.fromStatus,
        to: h.toStatus,
        at: h.createdAt,
        note: h.note,
        actor: h.actor ? { name: h.actor.name, role: h.actor.role } : { name: 'Система', role: 'SYSTEM' },
      })),
    };
  },
});

define({
  method: 'patch',
  path: '/orders/:id/status',
  summary: 'Змінити статус замовлення (підтвердити / готувати / готово / подано / скасувати)',
  description:
    'NEW→CONFIRMED (офіціант) → PREPARING (кухня) → READY (кухня) → SERVED (офіціант) → PAID (лише через оплату). ' +
    'Скасування: клієнт — лише NEW; офіціант/кухня — до початку приготування, з причиною. ' +
      'Для доставки діє окремий автомат (DELIVERY_FLOW): статуси курʼєра змінюються лише через Delivery API.',
  tags: ['Orders'],
  auth: true,
  params: idParam,
  body: z.object({
    status: z.enum(OrderStatus),
    reason: z.string().trim().max(255).optional(),
  }),
  handler: async ({ user, params, body }) => {
    if (body.status === 'PAID') throw forbidden('Статус «Оплачено» встановлюється лише платіжною системою');
    if (body.status === 'DELIVERING' || body.status === 'DELIVERED') {
      throw conflict('Статуси доставки змінює курʼєр у Delivery API', 'USE_DELIVERY_API');
    }
    const o = await svc.transitionOrder(user!, params.id, body.status, { reason: body.reason });
    return svc.serializeOrder(o, user);
  },
});

// ─────────────────────────────── Kitchen display ───────────────────────────────

define({
  method: 'get',
  path: '/kitchen/orders',
  summary: 'Kitchen display: черга замовлень для кухні',
  tags: ['Kitchen'],
  roles: ['KITCHEN', 'STAFF', 'ADMIN'],
  handler: async ({ user }) => {
    const since = new Date(now().getTime() - 12 * 3600000);
    const readySince = new Date(now().getTime() - 30 * 60000);
    const orders = await prisma.order.findMany({
      where: {
        OR: [
          { status: { in: ['CONFIRMED', 'PREPARING'] }, createdAt: { gte: since } },
          { status: 'READY', readyAt: { gte: readySince } },
        ],
      },
      include: svc.orderInclude,
      orderBy: [{ confirmedAt: 'asc' }, { id: 'asc' }],
    });
    return orders.map((o) => svc.serializeOrder(o, user));
  },
});

define({
  method: 'patch',
  path: '/kitchen/orders/:id/items/:itemId',
  summary: 'Kitchen display: відмітити страву (у роботі / готово)',
  tags: ['Kitchen'],
  roles: ['KITCHEN', 'ADMIN'],
  params: z.object({ id: z.coerce.number().int().positive(), itemId: z.coerce.number().int().positive() }),
  body: z.object({ status: z.enum(OrderItemStatus) }),
  handler: ({ user, params, body }) => svc.setItemStatus(user!, params.id, params.itemId, body.status),
});

// ─────────────────────────────── Відгуки ───────────────────────────────

define({
  method: 'post',
  path: '/orders/:id/review',
  summary: 'Залишити відгук про візит / доставку і оцінити страви (після оплати або доставки)',
  tags: ['Reviews'],
  roles: ['CLIENT'],
  status: 201,
  params: idParam,
  body: z.object({
    rating: z.number().int().min(1).max(5),
    comment: z.string().trim().max(1000).optional(),
    dishes: z
      .array(z.object({ dishId: z.number().int().positive(), rating: z.number().int().min(1).max(5) }))
      .max(40)
      .default([]),
  }),
  handler: async ({ user, params, body }) => {
    const o = await svc.loadOrder(params.id);
    if (o.userId !== user!.id) throw forbidden('Це не ваше замовлення');
    if (o.status !== 'PAID' && o.status !== 'DELIVERED') {
      throw conflict(
        o.type === 'DELIVERY' ? 'Відгук можна залишити після отримання доставки' : 'Відгук можна залишити після оплати замовлення',
        'ORDER_NOT_PAID',
      );
    }
    if (o.reviews.length > 0) throw conflict('Ви вже залишили відгук на це замовлення', 'ALREADY_REVIEWED');
    const orderedDishIds = new Set(o.items.map((i) => i.dishId));
    const foreign = body.dishes.filter((d) => !orderedDishIds.has(d.dishId));
    if (foreign.length) {
      throw unprocessable('Оцінювати можна лише страви з цього замовлення', 'DISH_NOT_IN_ORDER');
    }
    const uniqueDishes = [...new Map(body.dishes.map((d) => [d.dishId, d])).values()];
    await prisma.$transaction([
      prisma.review.create({ data: { userId: user!.id, orderId: o.id, rating: body.rating, comment: body.comment } }),
      ...uniqueDishes.map((d) =>
        prisma.review.create({ data: { userId: user!.id, orderId: o.id, dishId: d.dishId, rating: d.rating } }),
      ),
    ]);
    return { ok: true, reviewsCreated: 1 + uniqueDishes.length };
  },
});

define({
  method: 'get',
  path: '/reviews',
  summary: 'Останні відгуки гостей (публічно — загальні відгуки про візит)',
  tags: ['Reviews'],
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(12),
    minRating: z.coerce.number().int().min(1).max(5).optional(),
  }),
  handler: async ({ query }) => {
    const reviews = await prisma.review.findMany({
      where: { dishId: null, ...(query.minRating ? { rating: { gte: query.minRating } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
      include: {
        user: { select: { name: true } },
        order: { select: { id: true, table: { select: { number: true } }, items: { select: { dish: { select: { name: true } } }, take: 3 } } },
      },
    });
    const agg = await prisma.review.aggregate({ where: { dishId: null }, _avg: { rating: true }, _count: { _all: true } });
    return {
      average: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null,
      count: agg._count._all,
      items: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        author: r.user.name.split(' ')[0],
        orderId: r.order.id,
        dishes: r.order.items.map((i) => i.dish.name),
      })),
    };
  },
});

export default router;
