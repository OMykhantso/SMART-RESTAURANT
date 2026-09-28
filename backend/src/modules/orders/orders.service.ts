import type { OrderItemStatus, OrderStatus, Prisma } from '@prisma/client';
import { prisma, type Tx } from '../../lib/prisma';
import { restaurant } from '../../config';
import { conflict, forbidden, notFound, unprocessable } from '../../lib/errors';
import { emit } from '../../lib/realtime';
import { now } from '../../lib/time';
import { actorsFor, assertTransition, canTransition, ORDER_FLOW, ORDER_LABELS } from '../../lib/stateMachine';
import type { AuthUser } from '../../middleware/auth';
import { logStatus } from '../reservations/reservations.service';

export const orderInclude = {
  items: {
    include: { dish: { select: { id: true, name: true, imageUrl: true, prepTimeMin: true, category: { select: { name: true, emoji: true, slug: true } } } } },
    orderBy: { id: 'asc' },
  },
  table: { select: { id: true, number: true, zone: true } },
  user: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true, role: true } },
  payments: { orderBy: { createdAt: 'desc' } },
  reviews: { select: { id: true } },
  reservation: { select: { id: true, code: true, status: true, guests: true } },
} satisfies Prisma.OrderInclude;

export type OrderFull = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export function serializeOrder(o: OrderFull, viewer?: AuthUser | 'SYSTEM') {
  const actors = viewer && viewer !== 'SYSTEM' ? actorsFor(viewer, o.userId) : [];
  const success = o.payments.find((p) => p.status === 'SUCCEEDED') ?? null;
  const pending = o.payments.find((p) => p.status === 'REQUIRES_ACTION') ?? null;
  const t = now().getTime();
  return {
    id: o.id,
    number: o.id,
    status: o.status,
    statusLabel: ORDER_LABELS[o.status],
    reservationId: o.reservationId,
    reservation: o.reservation,
    table: o.table,
    user: o.user,
    createdBy: o.createdBy,
    items: o.items.map((i) => ({
      id: i.id,
      dishId: i.dishId,
      name: i.dish.name,
      imageUrl: i.dish.imageUrl,
      category: i.dish.category,
      prepTimeMin: i.dish.prepTimeMin,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.unitPrice * i.quantity,
      notes: i.notes,
      status: i.status,
    })),
    itemsCount: o.items.reduce((s, i) => s + i.quantity, 0),
    subtotal: o.subtotal,
    total: o.total,
    notes: o.notes,
    cancelReason: o.cancelReason,
    estimatedReadyAt: o.estimatedReadyAt,
    etaMinutes:
      o.estimatedReadyAt && ['NEW', 'CONFIRMED', 'PREPARING'].includes(o.status)
        ? Math.max(0, Math.round((o.estimatedReadyAt.getTime() - t) / 60000))
        : null,
    createdAt: o.createdAt,
    confirmedAt: o.confirmedAt,
    preparingAt: o.preparingAt,
    readyAt: o.readyAt,
    servedAt: o.servedAt,
    paidAt: o.paidAt,
    cancelledAt: o.cancelledAt,
    payment: success
      ? {
          id: success.id,
          method: success.method,
          amount: success.amount,
          tip: success.tip,
          cardBrand: success.cardBrand,
          cardLast4: success.cardLast4,
          providerRef: success.providerRef,
          paidAt: success.paidAt,
        }
      : null,
    pendingPaymentId: pending?.id ?? null,
    hasReview: o.reviews.length > 0,
    actions: {
      canConfirm: canTransition(ORDER_FLOW, o.status, 'CONFIRMED', actors),
      canStart: canTransition(ORDER_FLOW, o.status, 'PREPARING', actors),
      canReady: canTransition(ORDER_FLOW, o.status, 'READY', actors),
      canServe: canTransition(ORDER_FLOW, o.status, 'SERVED', actors),
      canCancel: canTransition(ORDER_FLOW, o.status, 'CANCELLED', actors),
      canPay: o.status === 'SERVED' && (actors.includes('OWNER') || actors.includes('STAFF') || actors.includes('ADMIN')),
      canReview: o.status === 'PAID' && actors.includes('OWNER') && o.reviews.length === 0,
    },
  };
}

function broadcast(o: OrderFull, event: 'order:created' | 'order:updated') {
  const payload = { id: o.id, status: o.status, tableId: o.tableId, tableNumber: o.table.number, userId: o.userId };
  const toKitchen = ['CONFIRMED', 'PREPARING', 'READY', 'CANCELLED'].includes(o.status) || event === 'order:updated';
  emit(event, payload, { userId: o.userId, staff: true, kitchen: toKitchen });
  emit('tables:changed', { tableId: o.tableId }, { staff: true });
}

export async function loadOrder(id: number, db: Tx = prisma) {
  const o = await db.order.findUnique({ where: { id }, include: orderInclude });
  if (!o) throw notFound('Замовлення не знайдено');
  return o;
}

