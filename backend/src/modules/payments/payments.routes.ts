import { z } from 'zod';
import { DateTime } from 'luxon';
import { createRouter, idParam } from '../../lib/router';
import { prisma } from '../../lib/prisma';
import { now, TZ } from '../../lib/time';
import * as svc from './payments.service';
import { TEST_CARDS } from './sandbox';

const { router, define } = createRouter('/payments');

define({
  method: 'get',
  path: '/test-cards',
  summary: 'Тестові картки sandbox-шлюзу',
  tags: ['Payments (sandbox)'],
  handler: () =>
    Object.entries(TEST_CARDS).map(([number, v]) => ({
      number: number.replace(/(\d{4})(?=\d)/g, '$1 '),
      label: v.label,
      outcome: v.outcome.kind,
    })),
});

define({
  method: 'post',
  path: '/card',
  summary: 'Оплата замовлення карткою через sandbox-шлюз',
  description:
    'Дозволено лише для замовлень у статусі SERVED. Заголовок Idempotency-Key захищає від подвійного списання. ' +
    'Відповідь 402 — картку відхилено; requiresAction=true — потрібне підтвердження 3-D Secure.',
  tags: ['Payments (sandbox)'],
  roles: ['CLIENT', 'STAFF', 'ADMIN'],
  body: z.object({
    orderId: z.number().int().positive(),
    tip: z.number().int().min(0).max(1_000_000).default(0),
    card: z.object({
      number: z.string().trim().min(12).max(23),
      expMonth: z.number().int().min(1).max(12),
      expYear: z.number().int().min(0).max(2100),
      cvc: z.string().trim().min(3).max(4),
      holder: z.string().trim().max(100).optional(),
    }),
  }),
  responses: { 200: 'Оплачено або потрібна 3DS-дія', 402: 'Картку відхилено', 409: 'Замовлення не можна оплатити', 422: 'Некоректні дані картки' },
  handler: ({ user, body, req }) =>
    svc.payByCard(user!, {
      ...body,
      idempotencyKey: (req.headers['idempotency-key'] as string | undefined)?.slice(0, 80),
    }),
});

define({
  method: 'post',
  path: '/:id/confirm',
  summary: 'Підтвердження 3-D Secure (одноразовий код)',
  tags: ['Payments (sandbox)'],
  roles: ['CLIENT', 'STAFF', 'ADMIN'],
  params: idParam,
  body: z.object({ otp: z.string().trim().regex(/^\d{4,8}$/, 'Код складається з цифр') }),
  handler: ({ user, params, body }) => svc.confirm3ds(user!, params.id, body.otp),
});

define({
  method: 'post',
  path: '/cash',
  summary: 'Зафіксувати оплату готівкою / терміналом (офіціант)',
  tags: ['Payments (sandbox)'],
  roles: ['STAFF', 'ADMIN'],
  body: z.object({ orderId: z.number().int().positive(), tip: z.number().int().min(0).default(0) }),
  handler: ({ user, body }) => svc.payCash(user!, body.orderId, body.tip),
});

define({
  method: 'get',
  path: '/',
  summary: 'Журнал платежів за день',
  tags: ['Payments (sandbox)'],
  roles: ['STAFF', 'ADMIN'],
  query: z.object({ date: z.iso.date().optional() }),
  handler: async ({ query }) => {
    const day = query.date
      ? DateTime.fromISO(query.date, { zone: TZ() }).startOf('day')
      : DateTime.fromJSDate(now(), { zone: TZ() }).startOf('day');
    const payments = await prisma.payment.findMany({
      where: { createdAt: { gte: day.toJSDate(), lt: day.plus({ days: 1 }).toJSDate() } },
      orderBy: { createdAt: 'desc' },
      include: { order: { select: { table: { select: { number: true } } } } },
    });
    return payments.map((p) => ({ ...svc.serializePayment(p), tableNumber: p.order.table.number }));
  },
});

export default router;
