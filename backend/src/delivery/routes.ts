import { z } from 'zod';
import { DateTime } from 'luxon';
import { OrderStatus, PaymentMethod, type Prisma } from '@prisma/client';
import { createRouter, deliveryRegistry, idParam } from '../lib/router';
import { prisma } from '../lib/prisma';
import { conflict, forbidden, notFound } from '../lib/errors';
import { now, TZ } from '../lib/time';
import { assertCanView, loadOrder, orderInclude, serializeOrder } from '../modules/orders/orders.service';
import { confirm3ds, payByCard } from '../modules/payments/payments.service';
import { TEST_CARDS } from '../modules/payments/sandbox';
import * as svc from './delivery.service';

const money = z.number().int().min(0).max(100_000_000);
const lineSchema = z.object({
  dishId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(50),
  notes: z.string().trim().max(255).optional(),
});
const itemsSchema = z.array(lineSchema).min(1, 'Додайте хоча б одну страву').max(40);
const addressSchema = z.object({
  zoneId: z.number().int().positive(),
  street: z.string().trim().min(2, 'Вкажіть вулицю').max(120),
  house: z.string().trim().min(1, 'Вкажіть номер будинку').max(20),
  apartment: z.string().trim().max(20).optional(),
  entrance: z.string().trim().max(10).optional(),
  floor: z.string().trim().max(10).optional(),
  comment: z.string().trim().max(255).optional(),
});

// ─────────────────────────────── Профіль (SSO з Restaurant API) ───────────────────────────────

const me = createRouter('', deliveryRegistry);
me.define({
  method: 'get',
  path: '/me',
  summary: 'Поточний користувач (той самий JWT, що видає Restaurant API)',
  tags: ['Auth'],
  auth: true,
  handler: ({ user }) => user,
});

// ─────────────────────────────── Зони, години, вартість ───────────────────────────────

const zones = createRouter('/delivery', deliveryRegistry);

zones.define({
  method: 'get',
  path: '/info',
  summary: 'Чи працює доставка зараз, години, зони і прогноз часу',
  tags: ['Delivery'],
  handler: async () => {
    const list = await prisma.deliveryZone.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
    return {
      window: svc.deliveryWindow(),
      // типовий час до передачі курʼєру (страва 15 хв + поточна черга кухні)
      kitchenEtaMin: await svc.estimateDeliveryMinutes(prisma, 15, 0),
      zones: list,
      fromPrice: list.length ? Math.min(...list.map((z) => z.fee)) : null,
      minOrderFrom: list.length ? Math.min(...list.map((z) => z.minOrder)) : null,
    };
  },
});

zones.define({
  method: 'get',
  path: '/zones',
  summary: 'Зони доставки (адміністратор бачить і неактивні)',
  tags: ['Delivery zones'],
  auth: 'optional',
  query: z.object({ all: z.stringbool().optional() }),
  handler: ({ user, query }) =>
    prisma.deliveryZone.findMany({
      where: query.all && user?.role === 'ADMIN' ? {} : { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    }),
});

const zoneBody = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(255).optional(),
  fee: money,
  minOrder: money,
  freeFrom: money.positive().nullable().optional(),
  travelMin: z.number().int().min(5).max(180),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

zones.define({
  method: 'post',
  path: '/zones',
  summary: 'Створити зону доставки',
  tags: ['Delivery zones'],
  roles: ['ADMIN'],
  status: 201,
  body: zoneBody,
  handler: ({ body }) => prisma.deliveryZone.create({ data: body }),
});

zones.define({
  method: 'patch',
  path: '/zones/:id',
  summary: 'Змінити зону: вартість, мінімальна сума, час у дорозі, увімкнути/вимкнути',
  tags: ['Delivery zones'],
  roles: ['ADMIN'],
  params: idParam,
  body: zoneBody.partial(),
  handler: ({ params, body }) => prisma.deliveryZone.update({ where: { id: params.id }, data: body }),
});

zones.define({
  method: 'post',
  path: '/quote',
  summary: 'Розрахунок: сума, вартість доставки, мінімальне замовлення і прогноз часу',
  tags: ['Delivery'],
  body: z.object({ zoneId: z.number().int().positive(), items: itemsSchema }),
  handler: ({ body }) => svc.quote(body),
});

// ─────────────────────────────── Адреси клієнта ───────────────────────────────

const addresses = createRouter('/addresses', deliveryRegistry);
const addressInclude = { zone: { select: { id: true, name: true, fee: true, minOrder: true, freeFrom: true, travelMin: true, isActive: true } } };

addresses.define({
  method: 'get',
  path: '/',
  summary: 'Мої збережені адреси',
  tags: ['Addresses'],
  roles: ['CLIENT'],
  handler: ({ user }) =>
    prisma.address.findMany({ where: { userId: user!.id }, include: addressInclude, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] }),
});

