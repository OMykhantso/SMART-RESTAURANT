import type { OrderItemStatus, OrderStatus, Prisma } from '@prisma/client';
import { prisma, type Tx } from '../../lib/prisma';
import { restaurant } from '../../config';
import { conflict, forbidden, notFound, unprocessable } from '../../lib/errors';
import { emit } from '../../lib/realtime';
import { now } from '../../lib/time';
import { actorsFor, assertTransition, canTransition, orderFlow, orderLabels } from '../../lib/stateMachine';
import { publishOrderEvent } from '../../lib/bus';
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
  delivery: {
    include: {
      zone: { select: { id: true, name: true, travelMin: true } },
      courier: { select: { id: true, name: true, phone: true } },
    },
  },
} satisfies Prisma.OrderInclude;

export type OrderFull = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export function serializeDelivery(d: NonNullable<OrderFull['delivery']>) {
  return {
    zone: d.zone,
    courier: d.courier,
    recipientName: d.recipientName,
    phone: d.phone,
    street: d.street,
    house: d.house,
    apartment: d.apartment,
    entrance: d.entrance,
    floor: d.floor,
    comment: d.comment,
    addressLine: [`${d.street}, ${d.house}`, d.apartment && `кв. ${d.apartment}`, d.entrance && `підʼїзд ${d.entrance}`, d.floor && `поверх ${d.floor}`]
      .filter(Boolean)
      .join(', '),
    fee: d.fee,
    paymentMethod: d.paymentMethod,
    changeFrom: d.changeFrom,
    etaAt: d.etaAt,
    assignedAt: d.assignedAt,
    pickedUpAt: d.pickedUpAt,
    deliveredAt: d.deliveredAt,
  };
}

export function serializeOrder(o: OrderFull, viewer?: AuthUser | 'SYSTEM') {
  const actors = viewer && viewer !== 'SYSTEM' ? actorsFor(viewer, o.userId) : [];
  const flow = orderFlow(o.type);
  const success = o.payments.find((p) => p.status === 'SUCCEEDED') ?? null;
  const refunded = o.payments.find((p) => p.status === 'REFUNDED') ?? null;
  const pending = o.payments.find((p) => p.status === 'REQUIRES_ACTION') ?? null;
  const t = now().getTime();
  const isDelivery = o.type === 'DELIVERY';
  const isOwner = actors.includes('OWNER');
  const isAssignedCourier = Boolean(viewer && viewer !== 'SYSTEM' && o.delivery?.courierId === viewer.id);
  const canPayDelivery = isDelivery && o.status === 'NEW' && o.delivery?.paymentMethod === 'CARD' && isOwner;
  return {
    id: o.id,
    number: o.id,
    type: o.type,
    status: o.status,
    statusLabel: orderLabels(o.type)[o.status],
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
    delivery: o.delivery ? serializeDelivery(o.delivery) : null,
    refunded: refunded ? { id: refunded.id, amount: refunded.amount + refunded.tip } : null,
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
      canConfirm: canTransition(flow, o.status, 'CONFIRMED', actors),
      canStart: canTransition(flow, o.status, 'PREPARING', actors),
      canReady: canTransition(flow, o.status, 'READY', actors),
      canServe: canTransition(flow, o.status, 'SERVED', actors),
      canCancel: canTransition(flow, o.status, 'CANCELLED', actors),
      canPay: isDelivery
        ? canPayDelivery
        : o.status === 'SERVED' && (isOwner || actors.includes('STAFF') || actors.includes('ADMIN')),
      canReview: (o.status === 'PAID' || o.status === 'DELIVERED') && isOwner && o.reviews.length === 0,
      canTake: isDelivery && o.status === 'READY' && !o.delivery?.courierId && canTransition(flow, 'READY', 'DELIVERING', actors),
      canDeliver: isDelivery && o.status === 'DELIVERING' && (isAssignedCourier || actors.includes('ADMIN')),
    },
  };
}

type OrderEvent = 'order:created' | 'order:updated';
type DeliveryHook = (o: OrderFull, event: OrderEvent) => void;
let deliveryHook: DeliveryHook | null = null;

/** Delivery API реєструє тут свій обробник — клієнт і курʼєри отримують події через його Socket.IO. */
export const setDeliveryHook = (hook: DeliveryHook | null) => {
  deliveryHook = hook;
};

/**
 * Сповіщення клієнтів ЦЬОГО процесу.
 * Restaurant API: гість, зал і кухня (для доставки — лише зал і кухня).
 * Delivery API: клієнт доставки, курʼєри та диспетчер (через deliveryHook).
 * Порожні операції там, де відповідного Socket.IO у процесі немає.
 */
