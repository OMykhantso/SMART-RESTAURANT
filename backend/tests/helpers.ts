import bcrypt from 'bcryptjs';
import request from 'supertest';
import { DateTime } from 'luxon';
import { vi } from 'vitest';
import type { Role } from '@prisma/client';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

export const app = createApp();
export const api = () => request(app);
export { prisma };

const TZ = 'Europe/Kyiv';

/** Фіксуємо «зараз» = сьогодні о HH:mm за Києвом (підміняємо лише Date, таймери працюють як зазвичай). */
export function setNow(hour: number, minute = 0, dayOffset = 0) {
  const dt = DateTime.now().setZone(TZ).startOf('day').plus({ days: dayOffset }).set({ hour, minute });
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(dt.toJSDate());
  return dt;
}

export function realTime() {
  vi.useRealTimers();
}

/** Локальний час ресторану → ISO */
export function at(hour: number, minute = 0, dayOffset = 0) {
  return DateTime.now().setZone(TZ).startOf('day').plus({ days: dayOffset }).set({ hour, minute }).toISO()!;
}

export const today = (offset = 0) => DateTime.now().setZone(TZ).plus({ days: offset }).toISODate()!;

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE status_changes, reviews, payments, order_items, orders, reservations, refresh_tokens, dishes, categories, tables, users RESTART IDENTITY CASCADE',
  );
}

export interface Fixtures {
  users: Record<'admin' | 'staff' | 'kitchen' | 'client' | 'client2', { id: number; email: string; password: string }>;
  dishes: Record<'steak' | 'wine' | 'pizza' | 'lemonade' | 'tiramisu' | 'soup', { id: number; price: number }>;
  tables: { id: number; number: number; seats: number; qrToken: string }[];
}

export async function seedFixtures(): Promise<Fixtures> {
  await resetDb();
  const hash = await bcrypt.hash('Passw0rd!', 4);
  const mk = (email: string, role: Role, name: string) =>
    prisma.user.create({ data: { email, role, name, passwordHash: hash } });
  const [admin, staff, kitchen, client, client2] = await Promise.all([
    mk('admin@test.ua', 'ADMIN', 'Адмін'),
    mk('staff@test.ua', 'STAFF', 'Офіціант'),
    mk('kitchen@test.ua', 'KITCHEN', 'Кухар'),
    mk('client@test.ua', 'CLIENT', 'Клієнт Перший'),
    mk('client2@test.ua', 'CLIENT', 'Клієнт Другий'),
  ]);
  const main = await prisma.category.create({ data: { name: 'Основні', slug: 'main', sortOrder: 1 } });
  const drinks = await prisma.category.create({ data: { name: 'Напої', slug: 'drinks', sortOrder: 2 } });
  const desserts = await prisma.category.create({ data: { name: 'Десерти', slug: 'desserts', sortOrder: 3 } });
  const soups = await prisma.category.create({ data: { name: 'Супи', slug: 'soups', sortOrder: 4 } });
  const dish = (categoryId: number, name: string, price: number, prep = 10) =>
    prisma.dish.create({ data: { categoryId, name, description: name, price, prepTimeMin: prep } });
  const [steak, wine, pizza, lemonade, tiramisu, soup] = await Promise.all([
    dish(main.id, 'Стейк', 74500, 22),
    dish(drinks.id, 'Вино', 16500, 2),
    dish(main.id, 'Піца', 23500, 10),
    dish(drinks.id, 'Лимонад', 9500, 3),
    dish(desserts.id, 'Тірамісу', 16500, 4),
    dish(soups.id, 'Борщ', 17500, 8),
  ]);
  const tables = [];
  for (const [number, seats] of [
    [1, 2],
    [2, 4],
    [3, 6],
  ] as const) {
    tables.push(
      await prisma.diningTable.create({ data: { number, seats, qrToken: `qr-table-${number}`, zone: 'HALL' } }),
    );
  }
  const u = (x: { id: number; email: string }) => ({ id: x.id, email: x.email, password: 'Passw0rd!' });
  const d = (x: { id: number; price: number }) => ({ id: x.id, price: x.price });
  return {
    users: { admin: u(admin), staff: u(staff), kitchen: u(kitchen), client: u(client), client2: u(client2) },
    dishes: { steak: d(steak), wine: d(wine), pizza: d(pizza), lemonade: d(lemonade), tiramisu: d(tiramisu), soup: d(soup) },
    tables: tables.map((t) => ({ id: t.id, number: t.number, seats: t.seats, qrToken: t.qrToken })),
  };
}

export async function login(user: { email: string; password: string }): Promise<string> {
  const res = await api().post('/api/auth/login').send({ email: user.email, password: user.password });
  if (res.status !== 200) throw new Error(`login failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.accessToken as string;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
