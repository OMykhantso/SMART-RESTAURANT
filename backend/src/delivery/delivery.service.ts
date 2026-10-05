import { DateTime } from 'luxon';
import type { DeliveryZone, OrderStatus, PaymentMethod, Prisma } from '@prisma/client';
import { prisma, type Tx } from '../lib/prisma';
import { delivery as rules } from '../config';
import { conflict, forbidden, notFound, unprocessable } from '../lib/errors';
import { now, openingWindow, toLocal, TZ } from '../lib/time';
import { newProviderRef } from '../modules/payments/sandbox';
import { logStatus } from '../modules/reservations/reservations.service';
import {
  broadcast,
  estimateReadyAt,
  loadOrder,
  orderInclude,
  resolveLines,
  serializeOrder,
  transitionOrder,
  type LineInput,
  type OrderFull,
} from '../modules/orders/orders.service';
import type { AuthUser } from '../middleware/auth';

/** Активні статуси доставки (замовлення ще не завершене). */
export const ACTIVE_DELIVERY: OrderStatus[] = ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERING'];

// ─────────────────────────────── Вартість і час ───────────────────────────────

/** Ціна доставки для зони: безкоштовно від freeFrom, інакше fee; скільки бракує до мінімальної суми. */
export function priceFor(zone: Pick<DeliveryZone, 'fee' | 'minOrder' | 'freeFrom'>, subtotal: number) {
  const fee = zone.freeFrom != null && subtotal >= zone.freeFrom ? 0 : zone.fee;
  return {
    subtotal,
    fee,
    total: subtotal + fee,
    minOrder: zone.minOrder,
    missingToMin: Math.max(0, zone.minOrder - subtotal),
    missingToFree: zone.freeFrom != null ? Math.max(0, zone.freeFrom - subtotal) : null,
  };
}

/**
 * Години доставки: з відкриття кухні до (закриття − lastOrderBeforeCloseMin).
 * Після півночі діє вікно попереднього дня (пт–сб кухня працює до 24:00).
 */
export function deliveryWindow(at: Date = now()) {
  const t = toLocal(at);
  const today = openingWindow(t.startOf('day'));
  const yesterday = openingWindow(t.startOf('day').minus({ days: 1 }));
  const w = t < today.open && t < yesterday.close ? yesterday : today;
  const lastOrder = w.close.minus({ minutes: rules.lastOrderBeforeCloseMin });
  const isOpen = rules.ignoreHours || (t >= w.open && t < lastOrder);
  // коли відкриємось наступного разу
  let nextOpen = w.open;
  if (t >= lastOrder) nextOpen = openingWindow(t.startOf('day').plus({ days: 1 })).open;
  return {
    isOpen,
    opensAt: w.open.toFormat('HH:mm'),
    lastOrderAt: lastOrder.toFormat('HH:mm'),
    closesAt: w.close.toFormat('HH:mm'),
    nextOpenAt: isOpen ? null : nextOpen.toISO(),
    nextOpenLabel: isOpen ? null : nextOpen.setZone(TZ()).toFormat(nextOpen.hasSame(t, 'day') ? "'сьогодні о' HH:mm" : "'завтра о' HH:mm"),
  };
}

function assertOpen() {
  const w = deliveryWindow();
  if (!w.isOpen) {
    throw conflict(
      `Доставка зараз не працює. Замовлення приймаємо з ${w.opensAt} до ${w.lastOrderAt}` + (w.nextOpenLabel ? ` — відкриємось ${w.nextOpenLabel}` : ''),
      'DELIVERY_CLOSED',
      w,
    );
  }
}

/** Прогноз доставки: черга кухні + приготування + передача курʼєру + дорога. */
export async function estimateDeliveryMinutes(db: Tx, maxPrepMin: number, travelMin: number) {
  const ready = await estimateReadyAt(db, -1, maxPrepMin);
  return Math.round((ready.getTime() - now().getTime()) / 60000) + rules.handoverMin + travelMin;
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  let d = digits;
  if (d.length === 10 && d.startsWith('0')) d = `38${d}`;
  if (d.length === 9) d = `380${d}`;
  if (!/^380\d{9}$/.test(d)) throw unprocessable('Вкажіть номер телефону у форматі +380XXXXXXXXX', 'PHONE_INVALID', { field: 'phone' });
  return `+${d}`;
}

