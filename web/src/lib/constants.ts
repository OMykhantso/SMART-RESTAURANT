import type { OrderStatus, ReservationStatus, Role, TableZone } from './types';

export const ZONES: Record<TableZone, { label: string; short: string }> = {
  HALL: { label: 'Головна зала', short: 'Зала' },
  TERRACE: { label: 'Тераса', short: 'Тераса' },
  VIP: { label: 'VIP-зала', short: 'VIP' },
  BAR: { label: 'Барна зона', short: 'Бар' },
};

type Tone = 'gold' | 'amber' | 'emerald' | 'sky' | 'violet' | 'rose' | 'zinc' | 'orange';

export const RESERVATION_STATUS: Record<ReservationStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Очікує підтвердження', tone: 'amber' },
  CONFIRMED: { label: 'Підтверджено', tone: 'sky' },
  CHECKED_IN: { label: 'Гість у ресторані', tone: 'emerald' },
  COMPLETED: { label: 'Завершено', tone: 'zinc' },
  CANCELLED: { label: 'Скасовано', tone: 'rose' },
  REJECTED: { label: 'Відхилено', tone: 'rose' },
  NO_SHOW: { label: 'Не прийшов', tone: 'rose' },
};

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone; hint: string }> = {
  NEW: { label: 'Нове', tone: 'amber', hint: 'Очікує підтвердження офіціантом' },
  CONFIRMED: { label: 'Прийнято', tone: 'sky', hint: 'Передано на кухню' },
  PREPARING: { label: 'Готується', tone: 'orange', hint: 'Кухар уже працює над вашими стравами' },
  READY: { label: 'Готово', tone: 'emerald', hint: 'Страви готові — офіціант уже несе' },
  SERVED: { label: 'Подано', tone: 'violet', hint: 'Смачного! Оплата доступна в один дотик' },
  PAID: { label: 'Оплачено', tone: 'gold', hint: 'Дякуємо! Чекаємо на вас знову' },
  CANCELLED: { label: 'Скасовано', tone: 'rose', hint: 'Замовлення скасовано' },
};

export const ORDER_FLOW: OrderStatus[] = ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'PAID'];
export const RESERVATION_FLOW: ReservationStatus[] = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED'];

export const ROLE_LABEL: Record<Role, string> = {
  CLIENT: 'Клієнт',
  STAFF: 'Працівник залу',
  KITCHEN: 'Кухня',
  ADMIN: 'Адміністратор',
};

export const SOURCE_LABEL = { APP: 'Застосунок', WEB: 'Сайт', STAFF: 'Телефон / хостес', WALK_IN: 'Без бронювання' } as const;

export const TONE_CLASSES: Record<Tone, { badge: string; dot: string; ring: string; text: string; bg: string }> = {
  gold: { badge: 'bg-gold-400/12 text-gold-200 ring-gold-400/25', dot: 'bg-gold-300', ring: 'ring-gold-400/40', text: 'text-gold-300', bg: 'bg-gold-400' },
  amber: { badge: 'bg-amber-400/10 text-amber-200 ring-amber-400/25', dot: 'bg-amber-300', ring: 'ring-amber-400/40', text: 'text-amber-300', bg: 'bg-amber-400' },
  orange: { badge: 'bg-orange-400/10 text-orange-200 ring-orange-400/25', dot: 'bg-orange-300', ring: 'ring-orange-400/40', text: 'text-orange-300', bg: 'bg-orange-400' },
  emerald: { badge: 'bg-emerald-400/10 text-emerald-200 ring-emerald-400/25', dot: 'bg-emerald-300', ring: 'ring-emerald-400/40', text: 'text-emerald-300', bg: 'bg-emerald-400' },
  sky: { badge: 'bg-sky-400/10 text-sky-200 ring-sky-400/25', dot: 'bg-sky-300', ring: 'ring-sky-400/40', text: 'text-sky-300', bg: 'bg-sky-400' },
  violet: { badge: 'bg-violet-400/10 text-violet-200 ring-violet-400/25', dot: 'bg-violet-300', ring: 'ring-violet-400/40', text: 'text-violet-300', bg: 'bg-violet-400' },
  rose: { badge: 'bg-rose-400/10 text-rose-200 ring-rose-400/25', dot: 'bg-rose-300', ring: 'ring-rose-400/40', text: 'text-rose-300', bg: 'bg-rose-400' },
  zinc: { badge: 'bg-white/5 text-ink-200 ring-white/10', dot: 'bg-ink-300', ring: 'ring-white/20', text: 'text-ink-300', bg: 'bg-ink-400' },
};

export const TEST_CARDS = [
  { number: '4242 4242 4242 4242', label: 'Успішна оплата' },
  { number: '4000 0000 0000 3220', label: '3-D Secure (код 123456)' },
  { number: '4000 0000 0000 0002', label: 'Відмова банку' },
  { number: '4000 0000 0000 9995', label: 'Недостатньо коштів' },
];
