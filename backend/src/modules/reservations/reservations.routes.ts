import { z } from 'zod';
import { DateTime } from 'luxon';
import { Prisma, ReservationStatus, TableZone } from '@prisma/client';
import { createRouter, idParam } from '../../lib/router';
import { prisma } from '../../lib/prisma';
import { badRequest } from '../../lib/errors';
import { now, TZ } from '../../lib/time';
import * as svc from './reservations.service';

const { router, define } = createRouter('/reservations');

const isoDateTime = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

define({
  method: 'post',
  path: '/',
  summary: 'Створити бронювання (booking engine підбирає оптимальний столик)',
  description:
    'Клієнт: статус PENDING (очікує підтвердження). Працівник (бронювання по телефону): одразу CONFIRMED, потрібне guestName. ' +
    'Якщо tableId не вказано — столик обирається алгоритмом best-fit. При конфлікті — 409 з альтернативними слотами.',
  tags: ['Reservations'],
  roles: ['CLIENT', 'STAFF', 'ADMIN'],
  status: 201,
  body: z.object({
    startAt: isoDateTime,
    guests: z.number().int().min(1).max(20),
    tableId: z.number().int().positive().optional(),
    zone: z.enum(TableZone).optional(),
    notes: z.string().trim().max(500).optional(),
    guestName: z.string().trim().min(2).max(100).optional(),
    guestPhone: z.string().trim().max(20).optional(),
    source: z.enum(['APP', 'WEB', 'STAFF']).optional(),
  }),
  responses: { 201: 'Бронювання створено', 409: 'Конфлікт (столик зайнятий / немає місць)', 422: 'Порушено правила бронювання' },
  handler: ({ user, body }) => svc.createReservation(user!, body),
});

define({
  method: 'get',
  path: '/my',
  summary: 'Мої бронювання (клієнт)',
  tags: ['Reservations'],
  auth: true,
  query: z.object({ scope: z.enum(['upcoming', 'past', 'all']).default('all') }),
  handler: async ({ user, query }) => {
    const t = now();
    const where: Prisma.ReservationWhereInput = { userId: user!.id };
    if (query.scope === 'upcoming') {
      where.status = { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] };
    } else if (query.scope === 'past') {
      where.OR = [{ status: { in: ['COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW'] } }, { endAt: { lt: t } }];
    }
    const list = await prisma.reservation.findMany({
      where,
      include: svc.reservationInclude,
      orderBy: { startAt: query.scope === 'upcoming' ? 'asc' : 'desc' },
      take: 100,
    });
    return list.map((r) => svc.serializeReservation(r, user));
  },
});

define({
  method: 'get',
  path: '/current',
  summary: 'Поточний активний візит клієнта (CHECKED_IN) або найближче бронювання',
  tags: ['Reservations'],
  auth: true,
  handler: async ({ user }) => {
    const [active, next] = await Promise.all([
      prisma.reservation.findFirst({
        where: { userId: user!.id, status: 'CHECKED_IN' },
        include: svc.reservationInclude,
      }),
      prisma.reservation.findFirst({
        where: { userId: user!.id, status: { in: ['PENDING', 'CONFIRMED'] }, endAt: { gt: now() } },
        include: svc.reservationInclude,
        orderBy: { startAt: 'asc' },
      }),
    ]);
    return {
      active: active ? svc.serializeReservation(active, user) : null,
      next: next ? svc.serializeReservation(next, user) : null,
    };
  },
});

define({
  method: 'get',
  path: '/',
  summary: 'Бронювання ресторану за день (працівник): фільтр за статусом, пошук',
  tags: ['Reservations'],
  roles: ['STAFF', 'ADMIN'],
  query: z.object({
    date: z.iso.date().optional(),
    status: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(',') : undefined))
      .pipe(z.array(z.enum(ReservationStatus)).optional()),
    search: z.string().trim().max(100).optional(),
    tableId: z.coerce.number().int().positive().optional(),
  }),
  handler: async ({ user, query }) => {
    const where: Prisma.ReservationWhereInput = {};
    if (query.date) {
      const day = DateTime.fromISO(query.date, { zone: TZ() }).startOf('day');
      where.startAt = { gte: day.toJSDate(), lt: day.plus({ days: 1 }).toJSDate() };
    }
    if (query.status) where.status = { in: query.status };
    if (query.tableId) where.tableId = query.tableId;
    if (query.search) {
      where.OR = [
        { code: { contains: query.search, mode: 'insensitive' } },
        { guestName: { contains: query.search, mode: 'insensitive' } },
        { guestPhone: { contains: query.search } },
        { user: { name: { contains: query.search, mode: 'insensitive' } } },
        { user: { phone: { contains: query.search } } },
      ];
    }
    const list = await prisma.reservation.findMany({
      where,
      include: svc.reservationInclude,
      orderBy: { startAt: 'asc' },
      take: 300,
    });
    return list.map((r) => svc.serializeReservation(r, user));
  },
});