export function emitLocally(o: OrderFull, event: OrderEvent) {
  const payload = { id: o.id, type: o.type, status: o.status, tableId: o.tableId, tableNumber: o.table?.number ?? null, userId: o.userId };
  const toKitchen = ['CONFIRMED', 'PREPARING', 'READY', 'CANCELLED'].includes(o.status) || event === 'order:updated';
  if (o.type === 'DELIVERY') {
    // неоплачене онлайн-замовлення ще не потрапляє ні в зал, ні на кухню
    if (o.status !== 'NEW') emit(event, payload, { staff: true, kitchen: toKitchen });
    deliveryHook?.(o, event);
    return;
  }
  emit(event, payload, { userId: o.userId, staff: true, kitchen: toKitchen });
  emit('tables:changed', { tableId: o.tableId }, { staff: true });
}

/**
 * Зміна замовлення: сповіщаємо своїх клієнтів, а для доставки — ще й іншу систему
 * через спільну БД (LISTEN/NOTIFY), тож кожен клієнт отримує подію рівно один раз.
 */
export function broadcast(o: OrderFull, event: OrderEvent) {
  emitLocally(o, event);
  if (o.type === 'DELIVERY') void publishOrderEvent({ event, orderId: o.id, status: o.status });
}

export async function loadOrder(id: number, db: Tx = prisma) {
  const o = await db.order.findUnique({ where: { id }, include: orderInclude });
  if (!o) throw notFound('Замовлення не знайдено');
  return o;
}

export function assertCanView(
  actor: AuthUser,
  o: { userId: number | null; status: OrderStatus; delivery?: { courierId: number | null } | null },
) {
  if (actor.role === 'CLIENT' && o.userId !== actor.id) throw forbidden('Це не ваше замовлення');
  if (actor.role === 'COURIER') {
    // курʼєр бачить свої доставки та ті, що ще шукають курʼєра
    const mine = o.delivery?.courierId === actor.id;
    const open = o.delivery && !o.delivery.courierId && ['CONFIRMED', 'PREPARING', 'READY'].includes(o.status);
    if (!mine && !open) throw forbidden('Це замовлення призначене іншому курʼєру');
  }
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

export type LineInput = { dishId: number; quantity: number; notes?: string };

/**
 * Спільна підготовка позицій замовлення (зал і доставка):
 * обʼєднання однакових страв, перевірка наявності (стоп-лист), ціни лише з БД.
 */
export async function resolveLines(tx: Tx, items: LineInput[]) {
  const merged = new Map<string, LineInput>();
  for (const item of items) {
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
  // клієнт не може підмінити вартість — ціни лише з БД
  const subtotal = lines.reduce((s, l) => s + byId.get(l.dishId)!.price * l.quantity, 0);
  const maxPrep = Math.max(...lines.map((l) => byId.get(l.dishId)!.prepTimeMin));
  return { lines, byId, subtotal, maxPrep };
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

    // 2–3. Позиції, наявність страв і ціни — лише з БД
    const { lines, byId, subtotal, maxPrep } = await resolveLines(tx, input.items);
    const status: OrderStatus = isStaff ? 'CONFIRMED' : 'NEW';
    const t = now();
    const created = await tx.order.create({
      data: {
        type: 'DINE_IN',
        createdAt: t, // час застосунку: KDS, ETA і «за сьогодні» рахуються від нього
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
    assertTransition(orderFlow(o.type), orderLabels(o.type), o.status, to, actors);

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
      case 'DELIVERING':
        await tx.delivery.update({ where: { orderId: id }, data: { pickedUpAt: t } });
        break;
      case 'DELIVERED':
        await tx.delivery.update({ where: { orderId: id }, data: { deliveredAt: t } });
        break;
      case 'CANCELLED':
        if (actor !== 'SYSTEM' && actor.role !== 'CLIENT' && !opts.reason) {
          throw unprocessable('Вкажіть причину скасування', 'REASON_REQUIRED');
        }
        data.cancelledAt = t;
        data.cancelReason = opts.reason ?? (o.type === 'DELIVERY' ? 'Скасовано клієнтом' : 'Скасовано гостем');
        // скасування оплаченої доставки — повернення коштів (sandbox refund)
        await tx.payment.updateMany({
          where: { orderId: id, status: 'SUCCEEDED' },
          data: { status: 'REFUNDED', failureMessage: 'Кошти повернуто: замовлення скасовано' },
        });
        await tx.payment.updateMany({
          where: { orderId: id, status: { in: ['PENDING', 'REQUIRES_ACTION'] } },
          data: { status: 'FAILED', failureCode: 'order_cancelled', failureMessage: 'Замовлення скасовано' },
        });
        break;
    }
    await tx.order.update({ where: { id }, data });
    // прогноз доставки = готовність на кухні + час у дорозі до зони клієнта
    if (o.delivery && data.estimatedReadyAt instanceof Date) {
      await tx.delivery.update({
        where: { orderId: id },
        data: { etaAt: new Date(data.estimatedReadyAt.getTime() + (o.delivery.zone.travelMin + 5) * 60000) },
      });
    }
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
      throw conflict(`Замовлення у статусі «${orderLabels(o.type)[o.status]}» — зміна страв недоступна`, 'ORDER_NOT_IN_KITCHEN');
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