export async function activeZone(db: Tx, zoneId: number) {
  const zone = await db.deliveryZone.findUnique({ where: { id: zoneId } });
  if (!zone) throw notFound('Зону доставки не знайдено', 'ZONE_NOT_FOUND');
  if (!zone.isActive) throw conflict(`Доставка в район «${zone.name}» тимчасово не працює`, 'ZONE_INACTIVE');
  return zone;
}

export async function quote(input: { zoneId: number; items: LineInput[] }) {
  const zone = await activeZone(prisma, input.zoneId);
  const { subtotal, maxPrep } = await resolveLines(prisma, input.items);
  const price = priceFor(zone, subtotal);
  const window = deliveryWindow();
  return {
    zone: { id: zone.id, name: zone.name, travelMin: zone.travelMin },
    ...price,
    canOrder: window.isOpen && price.missingToMin === 0,
    reason: !window.isOpen
      ? `Доставка працює з ${window.opensAt} до ${window.lastOrderAt}`
      : price.missingToMin > 0
        ? `Мінімальне замовлення в цей район — ${(zone.minOrder / 100).toFixed(0)} грн`
        : null,
    etaMinutes: await estimateDeliveryMinutes(prisma, maxPrep, zone.travelMin),
    window,
  };
}

// ─────────────────────────────── Оформлення ───────────────────────────────

export interface AddressInput {
  zoneId: number;
  street: string;
  house: string;
  apartment?: string;
  entrance?: string;
  floor?: string;
  comment?: string;
}

export interface CreateDeliveryInput {
  items: LineInput[];
  addressId?: number;
  address?: AddressInput;
  saveAddressAs?: string;
  recipientName?: string;
  phone: string;
  paymentMethod: PaymentMethod;
  changeFrom?: number;
  notes?: string;
}

