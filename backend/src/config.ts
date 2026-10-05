import path from 'node:path';
import dotenv from 'dotenv';

const isTestEnv = process.env.NODE_ENV === 'test';
dotenv.config({
  path: path.resolve(__dirname, '..', isTestEnv ? '.env.test' : '.env'),
  quiet: true,
  // у тестах .env.test завжди має пріоритет, щоб випадково не очистити робочу БД
  override: isTestEnv,
});
if (isTestEnv && process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (Number.isNaN(value)) throw new Error(`Env ${name} must be a number`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isTest: process.env.NODE_ENV === 'test',
  port: num('PORT', 4000),
  deliveryPort: num('DELIVERY_PORT', 4100),
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret-change-me',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret-change-me',
  accessTokenTtlMin: num('ACCESS_TOKEN_TTL_MIN', 30),
  refreshTokenTtlDays: num('REFRESH_TOKEN_TTL_DAYS', 30),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  paymentLatencyMs: num('PAYMENT_SANDBOX_LATENCY_MS', 700),
  uploadsDir: path.resolve(__dirname, '..', 'uploads'),
};

/** Бізнес-налаштування ресторану, які використовує booking engine. */
export const restaurant = {
  name: 'Smart Restaurant',
  timezone: process.env.RESTAURANT_TZ ?? 'Europe/Kyiv',
  /** Години роботи за днями тижня (1 — понеділок … 7 — неділя, ISO). close може бути 24:00. */
  openingHours: {
    1: { open: '10:00', close: '23:00' },
    2: { open: '10:00', close: '23:00' },
    3: { open: '10:00', close: '23:00' },
    4: { open: '10:00', close: '23:00' },
    5: { open: '10:00', close: '24:00' },
    6: { open: '10:00', close: '24:00' },
    7: { open: '11:00', close: '22:00' },
  } as Record<number, { open: string; close: string }>,
  /** Крок сітки слотів, хв */
  slotStepMin: 30,
  /** Технологічна перерва між бронюваннями (прибирання столу), хв */
  bufferMin: 15,
  /** Мінімальний час до початку бронювання для клієнта, хв */
  minLeadMin: 30,
  /** На скільки днів уперед можна бронювати */
  maxAdvanceDays: 60,
  /** Максимальна кількість гостей в одному бронюванні */
  maxPartySize: 12,
  /** Скільки активних майбутніх бронювань може мати клієнт одночасно */
  maxActiveReservationsPerClient: 3,
  /** Check-in дозволено не раніше ніж за N хв до початку (якщо столик вже вільний) */
  checkInEarlyMin: 60,
  /** Через скільки хв після початку непідтверджений візит вважається NO_SHOW */
  noShowGraceMin: 20,
  /** Клієнт може скасувати бронювання не пізніше ніж за N хв до початку */
  clientCancelDeadlineMin: 60,
  /** Мінімальна тривалість walk-in візиту, хв */
  minWalkInMin: 45,
  /** Кількість паралельних «станцій» кухні (для прогнозу часу готовності) */
  kitchenParallelism: 3,
  /** Тривалість візиту залежно від кількості гостей */
  durationForParty(guests: number): number {
    if (guests <= 2) return 90;
    if (guests <= 4) return 120;
    if (guests <= 6) return 150;
    return 180;
  },
};

/** Бізнес-правила служби доставки (Delivery API). */
export const delivery = {
  /** Останнє замовлення приймається за N хв до закриття кухні */
  lastOrderBeforeCloseMin: 45,
  /** Неоплачене онлайн-замовлення автоматично скасовується через N хв */
  unpaidTimeoutMin: 15,
  /** Скільки активних доставок може мати клієнт одночасно */
  maxActivePerClient: 3,
  /** Скільки замовлень курʼєр може везти одночасно */
  maxActivePerCourier: 2,
  /** Час на передачу замовлення курʼєру, хв (входить у прогноз доставки) */
  handoverMin: 5,
  /** Для демонстрацій поза годинами роботи: DELIVERY_IGNORE_HOURS=true */
  ignoreHours: process.env.DELIVERY_IGNORE_HOURS === 'true',
};

