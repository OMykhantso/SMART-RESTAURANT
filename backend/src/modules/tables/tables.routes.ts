import { z } from 'zod';
import QRCode from 'qrcode';
import { TableShape, TableZone } from '@prisma/client';
import { createRouter, idParam } from '../../lib/router';
import { prisma } from '../../lib/prisma';
import { conflict, notFound } from '../../lib/errors';
import { randomToken } from '../../lib/http';
import { emit } from '../../lib/realtime';
import { formatHm, now } from '../../lib/time';

const { router, define } = createRouter('/tables');

export const tableQrPayload = (qrToken: string) => `smartrest://table/${qrToken}`;

const publicSelect = {
  id: true,
  number: true,
  seats: true,
  zone: true,
  shape: true,
  posX: true,
  posY: true,
  isActive: true,
  description: true,
} as const;

define({
  method: 'get',
  path: '/',
  summary: 'Список столиків (план залу)',
  tags: ['Tables'],
  auth: 'optional',
  query: z.object({ includeInactive: z.stringbool().optional() }),
  handler: ({ query, user }) =>
    prisma.diningTable.findMany({
      where: query.includeInactive && user?.role === 'ADMIN' ? {} : { isActive: true },
      select: publicSelect,
      orderBy: { number: 'asc' },
    }),
});

/**
 * Живий стан залу для працівників: зайнятість, найближчі бронювання,
 * активні замовлення та «сигнали» (страви готові до подачі, очікується оплата).
 */
define({
  method: 'get',
  path: '/live',
  summary: 'Живий стан залу: хто сидить, наступні бронювання, сигнали для офіціанта',
  tags: ['Tables'],
  roles: ['STAFF', 'KITCHEN', 'ADMIN'],
  handler: async () => {
    const t = now();
    const horizon = new Date(t.getTime() + 3 * 3600000);
    const [tables, reservations] = await Promise.all([
      prisma.diningTable.findMany({ where: { isActive: true }, orderBy: { number: 'asc' } }),
      prisma.reservation.findMany({
        where: {
          OR: [
            { status: 'CHECKED_IN' },
            { status: { in: ['PENDING', 'CONFIRMED'] }, startAt: { lt: horizon }, endAt: { gt: t } },
          ],
        },
        include: {
          user: { select: { name: true, phone: true } },
          orders: { select: { id: true, status: true, total: true } },
        },
        orderBy: { startAt: 'asc' },
      }),
    ]);

    return tables.map((table) => {
      const current = reservations.find((r) => r.tableId === table.id && r.status === 'CHECKED_IN') ?? null;
      const upcoming = reservations.filter((r) => r.tableId === table.id && r.status !== 'CHECKED_IN');
      const next = upcoming[0] ?? null;
      const minutesToNext = next ? Math.round((next.startAt.getTime() - t.getTime()) / 60000) : null;
      let state: 'FREE' | 'OCCUPIED' | 'RESERVED_SOON' | 'LATE' = 'FREE';
      if (current) state = 'OCCUPIED';
      else if (next && minutesToNext !== null && minutesToNext <= 60) state = minutesToNext < 0 ? 'LATE' : 'RESERVED_SOON';

      const orders = current?.orders ?? [];
      return {
        id: table.id,
        number: table.number,
        seats: table.seats,
        zone: table.zone,
        shape: table.shape,
        posX: table.posX,
        posY: table.posY,
        state,
        current: current
          ? {
              reservationId: current.id,
              code: current.code,
              guestName: current.user?.name ?? current.guestName,
              guests: current.guests,
              since: current.checkedInAt,
              until: current.endAt,
              untilTime: formatHm(current.endAt),
              ordersTotal: orders.filter((o) => o.status !== 'CANCELLED').reduce((s, o) => s + o.total, 0),
              activeOrders: orders.filter((o) => !['PAID', 'CANCELLED'].includes(o.status)).length,
            }
          : null,
        next: next
          ? {
              reservationId: next.id,
              code: next.code,
              status: next.status,
              guestName: next.user?.name ?? next.guestName,
              guests: next.guests,
              startAt: next.startAt,
              time: formatHm(next.startAt),
              minutesToStart: minutesToNext,
            }
          : null,
        signals: {
          newOrders: orders.filter((o) => o.status === 'NEW').length,
          readyToServe: orders.filter((o) => o.status === 'READY').length,
          awaitingPayment: orders.filter((o) => o.status === 'SERVED').length,
        },
      };
    });
  },
});