export function assertCanView(actor: AuthUser, o: { userId: number | null }) {
  if (actor.role === 'CLIENT' && o.userId !== actor.id) throw forbidden('Це не ваше замовлення');
}

/**
 * ПРОГНОЗ ЧАСУ ГОТОВНОСТІ (ETA).
 * Кухня має N паралельних станцій. Черга = замовлення, прийняті раніше і ще не готові.
 * Залишкове навантаження черги ділимо на N і додаємо час приготування найдовшої страви.
 */
export async function estimateReadyAt(db: Tx, orderId: number, maxPrepMin: number, startedAt?: Date | null) {
  const t = now();
  if (startedAt) return new Date(startedAt.getTime() + maxPrepMin * 60000);
  const queue = await db.order.findMany({
    where: { status: { in: ['CONFIRMED', 'PREPARING'] }, id: { not: orderId }, createdAt: { lte: t } },
    include: { items: { include: { dish: { select: { prepTimeMin: true } } } } },
  });
  let loadMin = 0;
  for (const q of queue) {
    const prep = Math.max(0, ...q.items.map((i) => i.dish.prepTimeMin));
    const elapsed = q.preparingAt ? (t.getTime() - q.preparingAt.getTime()) / 60000 : 0;
    loadMin += Math.max(0, prep - elapsed);
  }
  const waitMin = loadMin / restaurant.kitchenParallelism;
  return new Date(t.getTime() + (waitMin + maxPrepMin) * 60000);
}

export interface CreateOrderInput {
  reservationId?: number;
  tableId?: number;
  items: { dishId: number; quantity: number; notes?: string }[];
  notes?: string;
}

export async function createOrder(actor: AuthUser, input: CreateOrderInput) {
  const isStaff = actor.role === 'STAFF' || actor.role === 'ADMIN';
  if (!isStaff && actor.role !== 'CLIENT') throw forbidden('Ця роль не може створювати замовлення');

  const order = await prisma.$transaction(async (tx) => {
    // 1. Замовлення завжди привʼязане до візиту в ресторані (CHECKED_IN)
    let reservation;
    if (!isStaff) {
      reservation = await tx.reservation.findFirst({
        where: {
          userId: actor.id,
          status: 'CHECKED_IN',
          ...(input.reservationId ? { id: input.reservationId } : {}),
        },
      });
      if (!reservation) {
        throw conflict(
          'Щоб зробити замовлення, спершу виконайте check-in — відскануйте QR-код на вашому столику',
          'NOT_CHECKED_IN',
        );
      }
    } else {
      reservation = input.reservationId
        ? await tx.reservation.findUnique({ where: { id: input.reservationId } })
        : input.tableId
          ? await tx.reservation.findFirst({ where: { tableId: input.tableId, status: 'CHECKED_IN' } })
          : null;
      if (!reservation) throw conflict('За цим столиком зараз немає гостей (потрібен check-in)', 'TABLE_NOT_OCCUPIED');
      if (reservation.status !== 'CHECKED_IN') {
        throw conflict('Замовлення можна створити лише для гостей, які вже в ресторані', 'NOT_CHECKED_IN');
      }
    }

    // 2. Обʼєднуємо однакові позиції та перевіряємо наявність страв
    const merged = new Map<string, { dishId: number; quantity: number; notes?: string }>();
    for (const item of input.items) {
      const key = `${item.dishId}|${item.notes ?? ''}`;
      const prev = merged.get(key);
      if (prev) prev.quantity += item.quantity;
      else merged.set(key, { ...item });
    }
    const lines = [...merged.values()];
    if (lines.some((l) => l.quantity > 50)) throw unprocessable('Максимум 50 порцій однієї страви', 'QUANTITY_TOO_LARGE');

    const dishes = await tx.dish.findMany({ where: { id: { in: lines.map((l) => l.dishId) } } });
    const byId = new Map(dishes.map((d) => [d.id, d]));
    const missing = lines.filter((l) => !byId.has(l.dishId));
    if (missing.length) throw unprocessable('Деяких страв не існує', 'DISH_NOT_FOUND', { dishIds: missing.map((m) => m.dishId) });
    const unavailable = lines.map((l) => byId.get(l.dishId)!).filter((d) => !d.isAvailable || d.isArchived);
    if (unavailable.length) {
      throw conflict(
        `Зараз недоступно: ${unavailable.map((d) => d.name).join(', ')}`,
        'DISH_UNAVAILABLE',
        { dishIds: unavailable.map((d) => d.id) },
      );
    }

    // 3. Ціни беремо лише з БД (клієнт не може підмінити вартість)
    const subtotal = lines.reduce((s, l) => s + byId.get(l.dishId)!.price * l.quantity, 0);
    const status: OrderStatus = isStaff ? 'CONFIRMED' : 'NEW';
    const t = now();
    const created = await tx.order.create({
      data: {
        reservationId: reservation.id,
        tableId: reservation.tableId,
        userId: reservation.userId,
        createdById: actor.id,
        status,
        subtotal,
        total: subtotal,
        notes: input.notes,
        confirmedAt: isStaff ? t : null,
        items: {
          create: lines.map((l) => ({
            dishId: l.dishId,
            quantity: l.quantity,
            unitPrice: byId.get(l.dishId)!.price,
            notes: l.notes,
          })),
        },
      },
    });
    const maxPrep = Math.max(...lines.map((l) => byId.get(l.dishId)!.prepTimeMin));
    await tx.order.update({
      where: { id: created.id },
      data: { estimatedReadyAt: await estimateReadyAt(tx, created.id, maxPrep) },
    });
    await logStatus(tx, { orderId: created.id }, null, status, actor.id);
    return loadOrder(created.id, tx);
  });

  broadcast(order, 'order:created');
  return serializeOrder(order, actor);
}

