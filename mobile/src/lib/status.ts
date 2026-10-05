import type { OrderStatus, ReservationStatus, TableZone } from '../api/types';
import type { Tone } from '../theme';

export const RESERVATION_META: Record<ReservationStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Очікує підтвердження', tone: 'warning' },
  CONFIRMED: { label: 'Підтверджено', tone: 'info' },
  CHECKED_IN: { label: 'Ви в ресторані', tone: 'success' },
  COMPLETED: { label: 'Завершено', tone: 'muted' },
  CANCELLED: { label: 'Скасовано', tone: 'danger' },
  REJECTED: { label: 'Відхилено', tone: 'danger' },
  NO_SHOW: { label: 'Не відвідано', tone: 'danger' },
};

export const ORDER_META: Record<OrderStatus, { label: string; tone: Tone; hint: string }> = {
  NEW: { label: 'Надіслано', tone: 'warning', hint: 'Офіціант підтвердить за хвилину' },
  CONFIRMED: { label: 'Прийнято', tone: 'info', hint: 'Замовлення передано на кухню' },
  PREPARING: { label: 'Готується', tone: 'orange', hint: 'Кухар уже працює над вашими стравами' },
  READY: { label: 'Готово', tone: 'success', hint: 'Офіціант уже несе страви' },
  SERVED: { label: 'Подано', tone: 'violet', hint: 'Смачного! Оплатити можна в один дотик' },
  PAID: { label: 'Оплачено', tone: 'gold', hint: 'Дякуємо! Чекаємо на вас знову' },
  DELIVERING: { label: 'В дорозі', tone: 'info', hint: 'Курʼєр уже везе ваше замовлення' },
  DELIVERED: { label: 'Доставлено', tone: 'gold', hint: 'Смачного! Дякуємо, що обрали нас' },
  CANCELLED: { label: 'Скасовано', tone: 'danger', hint: 'Замовлення скасовано' },
};

/** Статуси доставки очима клієнта (Delivery API). */
export const DELIVERY_META: Record<OrderStatus, { label: string; tone: Tone; hint: string }> = {
  ...ORDER_META,
  NEW: { label: 'Очікує оплати', tone: 'warning', hint: 'Оплатіть замовлення — і ми почнемо готувати' },
  CONFIRMED: { label: 'Прийнято', tone: 'info', hint: 'Кухня отримала замовлення' },
  PREPARING: { label: 'Готується', tone: 'orange', hint: 'Кухар уже працює над вашими стравами' },
  READY: { label: 'Чекає курʼєра', tone: 'success', hint: 'Страви готові й запаковані' },
};

export const ORDER_FLOW: OrderStatus[] = ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'PAID'];
export const DELIVERY_FLOW: OrderStatus[] = ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERING', 'DELIVERED'];

export const metaOf = (o: { type?: string; status: OrderStatus }) => (o.type === 'DELIVERY' ? DELIVERY_META : ORDER_META)[o.status];
export const placeOf = (o: { table: { number: number } | null; delivery?: { zone: { name: string } } | null }) =>
  o.table ? `Столик №${o.table.number}` : `Доставка${o.delivery ? ` · ${o.delivery.zone.name}` : ''}`;

export const ZONE_LABEL: Record<TableZone, string> = { HALL: 'Головна зала', TERRACE: 'Тераса', VIP: 'VIP-зала', BAR: 'Бар' };

export const CATEGORY_EMOJI: Record<string, string> = {
  breakfast: '🍳',
  starters: '🥟',
  salads: '🥗',
  soups: '🍲',
  main: '🥩',
  pasta: '🍝',
  pizza: '🍕',
  desserts: '🍰',
  drinks: '☕',
  cocktails: '🍸',
};

export const CATEGORY_TINT: Record<string, [string, string]> = {
  breakfast: ['#8a5a1c', '#2a1606'],
  starters: ['#7a3a18', '#220d05'],
  salads: ['#2f5a24', '#0b1a08'],
  soups: ['#7a2218', '#220806'],
  main: ['#6a3216', '#1c0a04'],
  pasta: ['#7a5a18', '#221806'],
  pizza: ['#80301a', '#230c06'],
  desserts: ['#7a2e50', '#230a18'],
  drinks: ['#5a3e24', '#170e06'],
  cocktails: ['#50307a', '#140a24'],
};