define({
  method: 'get',
  path: '/:id',
  summary: 'Деталі бронювання з історією змін статусу',
  tags: ['Reservations'],
  auth: true,
  params: idParam,
  handler: ({ user, params }) => svc.getReservation(user!, params.id),
});

define({
  method: 'patch',
  path: '/:id/status',
  summary: 'Змінити статус бронювання (підтвердити / відхилити / скасувати / check-in / завершити / no-show)',
  description:
    'Перевіряється скінченний автомат станів: допустимість переходу, права ролі та бізнес-умови ' +
    '(дедлайн скасування, вікно check-in, відсутність неоплачених замовлень тощо).',
  tags: ['Reservations'],
  auth: true,
  params: idParam,
  body: z.object({
    status: z.enum(ReservationStatus),
    reason: z.string().trim().max(255).optional(),
  }),
  responses: { 200: 'Статус змінено', 403: 'Роль не має права на цей перехід', 409: 'Недопустимий перехід / порушено умову' },
  handler: ({ user, params, body }) => svc.transitionReservation(user!, params.id, body.status, { reason: body.reason }),
});

define({
  method: 'patch',
  path: '/:id',
  summary: 'Пересадити гостей / змінити кількість гостей / нотатки (працівник)',
  tags: ['Reservations'],
  roles: ['STAFF', 'ADMIN'],
  params: idParam,
  body: z.object({
    tableId: z.number().int().positive().optional(),
    guests: z.number().int().min(1).max(20).optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  }),
  handler: ({ user, params, body }) => svc.updateReservation(user!, params.id, body),
});

define({
  method: 'post',
  path: '/check-in',
  summary: 'Check-in гостя працівником за QR-кодом бронювання або кодом R-XXXXXX',
  tags: ['Reservations', 'QR'],
  roles: ['STAFF', 'ADMIN'],
  body: z.object({
    qr: z.string().trim().max(200).optional(),
    code: z.string().trim().max(12).optional(),
  }),
  handler: ({ user, body }) => {
    if (body.qr) {
      const parsed = svc.parseReservationQr(body.qr);
      if (!parsed) throw badRequest('Це не QR-код бронювання Smart Restaurant', 'INVALID_QR');
      return svc.checkInByCode(user!, parsed.code, parsed.token);
    }
    if (body.code) return svc.checkInByCode(user!, body.code);
    throw badRequest('Передайте qr або code', 'VALIDATION_ERROR');
  },
});

define({
  method: 'post',
  path: '/scan-table',
  summary: 'Клієнт сканує QR-код столика: check-in за бронюванням або пропозиція walk-in',
  tags: ['Reservations', 'QR'],
  roles: ['CLIENT'],
  body: z.object({ qr: z.string().trim().min(1).max(200) }),
  handler: ({ user, body }) => {
    const token = svc.parseTableQr(body.qr) ?? body.qr;
    return svc.scanTable(user!, token);
  },
});

define({
  method: 'post',
  path: '/walk-in',
  summary: 'Walk-in: посадити гостя без бронювання (клієнт через QR столика або працівник)',
  tags: ['Reservations', 'QR'],
  roles: ['CLIENT', 'STAFF', 'ADMIN'],
  status: 201,
  body: z.object({
    qr: z.string().trim().max(200).optional(),
    tableId: z.number().int().positive().optional(),
    guests: z.number().int().min(1).max(20),
    guestName: z.string().trim().max(100).optional(),
  }),
  handler: ({ user, body }) => {
    const qrToken = body.qr ? (svc.parseTableQr(body.qr) ?? body.qr) : undefined;
    if (!qrToken && !body.tableId) throw badRequest('Передайте qr або tableId', 'VALIDATION_ERROR');
    return svc.createWalkIn(user!, { qrToken, tableId: body.tableId, guests: body.guests, guestName: body.guestName });
  },
});

export default router;