addresses.define({
  method: 'post',
  path: '/',
  summary: 'Зберегти адресу',
  tags: ['Addresses'],
  roles: ['CLIENT'],
  status: 201,
  body: addressSchema.extend({ label: z.string().trim().min(1).max(40), isDefault: z.boolean().optional() }),
  handler: async ({ user, body }) => {
    await svc.activeZone(prisma, body.zoneId);
    const count = await prisma.address.count({ where: { userId: user!.id } });
    if (count >= 10) throw conflict('Можна зберегти до 10 адрес', 'TOO_MANY_ADDRESSES');
    const makeDefault = body.isDefault || count === 0;
    return prisma.$transaction(async (tx) => {
      if (makeDefault) await tx.address.updateMany({ where: { userId: user!.id }, data: { isDefault: false } });
      return tx.address.create({ data: { ...body, userId: user!.id, isDefault: makeDefault }, include: addressInclude });
    });
  },
});

addresses.define({
  method: 'patch',
  path: '/:id',
  summary: 'Змінити адресу або зробити її основною',
  tags: ['Addresses'],
  roles: ['CLIENT'],
  params: idParam,
  body: addressSchema.extend({ label: z.string().trim().min(1).max(40), isDefault: z.boolean() }).partial(),
  handler: async ({ user, params, body }) => {
    const a = await prisma.address.findUnique({ where: { id: params.id } });
    if (!a || a.userId !== user!.id) throw notFound('Адресу не знайдено', 'ADDRESS_NOT_FOUND');
    if (body.zoneId) await svc.activeZone(prisma, body.zoneId);
    return prisma.$transaction(async (tx) => {
      if (body.isDefault) await tx.address.updateMany({ where: { userId: user!.id, id: { not: a.id } }, data: { isDefault: false } });
      return tx.address.update({ where: { id: a.id }, data: body, include: addressInclude });
    });
  },
});

addresses.define({
  method: 'delete',
  path: '/:id',
  summary: 'Видалити адресу',
  tags: ['Addresses'],
  roles: ['CLIENT'],
  params: idParam,
  handler: async ({ user, params }) => {
    const a = await prisma.address.findUnique({ where: { id: params.id } });
    if (!a || a.userId !== user!.id) throw notFound('Адресу не знайдено', 'ADDRESS_NOT_FOUND');
    await prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id: a.id } });
      if (a.isDefault) {
        const next = await tx.address.findFirst({ where: { userId: user!.id }, orderBy: { createdAt: 'desc' } });
        if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
      }
    });
    return undefined;
  },
});

// ─────────────────────────────── Замовлення доставки ───────────────────────────────

const orders = createRouter('/delivery', deliveryRegistry);

orders.define({
  method: 'post',
  path: '/orders',
  summary: 'Оформити доставку',
  description:
    'Ціни — лише з БД; перевіряються стоп-лист, години доставки, активність зони і мінімальна сума. ' +
    'CASH — замовлення одразу CONFIRMED і зʼявляється на кухні (Restaurant API / Web). ' +
    'CARD — статус NEW до онлайн-оплати (POST /delivery/orders/:id/pay); неоплачене скасовується через 15 хв.',
  tags: ['Delivery orders'],
  roles: ['CLIENT'],
  status: 201,
  body: z
    .object({
      items: itemsSchema,
      addressId: z.number().int().positive().optional(),
      address: addressSchema.optional(),
      saveAddressAs: z.string().trim().min(1).max(40).optional(),
      recipientName: z.string().trim().max(100).optional(),
      phone: z.string().trim().min(9).max(20),
      paymentMethod: z.enum(PaymentMethod),
      changeFrom: money.positive().optional(),
      notes: z.string().trim().max(500).optional(),
    })
    .refine((b) => b.addressId || b.address, { message: 'Вкажіть адресу доставки', path: ['address'] }),
  responses: { 409: 'Доставка зачинена / зона неактивна / страва в стоп-листі', 422: 'Мінімальна сума, телефон, решта' },
  handler: ({ user, body }) => svc.createDeliveryOrder(user!, body),
});

