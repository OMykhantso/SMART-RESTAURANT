import type { OrderStatus, OrderType, ReservationStatus, Role } from '@prisma/client';
import { AppError } from './errors';

/**
 * Скінченні автомати станів бізнес-процесу.
 *
 * Для кожного переходу from → to вказано, ХТО може його виконати:
 *   OWNER  — клієнт, якому належить бронювання/замовлення
 *   STAFF / KITCHEN / ADMIN / COURIER — ролі працівників
 *   SYSTEM — лише сервер (фонові задачі, платіжний шлюз)
 */
export type Actor = 'OWNER' | Role | 'SYSTEM';

type Machine<S extends string> = Record<S, Partial<Record<S, Actor[]>>>;

export const RESERVATION_FLOW: Machine<ReservationStatus> = {
  PENDING: {
    CONFIRMED: ['STAFF', 'ADMIN'],
    REJECTED: ['STAFF', 'ADMIN'],
    CANCELLED: ['OWNER', 'STAFF', 'ADMIN', 'SYSTEM'],
    CHECKED_IN: ['STAFF', 'ADMIN'],
  },
  CONFIRMED: {
    CHECKED_IN: ['OWNER', 'STAFF', 'ADMIN'],
    CANCELLED: ['OWNER', 'STAFF', 'ADMIN'],
    NO_SHOW: ['STAFF', 'ADMIN', 'SYSTEM'],
  },
  CHECKED_IN: {
    COMPLETED: ['OWNER', 'STAFF', 'ADMIN', 'SYSTEM'],
  },
  COMPLETED: {},
  CANCELLED: {},
  REJECTED: {},
  NO_SHOW: {},
};

export const ORDER_FLOW: Machine<OrderStatus> = {
  NEW: {
    CONFIRMED: ['STAFF', 'ADMIN'],
    CANCELLED: ['OWNER', 'STAFF', 'ADMIN'],
  },
  CONFIRMED: {
    PREPARING: ['KITCHEN', 'ADMIN'],
    CANCELLED: ['STAFF', 'KITCHEN', 'ADMIN'],
  },
  PREPARING: {
    READY: ['KITCHEN', 'ADMIN', 'SYSTEM'],
  },
  READY: {
    SERVED: ['STAFF', 'ADMIN'],
  },
  SERVED: {
    PAID: ['SYSTEM'],
  },
  PAID: {},
  DELIVERING: {},
  DELIVERED: {},
  CANCELLED: {},
};

/**
 * Автомат замовлення ДОСТАВКИ (Delivery API).
 * Картка: NEW (очікує онлайн-оплати) → CONFIRMED лише після успішної оплати (SYSTEM).
 * Готівка: замовлення створюється одразу CONFIRMED.
 * Кухня працює так само, як із замовленнями в залі; далі — курʼєр.
 */
export const DELIVERY_FLOW: Machine<OrderStatus> = {
  NEW: {
    CONFIRMED: ['SYSTEM'],
    CANCELLED: ['OWNER', 'STAFF', 'ADMIN', 'SYSTEM'],
  },
  CONFIRMED: {
    PREPARING: ['KITCHEN', 'ADMIN'],
    CANCELLED: ['OWNER', 'STAFF', 'KITCHEN', 'ADMIN'],
  },
  PREPARING: {
    READY: ['KITCHEN', 'ADMIN', 'SYSTEM'],
    CANCELLED: ['ADMIN'],
  },
  READY: {
    DELIVERING: ['COURIER', 'ADMIN'],
    CANCELLED: ['ADMIN'],
  },
  DELIVERING: {
    DELIVERED: ['COURIER', 'ADMIN'],
    CANCELLED: ['ADMIN'],
  },
  SERVED: {},
  PAID: {},
  DELIVERED: {},
  CANCELLED: {},
};

export const RESERVATION_LABELS: Record<ReservationStatus, string> = {
  PENDING: 'Очікує підтвердження',
  CONFIRMED: 'Підтверджено',
  CHECKED_IN: 'Гість у ресторані',
  COMPLETED: 'Завершено',
  CANCELLED: 'Скасовано',
  REJECTED: 'Відхилено',
  NO_SHOW: 'Гість не прийшов',
};

export const ORDER_LABELS: Record<OrderStatus, string> = {
  NEW: 'Нове',
  CONFIRMED: 'Прийнято',
  PREPARING: 'Готується',
  READY: 'Готово',
  SERVED: 'Подано',
  PAID: 'Оплачено',
  DELIVERING: 'В дорозі',
  DELIVERED: 'Доставлено',
  CANCELLED: 'Скасовано',
};

export const DELIVERY_LABELS: Record<OrderStatus, string> = {
  ...ORDER_LABELS,
  NEW: 'Очікує оплати',
  READY: 'Чекає курʼєра',
};

export const orderFlow = (type: OrderType) => (type === 'DELIVERY' ? DELIVERY_FLOW : ORDER_FLOW);
export const orderLabels = (type: OrderType) => (type === 'DELIVERY' ? DELIVERY_LABELS : ORDER_LABELS);

export function allowedActors<S extends string>(machine: Machine<S>, from: S, to: S): Actor[] | undefined {
  return machine[from]?.[to];
}

export function canTransition<S extends string>(machine: Machine<S>, from: S, to: S, actors: Actor[]): boolean {
  const allowed = allowedActors(machine, from, to);
  return Boolean(allowed && actors.some((a) => allowed.includes(a)));
}

/**
 * Перевіряє допустимість переходу. Кидає:
 *  409 INVALID_TRANSITION — переходу не існує в автоматі;
 *  403 TRANSITION_FORBIDDEN — перехід існує, але цей актор не має права його виконати.
 */
export function assertTransition<S extends string>(
  machine: Machine<S>,
  labels: Record<S, string>,
  from: S,
  to: S,
  actors: Actor[],
) {
  const allowed = allowedActors(machine, from, to);
  if (!allowed) {
    throw new AppError(
      409,
      'INVALID_TRANSITION',
      `Неможливо змінити статус «${labels[from]}» на «${labels[to]}»`,
      { from, to },
    );
  }
  if (!actors.some((a) => allowed.includes(a))) {
    throw new AppError(403, 'TRANSITION_FORBIDDEN', `Ваша роль не може виконати перехід «${labels[from]}» → «${labels[to]}»`, {
      from,
      to,
    });
  }
}

/** Набір «акторів», від імені яких діє користувач щодо ресурсу. */
export function actorsFor(user: { id: number; role: Role } | 'SYSTEM', ownerId: number | null | undefined): Actor[] {
  if (user === 'SYSTEM') return ['SYSTEM'];
  const actors: Actor[] = [user.role];
  if (ownerId != null && ownerId === user.id) actors.push('OWNER');
  return actors;
}