export async function createDeliveryOrder(actor: AuthUser, input: CreateDeliveryInput) {
  if (actor.role !== 'CLIENT') throw forbidden('Доставку оформлює клієнт у мобільному застосунку');
  assertOpen();
  const phone = normalizePhone(input.phone);

  const order = await prisma.$transaction(async (tx) => {
    // захист від «подвійного тапу»: блокуємо рядок клієнта на час оформлення
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${actor.id} FOR UPDATE`;
    const active = await tx.order.count({ where: { userId: actor.id, type: 'DELIVERY', status: { in: ACTIVE_DELIVERY } } });
    if (active >= rules.maxActivePerClient) {
      throw conflict(`Одночасно можна мати не більше ${rules.maxActivePerClient} активних доставок`, 'TOO_MANY_ACTIVE_DELIVERIES');
    }

    // адреса: збережена або нова (зберігаємо знімок у замовленні)
    let address: AddressInput;
    if (input.addressId) {
      const saved = await tx.address.findUnique({ where: { id: input.addressId } });
      if (!saved || saved.userId !== actor.id) throw notFound('Адресу не знайдено', 'ADDRESS_NOT_FOUND');
      address = {
        zoneId: saved.zoneId,
        street: saved.street,
        house: saved.house,
        apartment: saved.apartment ?? undefined,
        entrance: saved.entrance ?? undefined,
        floor: saved.floor ?? undefined,
        comment: saved.comment ?? undefined,
      };
    } else if (input.address) {
      address = input.address;
    } else {
      throw unprocessable('Вкажіть адресу доставки', 'ADDRESS_REQUIRED', { field: 'address' });
    }
    const zone = await activeZone(tx, address.zoneId);

    const { lines, byId, subtotal, maxPrep } = await resolveLines(tx, input.items);
    const price = priceFor(zone, subtotal);
    if (price.missingToMin > 0) {
      throw unprocessable(
        `Мінімальне замовлення в район «${zone.name}» — ${(zone.minOrder / 100).toFixed(0)} грн. Додайте ще страв на ${(price.missingToMin / 100).toFixed(0)} грн`,
        'BELOW_MIN_ORDER',
        { minOrder: zone.minOrder, missing: price.missingToMin },
      );
    }
    if (input.paymentMethod === 'CASH' && input.changeFrom != null && input.changeFrom < price.total) {
      throw unprocessable('Сума для решти має бути не меншою за суму замовлення', 'CHANGE_TOO_SMALL', { field: 'changeFrom' });
    }

    // готівка — одразу на кухню; картка — після успішної онлайн-оплати
    const status: OrderStatus = input.paymentMethod === 'CASH' ? 'CONFIRMED' : 'NEW';
    const t = now();
    const readyAt = await estimateReadyAt(tx, -1, maxPrep);
    const created = await tx.order.create({
      data: {
        type: 'DELIVERY',
        userId: actor.id,
        createdById: actor.id,
        createdAt: t, // час сервера застосунку (а не БД) — узгоджено з таймерами оплати та прогнозами
        status,
        subtotal: price.subtotal,
        total: price.total,
        notes: input.notes,
        confirmedAt: status === 'CONFIRMED' ? t : null,
        estimatedReadyAt: readyAt,
        items: {
          create: lines.map((l) => ({ dishId: l.dishId, quantity: l.quantity, unitPrice: byId.get(l.dishId)!.price, notes: l.notes })),
        },
        delivery: {
          create: {
            zoneId: zone.id,
            recipientName: input.recipientName?.trim() || actor.name,
            phone,
            street: address.street,
            house: address.house,
            apartment: address.apartment,
            entrance: address.entrance,
            floor: address.floor,
            comment: address.comment,
            fee: price.fee,
            paymentMethod: input.paymentMethod,
            changeFrom: input.paymentMethod === 'CASH' ? (input.changeFrom ?? null) : null,
            etaAt: new Date(readyAt.getTime() + (rules.handoverMin + zone.travelMin) * 60000),
          },
        },
      },
    });
    await logStatus(tx, { orderId: created.id }, null, status, actor.id, status === 'NEW' ? 'Очікує онлайн-оплати' : 'Оплата готівкою курʼєру');

    if (input.saveAddressAs && input.address) {
      const hasDefault = await tx.address.count({ where: { userId: actor.id, isDefault: true } });
      await tx.address.create({
        data: { userId: actor.id, label: input.saveAddressAs, ...input.address, isDefault: hasDefault === 0 },
      });
    }
    // повертаємо телефон у профіль, якщо його ще немає
    await tx.user.updateMany({ where: { id: actor.id, phone: null }, data: { phone } });
    return loadOrder(created.id, tx);
  });

  broadcast(order, 'order:created');
  return serializeOrder(order, actor);
}

// ─────────────────────────────── Курʼєр ───────────────────────────────

async function lockDelivery(tx: Tx, id: number) {
  await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id} FOR UPDATE`;
  const o = await loadOrder(id, tx);
  if (o.type !== 'DELIVERY' || !o.delivery) throw notFound('Замовлення доставки не знайдено');
  return o as OrderFull & { delivery: NonNullable<OrderFull['delivery']> };
}

async function assertCourierCapacity(tx: Tx, courierId: number) {
  const load = await tx.order.count({
    where: { type: 'DELIVERY', status: { in: ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERING'] }, delivery: { courierId } },
  });
  if (load >= rules.maxActivePerCourier) {
    throw conflict(`Курʼєр може мати не більше ${rules.maxActivePerCourier} активних замовлень`, 'COURIER_BUSY');
  }
}

/** Курʼєр бере замовлення (поки воно готується або вже готове). */
export async function acceptOrder(courier: AuthUser, id: number) {
  const o = await prisma.$transaction(async (tx) => {
    const o = await lockDelivery(tx, id);
    if (o.delivery.courierId === courier.id) return o;
    if (o.delivery.courierId) throw conflict('Це замовлення вже взяв інший курʼєр', 'ALREADY_TAKEN');
    if (!['CONFIRMED', 'PREPARING', 'READY'].includes(o.status)) {
      throw conflict('Замовлення недоступне для доставки', 'NOT_AVAILABLE');
    }
    await assertCourierCapacity(tx, courier.id);
    await tx.delivery.update({ where: { orderId: id }, data: { courierId: courier.id, assignedAt: now() } });
    await logStatus(tx, { orderId: id }, o.status, o.status, courier.id, `Курʼєр ${courier.name} прийняв замовлення`);
    return loadOrder(id, tx);
  });
  broadcast(o, 'order:updated');
  return serializeOrder(o, courier);
}

/** Курʼєр відмовляється від замовлення до того, як забрав його. */
export async function releaseOrder(courier: AuthUser, id: number) {
  const o = await prisma.$transaction(async (tx) => {
    const o = await lockDelivery(tx, id);
    if (o.delivery.courierId !== courier.id) throw forbidden('Це замовлення призначене не вам');
    if (o.status === 'DELIVERING') throw conflict('Замовлення вже в дорозі — його потрібно доставити', 'ALREADY_PICKED_UP');
    await tx.delivery.update({ where: { orderId: id }, data: { courierId: null, assignedAt: null } });
    await logStatus(tx, { orderId: id }, o.status, o.status, courier.id, `Курʼєр ${courier.name} відмовився від замовлення`);
    return loadOrder(id, tx);
  });
  broadcast(o, 'order:updated');
  return serializeOrder(o, courier);
}

/** Диспетчер (зал / адміністратор) призначає курʼєра. */
export async function assignCourier(actor: AuthUser, id: number, courierId: number | null) {
  const o = await prisma.$transaction(async (tx) => {
    const o = await lockDelivery(tx, id);
    if (o.status === 'DELIVERING' || o.status === 'DELIVERED' || o.status === 'CANCELLED') {
      throw conflict('Курʼєра можна змінити лише до того, як він забрав замовлення', 'ALREADY_PICKED_UP');
    }
    if (courierId != null) {
      const courier = await tx.user.findUnique({ where: { id: courierId } });
      if (!courier || courier.role !== 'COURIER' || !courier.isActive) throw unprocessable('Це не активний курʼєр', 'NOT_A_COURIER');
      if (o.delivery.courierId !== courierId) await assertCourierCapacity(tx, courierId);
    }
    await tx.delivery.update({ where: { orderId: id }, data: { courierId, assignedAt: courierId ? now() : null } });
    await logStatus(tx, { orderId: id }, o.status, o.status, actor.id, courierId ? 'Курʼєра призначено диспетчером' : 'Курʼєра знято диспетчером');
    return loadOrder(id, tx);
  });
  broadcast(o, 'order:updated');
  return serializeOrder(o, actor);
}

/** Курʼєр забрав готове замовлення з кухні → «В дорозі». */
export async function pickUp(courier: AuthUser, id: number) {
  const o = await prisma.$transaction(async (tx) => {
    const o = await lockDelivery(tx, id);
    if (courier.role === 'COURIER' && o.delivery.courierId !== courier.id) {
      throw forbidden('Спершу прийміть замовлення');
    }
    if (o.status !== 'READY') throw conflict('Замовлення ще готується — заберіть його, коли кухня позначить «Готово»', 'NOT_READY');
    const t = now();
    await transitionOrder(courier, id, 'DELIVERING', { db: tx });
    await tx.delivery.update({
      where: { orderId: id },
      data: { etaAt: new Date(t.getTime() + o.delivery.zone.travelMin * 60000), ...(o.delivery.courierId ? {} : { courierId: courier.id, assignedAt: t }) },
    });
    return loadOrder(id, tx);
  });
  broadcast(o, 'order:updated');
  return serializeOrder(o, courier);
}

/** Вручення клієнту. Готівка: курʼєр фіксує отриману оплату (платіж CASH). */
export async function markDelivered(courier: AuthUser, id: number, input: { tip?: number }) {
  const o = await prisma.$transaction(async (tx) => {
    const o = await lockDelivery(tx, id);
    if (courier.role === 'COURIER' && o.delivery.courierId !== courier.id) throw forbidden('Це замовлення призначене не вам');
    if (o.status !== 'DELIVERING') throw conflict('Позначити «Доставлено» можна лише замовлення в дорозі', 'NOT_ON_THE_WAY');
    const t = now();
    if (o.delivery.paymentMethod === 'CASH') {
      await tx.payment.create({
        data: {
          orderId: id,
          amount: o.total,
          tip: input.tip ?? 0,
          method: 'CASH',
          status: 'SUCCEEDED',
          provider: 'courier',
          providerRef: `cash_${newProviderRef().slice(7)}`,
          processedById: courier.id,
          paidAt: t,
        },
      });
      await tx.order.update({ where: { id }, data: { paidAt: t } });
    }
    await transitionOrder(courier, id, 'DELIVERED', { db: tx });
    return loadOrder(id, tx);
  });
  broadcast(o, 'order:updated');
  return serializeOrder(o, courier);
}

export async function cancelDelivery(actor: AuthUser, id: number, reason?: string) {
  const o = await loadOrder(id);
  if (o.type !== 'DELIVERY') throw notFound('Замовлення доставки не знайдено');
  if (actor.role === 'CLIENT' && o.userId !== actor.id) throw forbidden('Це не ваше замовлення');
  if (actor.role === 'CLIENT' && ['PREPARING', 'READY', 'DELIVERING'].includes(o.status)) {
    throw conflict('Кухня вже готує ваше замовлення — скасувати його неможливо', 'TOO_LATE_TO_CANCEL');
  }
  const updated = await transitionOrder(actor, id, 'CANCELLED', { reason });
  return serializeOrder(updated, actor);
}

// ─────────────────────────────── Запити ───────────────────────────────

export async function listCourierOrders(courier: AuthUser, scope: 'available' | 'mine' | 'history') {
  const dayStart = toLocal(now()).startOf('day').toJSDate();
  const where: Prisma.OrderWhereInput =
    scope === 'available'
      ? { type: 'DELIVERY', status: { in: ['CONFIRMED', 'PREPARING', 'READY'] }, delivery: { courierId: null } }
      : scope === 'mine'
        ? { type: 'DELIVERY', status: { in: ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERING'] }, delivery: { courierId: courier.id } }
        : { type: 'DELIVERY', status: 'DELIVERED', delivery: { courierId: courier.id, deliveredAt: { gte: DateTime.fromJSDate(dayStart).minus({ days: 6 }).toJSDate() } } };
  const orders = await prisma.order.findMany({
    where,
    include: orderInclude,
    orderBy: scope === 'history' ? { createdAt: 'desc' } : [{ status: 'desc' }, { createdAt: 'asc' }],
    take: 100,
  });
  return orders.map((o) => serializeOrder(o, courier));
}

export async function courierSummary(courier: AuthUser) {
  const dayStart = toLocal(now()).startOf('day').toJSDate();
  const [delivered, cash, active] = await Promise.all([
    prisma.order.findMany({
      where: { type: 'DELIVERY', status: 'DELIVERED', delivery: { courierId: courier.id, deliveredAt: { gte: dayStart } } },
      select: { total: true, createdAt: true, delivery: { select: { fee: true, pickedUpAt: true, deliveredAt: true } } },
    }),
    prisma.payment.aggregate({
      where: { method: 'CASH', status: 'SUCCEEDED', processedById: courier.id, paidAt: { gte: dayStart } },
      _sum: { amount: true, tip: true },
    }),
    prisma.order.count({ where: { type: 'DELIVERY', status: { in: ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERING'] }, delivery: { courierId: courier.id } } }),
  ]);
  const rides = delivered
    .filter((d) => d.delivery?.pickedUpAt && d.delivery.deliveredAt)
    .map((d) => (d.delivery!.deliveredAt!.getTime() - d.delivery!.pickedUpAt!.getTime()) / 60000);
  return {
    deliveredToday: delivered.length,
    active,
    capacity: rules.maxActivePerCourier,
    cashOnHand: (cash._sum.amount ?? 0) + (cash._sum.tip ?? 0),
    tipsToday: cash._sum.tip ?? 0,
    feesToday: delivered.reduce((s, d) => s + (d.delivery?.fee ?? 0), 0),
    avgRideMin: rides.length ? Math.round(rides.reduce((a, b) => a + b, 0) / rides.length) : null,
  };
}