orders.define({
  method: 'get',
  path: '/orders/my',
  summary: 'Мої доставки (історія та активні)',
  tags: ['Delivery orders'],
  roles: ['CLIENT'],
  query: z.object({ active: z.stringbool().optional() }),
  handler: async ({ user, query }) => {
    const list = await prisma.order.findMany({
      where: { userId: user!.id, type: 'DELIVERY', ...(query.active ? { status: { in: svc.ACTIVE_DELIVERY } } : {}) },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return list.map((o) => serializeOrder(o, user));
  },
});

orders.define({
  method: 'get',
  path: '/orders',
  summary: 'Диспетчерська: доставки за день (зал / адміністратор)',
  tags: ['Delivery orders'],
  roles: ['STAFF', 'ADMIN'],
  query: z.object({
    date: z.iso.date().optional(),
    status: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(',') : undefined))
      .pipe(z.array(z.enum(OrderStatus)).optional()),
  }),
  handler: async ({ user, query }) => {
    const day = query.date
      ? DateTime.fromISO(query.date, { zone: TZ() }).startOf('day')
      : DateTime.fromJSDate(now(), { zone: TZ() }).startOf('day');
    const where: Prisma.OrderWhereInput = {
      type: 'DELIVERY',
      createdAt: { gte: day.toJSDate(), lt: day.plus({ days: 1 }).toJSDate() },
      ...(query.status ? { status: { in: query.status } } : {}),
    };
    const list = await prisma.order.findMany({ where, include: orderInclude, orderBy: { createdAt: 'desc' } });
    return list.map((o) => serializeOrder(o, user));
  },
});