export async function transitionOrder(
  actor: AuthUser | 'SYSTEM',
  id: number,
  to: OrderStatus,
  opts: { reason?: string; db?: Tx } = {},
) {
  const run = async (tx: Tx) => {
    // блокуємо рядок замовлення, щоб паралельні зміни статусу не перетиралися
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
    const o = await loadOrder(id, tx);
    const actors = actorsFor(actor, o.userId);
    if (actor !== 'SYSTEM' && actor.role === 'CLIENT' && o.userId !== actor.id) throw forbidden('Це не ваше замовлення');
    assertTransition(ORDER_FLOW, ORDER_LABELS, o.status, to, actors);

    const t = now();
    const data: Prisma.OrderUpdateInput = { status: to };
    const maxPrep = Math.max(1, ...o.items.map((i) => i.dish.prepTimeMin));
    let itemStatus: OrderItemStatus | null = null;
    switch (to) {
      case 'CONFIRMED':
        data.confirmedAt = t;
        data.estimatedReadyAt = await estimateReadyAt(tx, o.id, maxPrep);
        break;
      case 'PREPARING':
        data.preparingAt = t;
        data.estimatedReadyAt = await estimateReadyAt(tx, o.id, maxPrep, t);
        itemStatus = 'COOKING';
        break;
      case 'READY':
        data.readyAt = t;
        itemStatus = 'READY';
        break;
      case 'SERVED':
        data.servedAt = t;
        break;
      case 'PAID':
        data.paidAt = t;
        break;
      case 'CANCELLED':
        if (actor !== 'SYSTEM' && actor.role !== 'CLIENT' && !opts.reason) {
          throw unprocessable('Вкажіть причину скасування', 'REASON_REQUIRED');
        }
        data.cancelledAt = t;
        data.cancelReason = opts.reason ?? 'Скасовано гостем';
        break;
    }
    await tx.order.update({ where: { id }, data });
    if (itemStatus === 'COOKING') {
      await tx.orderItem.updateMany({ where: { orderId: id, status: 'QUEUED' }, data: { status: 'COOKING' } });
    } else if (itemStatus === 'READY') {
      await tx.orderItem.updateMany({ where: { orderId: id }, data: { status: 'READY' } });
    }
    await logStatus(tx, { orderId: id }, o.status, to, actor === 'SYSTEM' ? null : actor.id, opts.reason);
    return loadOrder(id, tx);
  };

  const updated = opts.db ? await run(opts.db) : await prisma.$transaction(run);
  if (!opts.db) broadcast(updated, 'order:updated');
  return updated;
}

/**
 * Kitchen display: кухар відмічає окремі страви.
 * Перша страва «в роботі» → замовлення автоматично PREPARING;
 * усі страви готові → замовлення автоматично READY.
 */
export async function setItemStatus(actor: AuthUser, orderId: number, itemId: number, status: OrderItemStatus) {
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
    const o = await loadOrder(orderId, tx);
    if (!['CONFIRMED', 'PREPARING'].includes(o.status)) {
      throw conflict(`Замовлення у статусі «${ORDER_LABELS[o.status]}» — зміна страв недоступна`, 'ORDER_NOT_IN_KITCHEN');
    }
    const item = o.items.find((i) => i.id === itemId);
    if (!item) throw notFound('Позицію не знайдено');

    if (o.status === 'CONFIRMED' && status !== 'QUEUED') {
      // кухар взявся за першу страву — замовлення автоматично переходить у «Готується»
      await transitionOrder(actor, orderId, 'PREPARING', { db: tx });
    }
    await tx.orderItem.update({ where: { id: itemId }, data: { status } });
    const items = await tx.orderItem.findMany({ where: { orderId } });
    if (items.every((i) => i.status === 'READY')) {
      await transitionOrder(actor, orderId, 'READY', { db: tx, reason: 'Усі страви готові' });
    }
    return loadOrder(orderId, tx);
  });
  broadcast(updated, 'order:updated');
  return serializeOrder(updated, actor);
}
