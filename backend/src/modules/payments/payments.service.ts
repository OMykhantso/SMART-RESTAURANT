import type { Payment } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { env } from '../../config';
import { AppError, conflict, forbidden, notFound, unprocessable } from '../../lib/errors';
import { emit } from '../../lib/realtime';
import { sleep } from '../../lib/http';
import { now } from '../../lib/time';
import type { AuthUser } from '../../middleware/auth';
import { loadOrder, serializeOrder, transitionOrder, type OrderFull } from '../orders/orders.service';
import { authorize, detectBrand, newProviderRef, normalizeCardNumber, SANDBOX_OTP, validateCard, type CardInput } from './sandbox';

export function serializePayment(p: Payment) {
  return {
    id: p.id,
    orderId: p.orderId,
    amount: p.amount,
    tip: p.tip,
    total: p.amount + p.tip,
    method: p.method,
    status: p.status,
    provider: p.provider,
    providerRef: p.providerRef,
    cardBrand: p.cardBrand,
    cardLast4: p.cardLast4,
    failureCode: p.failureCode,
    failureMessage: p.failureMessage,
    createdAt: p.createdAt,
    paidAt: p.paidAt,
  };
}

function assertPayable(order: OrderFull, actor: AuthUser) {
  const isStaff = actor.role === 'STAFF' || actor.role === 'ADMIN';
  if (!isStaff && order.userId !== actor.id) throw forbidden('Оплатити можна лише власне замовлення');
  if (order.status === 'PAID') throw conflict('Замовлення вже оплачено', 'ALREADY_PAID');
  if (order.status === 'CANCELLED') throw conflict('Не можна оплатити скасоване замовлення', 'ORDER_CANCELLED');
  if (order.status !== 'SERVED') {
    throw conflict('Оплата стане доступною після того, як страви подадуть до столу', 'ORDER_NOT_SERVED');
  }
}

/** Фіналізація успішної оплати: атомарно SUCCEEDED + замовлення PAID. */
async function finalizeSuccess(paymentId: number, actor: AuthUser) {
  const order = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    // блокування рядка замовлення: дві паралельні оплати не можуть обидві пройти
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${payment.orderId} FOR UPDATE`;
    const current = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId } });
    if (current.status !== 'SERVED') return null;
    await tx.payment.update({ where: { id: paymentId }, data: { status: 'SUCCEEDED', paidAt: now() } });
    return transitionOrder('SYSTEM', payment.orderId, 'PAID', { db: tx, reason: `Оплата #${paymentId}` });
  });
  if (!order) {
    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: 'FAILED', failureCode: 'order_state_changed', failureMessage: 'Замовлення вже оплачено або змінено' },
    });
    throw conflict('Замовлення вже оплачено або змінено', 'ALREADY_PAID');
  }
  const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  emit('order:updated', { id: order.id, status: order.status, tableId: order.tableId, userId: order.userId }, {
    userId: order.userId,
    staff: true,
    kitchen: false,
  });
  emit('payment:succeeded', { orderId: order.id, amount: payment.amount + payment.tip, method: payment.method, tableNumber: order.table.number }, {
    userId: order.userId,
    staff: true,
  });
  emit('tables:changed', { tableId: order.tableId }, { staff: true });
  return { payment: serializePayment(payment), order: serializeOrder(order, actor) };
}

async function markFailed(paymentId: number, code: string, message: string): Promise<never> {
  await prisma.payment.update({ where: { id: paymentId }, data: { status: 'FAILED', failureCode: code, failureMessage: message } });
  throw new AppError(402, 'PAYMENT_DECLINED', message, { paymentId, reason: code });
}

export async function payByCard(
  actor: AuthUser,
  input: { orderId: number; tip: number; card: CardInput; idempotencyKey?: string },
) {
  // Ідемпотентність: повторний запит з тим самим ключем не створює другий платіж
  if (input.idempotencyKey) {
    const existing = await prisma.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.orderId !== input.orderId) throw conflict('Ключ ідемпотентності вже використано', 'IDEMPOTENCY_KEY_REUSED');
      const order = await loadOrder(existing.orderId);
      return {
        payment: serializePayment(existing),
        order: serializeOrder(order, actor),
        requiresAction: existing.status === 'REQUIRES_ACTION',
        replayed: true,
      };
    }
  }

  const order = await loadOrder(input.orderId);
  assertPayable(order, actor);
  const invalid = validateCard(input.card, now());
  if (invalid) throw unprocessable(invalid.message, 'CARD_INVALID', { field: invalid.field });

  const digits = normalizeCardNumber(input.card.number);
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      amount: order.total,
      tip: input.tip,
      method: 'CARD',
      status: 'PENDING',
      providerRef: newProviderRef(),
      cardBrand: detectBrand(digits),
      cardLast4: digits.slice(-4),
      idempotencyKey: input.idempotencyKey,
    },
  });

  // Імітація мережевої затримки платіжного провайдера
  if (env.paymentLatencyMs > 0) await sleep(env.paymentLatencyMs);
  const outcome = authorize(input.card);

  if (outcome.kind === 'declined') return markFailed(payment.id, outcome.code, outcome.message);
  if (outcome.kind === 'requires_action') {
    const updated = await prisma.payment.update({ where: { id: payment.id }, data: { status: 'REQUIRES_ACTION' } });
    return {
      payment: serializePayment(updated),
      order: serializeOrder(await loadOrder(order.id), actor),
      requiresAction: true,
      challenge: { type: '3ds_otp', message: 'Банк надіслав код підтвердження (sandbox: 123456)' },
    };
  }
  return { ...(await finalizeSuccess(payment.id, actor)), requiresAction: false };
}

/** Підтвердження 3-D Secure одноразовим кодом. */
export async function confirm3ds(actor: AuthUser, paymentId: number, otp: string) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
  if (!payment) throw notFound('Платіж не знайдено');
  const isStaff = actor.role === 'STAFF' || actor.role === 'ADMIN';
  if (!isStaff && payment.order.userId !== actor.id) throw forbidden();
  if (payment.status !== 'REQUIRES_ACTION') throw conflict('Платіж не очікує підтвердження', 'PAYMENT_NOT_PENDING');
  if (env.paymentLatencyMs > 0) await sleep(Math.round(env.paymentLatencyMs / 2));
  if (otp !== SANDBOX_OTP) return markFailed(payment.id, 'authentication_failed', 'Невірний код підтвердження 3-D Secure');
  return { ...(await finalizeSuccess(payment.id, actor)), requiresAction: false };
}

/** Оплата готівкою / терміналом — фіксує офіціант. */
export async function payCash(actor: AuthUser, orderId: number, tip: number) {
  const order = await loadOrder(orderId);
  assertPayable(order, actor);
  const payment = await prisma.payment.create({
    data: {
      orderId,
      amount: order.total,
      tip,
      method: 'CASH',
      status: 'PENDING',
      providerRef: `cash_${newProviderRef().slice(7)}`,
      processedById: actor.id,
    },
  });
  return finalizeSuccess(payment.id, actor);
}