orders.define({
  method: 'get',
  path: '/orders/:id',
  summary: 'Деталі доставки з історією статусів',
  tags: ['Delivery orders'],
  auth: true,
  params: idParam,
  handler: async ({ user, params }) => {
    const o = await loadOrder(params.id);
    if (o.type !== 'DELIVERY') throw notFound('Замовлення доставки не знайдено');
    if (user!.role === 'KITCHEN') throw forbidden();
    assertCanView(user!, o);
    const history = await prisma.statusChange.findMany({
      where: { orderId: o.id },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { name: true, role: true } } },
    });
    return {
      ...serializeOrder(o, user),
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

orders.define({
  method: 'post',
  path: '/orders/:id/cancel',
  summary: 'Скасувати доставку (клієнт — до початку приготування; оплачене — з поверненням коштів)',
  tags: ['Delivery orders'],
  roles: ['CLIENT', 'STAFF', 'ADMIN'],
  params: idParam,
  body: z.object({ reason: z.string().trim().max(255).optional() }),
  handler: ({ user, params, body }) => svc.cancelDelivery(user!, params.id, body.reason),
});

orders.define({
  method: 'post',
  path: '/orders/:id/assign',
  summary: 'Призначити або зняти курʼєра (диспетчер)',
  tags: ['Delivery orders'],
  roles: ['STAFF', 'ADMIN'],
  params: idParam,
  body: z.object({ courierId: z.number().int().positive().nullable() }),
  handler: ({ user, params, body }) => svc.assignCourier(user!, params.id, body.courierId),
});

// ─────────────────────────────── Оплата доставки (sandbox) ───────────────────────────────

orders.define({
  method: 'get',
  path: '/test-cards',
  summary: 'Тестові картки sandbox-шлюзу',
  tags: ['Delivery payments'],
  handler: () =>
    Object.entries(TEST_CARDS).map(([number, v]) => ({ number: number.replace(/(\d{4})(?=\d)/g, '$1 '), label: v.label, outcome: v.outcome.kind })),
});

orders.define({
  method: 'post',
  path: '/orders/:id/pay',
  summary: 'Оплатити доставку карткою (sandbox, 3-D Secure, Idempotency-Key)',
  description: 'Після успішної оплати замовлення переходить у CONFIRMED і зʼявляється на kitchen display.',
  tags: ['Delivery payments'],
  roles: ['CLIENT'],
  params: idParam,
  body: z.object({
    tip: z.number().int().min(0).max(1_000_000).default(0),
    card: z.object({
      number: z.string().trim().min(12).max(23),
      expMonth: z.number().int().min(1).max(12),
      expYear: z.number().int().min(0).max(2100),
      cvc: z.string().trim().min(3).max(4),
      holder: z.string().trim().max(100).optional(),
    }),
  }),
  responses: { 402: 'Картку відхилено', 409: 'Замовлення не очікує оплати', 422: 'Некоректні дані картки' },
  handler: ({ user, params, body, req }) =>
    payByCard(user!, {
      orderId: params.id,
      tip: body.tip,
      card: body.card,
      idempotencyKey: (req.headers['idempotency-key'] as string | undefined)?.slice(0, 80),
    }),
});

orders.define({
  method: 'post',
  path: '/payments/:id/confirm',
  summary: 'Підтвердження 3-D Secure (код sandbox: 123456)',
  tags: ['Delivery payments'],
  roles: ['CLIENT'],
  params: idParam,
  body: z.object({ otp: z.string().trim().regex(/^\d{4,8}$/, 'Код складається з цифр') }),
  handler: ({ user, params, body }) => confirm3ds(user!, params.id, body.otp),
});

// ─────────────────────────────── Курʼєр ───────────────────────────────

const courier = createRouter('/courier', deliveryRegistry);

courier.define({
  method: 'get',
  path: '/orders',
  summary: 'Замовлення курʼєра: available — шукають курʼєра; mine — мої активні; history — доставлені за 7 днів',
  tags: ['Courier'],
  roles: ['COURIER'],
  query: z.object({ scope: z.enum(['available', 'mine', 'history']).default('available') }),
  handler: ({ user, query }) => svc.listCourierOrders(user!, query.scope),
});

courier.define({
  method: 'get',
  path: '/summary',
  summary: 'Підсумок зміни курʼєра: доставлено, готівка на руках, чайові, середній час у дорозі',
  tags: ['Courier'],
  roles: ['COURIER'],
  handler: ({ user }) => svc.courierSummary(user!),
});

courier.define({
  method: 'post',
  path: '/orders/:id/accept',
  summary: 'Прийняти замовлення (поки готується або вже готове)',
  tags: ['Courier'],
  roles: ['COURIER'],
  params: idParam,
  responses: { 409: 'Вже взяв інший курʼєр / ліміт активних замовлень' },
  handler: ({ user, params }) => svc.acceptOrder(user!, params.id),
});

courier.define({
  method: 'post',
  path: '/orders/:id/release',
  summary: 'Відмовитися від замовлення (до того, як забрали)',
  tags: ['Courier'],
  roles: ['COURIER'],
  params: idParam,
  handler: ({ user, params }) => svc.releaseOrder(user!, params.id),
});

courier.define({
  method: 'post',
  path: '/orders/:id/pickup',
  summary: 'Забрав з кухні → «В дорозі» (лише коли кухня позначила «Готово»)',
  tags: ['Courier'],
  roles: ['COURIER', 'ADMIN'],
  params: idParam,
  handler: ({ user, params }) => svc.pickUp(user!, params.id),
});

courier.define({
  method: 'post',
  path: '/orders/:id/delivered',
  summary: 'Вручено клієнту (готівка — фіксується оплата курʼєру)',
  tags: ['Courier'],
  roles: ['COURIER', 'ADMIN'],
  params: idParam,
  body: z.object({ tip: z.number().int().min(0).max(1_000_000).optional() }),
  handler: ({ user, params, body }) => svc.markDelivered(user!, params.id, body),
});

courier.define({
  method: 'get',
  path: '/couriers',
  summary: 'Курʼєри та їх поточне навантаження (для диспетчера)',
  tags: ['Courier'],
  roles: ['STAFF', 'ADMIN'],
  handler: async () => {
    const couriers = await prisma.user.findMany({
      where: { role: 'COURIER', isActive: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: 'asc' },
    });
    const loads = await prisma.delivery.groupBy({
      by: ['courierId'],
      where: { courierId: { in: couriers.map((c) => c.id) }, order: { status: { in: ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERING'] } } },
      _count: { _all: true },
    });
    const byId = new Map(loads.map((l) => [l.courierId, l._count._all]));
    return couriers.map((c) => ({ ...c, active: byId.get(c.id) ?? 0 }));
  },
});

export const deliveryRouters = [
  { path: '/api', router: me.router },
  { path: '/api/delivery', router: zones.router },
  { path: '/api/addresses', router: addresses.router },
  { path: '/api/delivery', router: orders.router },
  { path: '/api/courier', router: courier.router },
];