const tableBody = z.object({
  number: z.number().int().positive().max(999),
  seats: z.number().int().min(1).max(20),
  zone: z.enum(TableZone).default('HALL'),
  shape: z.enum(TableShape).default('SQUARE'),
  posX: z.number().min(0).max(100).default(50),
  posY: z.number().min(0).max(100).default(50),
  description: z.string().trim().max(255).nullable().optional(),
  isActive: z.boolean().optional(),
});

define({
  method: 'post',
  path: '/',
  summary: 'Додати столик',
  tags: ['Tables'],
  roles: ['ADMIN'],
  status: 201,
  body: tableBody,
  handler: async ({ body }) => {
    const exists = await prisma.diningTable.findUnique({ where: { number: body.number } });
    if (exists) throw conflict(`Столик №${body.number} вже існує`, 'TABLE_NUMBER_TAKEN');
    const table = await prisma.diningTable.create({ data: { ...body, qrToken: randomToken(16) }, select: publicSelect });
    emit('tables:changed', { tableId: table.id }, { staff: true });
    return table;
  },
});

define({
  method: 'patch',
  path: '/:id',
  summary: 'Редагувати столик (у т.ч. позицію на плані залу)',
  tags: ['Tables'],
  roles: ['ADMIN'],
  params: idParam,
  body: tableBody.partial(),
  handler: async ({ params, body }) => {
    if (body.isActive === false) {
      const active = await prisma.reservation.count({
        where: { tableId: params.id, status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] }, endAt: { gt: now() } },
      });
      if (active > 0) {
        throw conflict(`На столику є ${active} активних бронювань — спочатку пересадіть гостей`, 'TABLE_HAS_RESERVATIONS');
      }
    }
    const table = await prisma.diningTable.update({ where: { id: params.id }, data: body, select: publicSelect });
    emit('tables:changed', { tableId: table.id }, { staff: true });
    return table;
  },
});

define({
  method: 'delete',
  path: '/:id',
  summary: 'Видалити столик (деактивація, якщо є історія бронювань)',
  tags: ['Tables'],
  roles: ['ADMIN'],
  params: idParam,
  handler: async ({ params }) => {
    const active = await prisma.reservation.count({
      where: { tableId: params.id, status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] }, endAt: { gt: now() } },
    });
    if (active > 0) throw conflict('На столику є активні бронювання', 'TABLE_HAS_RESERVATIONS');
    const history = await prisma.reservation.count({ where: { tableId: params.id } });
    if (history > 0) {
      await prisma.diningTable.update({ where: { id: params.id }, data: { isActive: false } });
      emit('tables:changed', { tableId: params.id }, { staff: true });
      return { deactivated: true };
    }
    await prisma.diningTable.delete({ where: { id: params.id } });
    emit('tables:changed', { tableId: params.id }, { staff: true });
    return { deleted: true };
  },
});

define({
  method: 'get',
  path: '/:id/qr',
  summary: 'QR-код столика (SVG / PNG / JSON) для друку та check-in',
  tags: ['Tables', 'QR'],
  roles: ['STAFF', 'ADMIN'],
  params: idParam,
  query: z.object({ format: z.enum(['svg', 'png', 'json']).default('svg') }),
  handler: async ({ params, query, res }) => {
    const table = await prisma.diningTable.findUnique({ where: { id: params.id } });
    if (!table) throw notFound('Столик не знайдено');
    const payload = tableQrPayload(table.qrToken);
    if (query.format === 'json') return { tableId: table.id, number: table.number, payload };
    if (query.format === 'png') {
      const png = await QRCode.toBuffer(payload, { width: 600, margin: 2, errorCorrectionLevel: 'M' });
      res.type('png').send(png);
      return undefined;
    }
    const svg = await QRCode.toString(payload, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
    res.type('image/svg+xml').send(svg);
    return undefined;
  },
});

define({
  method: 'post',
  path: '/:id/qr/rotate',
  summary: 'Перевипустити QR-код столика (старий стає недійсним)',
  tags: ['Tables', 'QR'],
  roles: ['ADMIN'],
  params: idParam,
  handler: async ({ params }) => {
    const table = await prisma.diningTable.update({ where: { id: params.id }, data: { qrToken: randomToken(16) } });
    return { tableId: table.id, payload: tableQrPayload(table.qrToken) };
  },
});

export default router;
