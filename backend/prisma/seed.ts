/**
 * Наповнення БД демонстраційними даними:
 *  - облікові записи всіх ролей (див. README → «Тестові облікові записи»);
 *  - меню (10 категорій, 38 страв), 14 столиків з планом залу;
 *  - 45 днів історії візитів, замовлень, оплат і відгуків (для аналітики та рекомендацій);
 *  - «живий» стан ресторану на сьогодні (гості за столиками, замовлення на різних етапах, бронювання).
 *
 * Запуск: npm run db:seed   (УВАГА: повністю очищує таблиці)
 */
import { PrismaClient, type OrderStatus, type ReservationSource, type ReservationStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { DateTime } from 'luxon';
import { randomBytes } from 'node:crypto';
import { restaurant } from '../src/config';
import { openingWindow } from '../src/lib/time';
import { rankTables, type BusyInterval, type EngineTable } from '../src/modules/booking/engine';
import { CATEGORIES, CLIENT_NAMES, DISHES, PAIRINGS, TABLES, USERS, VISIT_COMMENTS, WALKIN_NAMES } from './data';

const prisma = new PrismaClient();
const TZ = restaurant.timezone;
const HISTORY_DAYS = 45;

// ─────────── детермінований генератор випадкових чисел (однакові дані при кожному запуску) ───────────
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261001);
const chance = (p: number) => rng() < p;
const randInt = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
function weighted<T>(items: [T, number][]): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r <= 0) return v;
  }
  return items[items.length - 1][0];
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const usedCodes = new Set<string>();
function reservationCode() {
  let code: string;
  do {
    code = 'R-' + Array.from({ length: 6 }, () => CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)]).join('');
  } while (usedCodes.has(code));
  usedCodes.add(code);
  return code;
}
const token = (n = 18) => randomBytes(n).toString('base64url');
const minutes = (m: number) => m * 60000;

async function wipe() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE status_changes, reviews, payments, order_items, orders, reservations, refresh_tokens, dishes, categories, tables, users RESTART IDENTITY CASCADE',
  );
  await prisma.$executeRawUnsafe('ALTER SEQUENCE orders_id_seq RESTART WITH 1001');
}

async function main() {
  const started = Date.now();
  console.log('🧹 Очищення БД…');
  await wipe();

  // ─────────────────────────────── Користувачі ───────────────────────────────
  console.log('👤 Користувачі…');
  const users: Awaited<ReturnType<typeof prisma.user.create>>[] = [];
  for (const u of USERS) {
    users.push(
      await prisma.user.create({
        data: { email: u.email, name: u.name, phone: u.phone, role: u.role, passwordHash: await bcrypt.hash(u.password, 10) },
      }),
    );
  }
  const clientHash = await bcrypt.hash('Client123!', 10);
  const extraClients: Awaited<ReturnType<typeof prisma.user.create>>[] = [];
  for (let i = 0; i < CLIENT_NAMES.length; i++) {
    extraClients.push(
      await prisma.user.create({
        data: {
          email: `guest${i + 1}@example.com`,
          name: CLIENT_NAMES[i],
          phone: `+38063${String(1000000 + i * 7919).slice(0, 7)}`,
          role: 'CLIENT',
          passwordHash: clientHash,
          createdAt: DateTime.now().minus({ days: randInt(50, 200) }).toJSDate(),
        },
      }),
    );
  }
  const demoClient = users.find((u) => u.email === 'client@smartrest.ua')!;
  const maria = users.find((u) => u.email === 'maria@smartrest.ua')!;
  const waiters = users.filter((u) => u.role === 'STAFF');
  const allClients = [demoClient, maria, ...extraClients];

  // ─────────────────────────────── Меню ───────────────────────────────
  console.log('🍽  Меню…');
  const catBySlug = new Map<string, number>();
  for (const c of CATEGORIES) {
    const created = await prisma.category.create({ data: c });
    catBySlug.set(c.slug, created.id);
  }
  const dishByKey = new Map<string, { id: number; price: number; prep: number; category: string }>();
  for (const d of DISHES) {
    const created = await prisma.dish.create({
      data: {
        categoryId: catBySlug.get(d.category)!,
        name: d.name,
        description: d.description,
        price: d.price * 100,
        imageUrl: d.image,
        weightGrams: d.weight,
        calories: d.calories,
        prepTimeMin: d.prep,
        isVegetarian: d.veg ?? false,
        isSpicy: d.spicy ?? false,
        isChefChoice: d.chef ?? false,
        tags: d.tags ?? [],
        allergens: d.allergens ?? [],
      },
    });
    dishByKey.set(d.key, { id: created.id, price: created.price, prep: d.prep, category: d.category });
  }
  const keysBy = (cat: string) => DISHES.filter((d) => d.category === cat).map((d) => d.key);

  // ─────────────────────────────── Столики ───────────────────────────────
  console.log('🪑 Столики…');
  const tables: EngineTable[] = [];
  for (const t of TABLES) {
    const created = await prisma.diningTable.create({ data: { ...t, qrToken: token(16) } });
    tables.push({ id: created.id, number: created.number, seats: created.seats, zone: created.zone, shape: created.shape, posX: created.posX, posY: created.posY });
  }

  // ─────────────────────────────── Генератор замовлень ───────────────────────────────
  const DEMO_FAVORITES = ['carbonara', 'margherita', 'aperol', 'tiramisu', 'bruschetta', 'cappuccino'];

  function composeOrder(guests: number, hour: number, favorites?: string[]): Map<string, number> {
    const lines = new Map<string, number>();
    const add = (key: string, qty = 1) => {
      lines.set(key, (lines.get(key) ?? 0) + qty);
      for (const pair of PAIRINGS[key] ?? []) if (chance(pair.p)) lines.set(pair.key, (lines.get(pair.key) ?? 0) + 1);
    };
    const choose = (cat: string) => {
      if (favorites && chance(0.55)) {
        const fav = favorites.filter((f) => dishByKey.get(f)!.category === cat);
        if (fav.length) return pick(fav);
      }
      return pick(keysBy(cat));
    };
    if (hour < 12) {
      for (let g = 0; g < guests; g++) {
        add(choose('breakfast'));
        if (chance(0.7)) add(choose('drinks'));
      }
      return lines;
    }
    const dinner = hour >= 17;
    if (chance(dinner ? 0.55 : 0.3)) add(choose('starters'));
    for (let g = 0; g < guests; g++) {
      const course = weighted<string>([
        ['main', dinner ? 5 : 3],
        ['pasta', 3],
        ['pizza', 3],
        ['soups', dinner ? 1 : 4],
        ['salads', 2],
      ]);
      add(choose(course));
      if (course === 'soups' && chance(0.5)) add(choose('main'));
      if (chance(0.45)) add(choose(dinner && chance(0.5) ? 'cocktails' : 'drinks'));
      if (chance(dinner ? 0.35 : 0.2)) add(choose('desserts'));
    }
    return lines;
  }

  function orderTotals(lines: Map<string, number>) {
    let total = 0;
    let maxPrep = 1;
    for (const [key, qty] of lines) {
      const d = dishByKey.get(key)!;
      total += d.price * qty;
      maxPrep = Math.max(maxPrep, d.prep);
    }
    return { total, maxPrep };
  }

  // ─────────────────────────────── Історія (45 днів) ───────────────────────────────
  console.log(`📅 Історія за ${HISTORY_DAYS} днів…`);
  const today = DateTime.now().setZone(TZ).startOf('day');
  let reservationsCount = 0;
  let ordersCount = 0;
  let reviewsCount = 0;

  for (let offset = HISTORY_DAYS; offset >= 1; offset--) {
    const day = today.minus({ days: offset });
    const { open, close } = openingWindow(day);
    const weekend = day.weekday === 5 || day.weekday === 6;
    const target = weekend ? randInt(20, 28) : day.weekday === 7 ? randInt(14, 20) : randInt(10, 17);
    const busy: BusyInterval[] = [];

    for (let v = 0; v < target; v++) {
      const guests = weighted<number>([[1, 5], [2, 45], [3, 13], [4, 22], [5, 5], [6, 6], [8, 2]]);
      const slot = weighted<[number, number]>([
        [[10, 12], day.weekday >= 6 ? 14 : 8],
        [[12, 16], 30],
        [[17, 21], 60],
      ]);
      const hour = randInt(slot[0], slot[1]);
      const start = day.set({ hour, minute: chance(0.5) ? 0 : 30 });
      const duration = restaurant.durationForParty(guests);
      const end = start.plus({ minutes: duration });
      if (start < open || end > close) continue;

      const ranked = rankTables(tables, busy, guests, start.toJSDate(), end.toJSDate(), open.toJSDate(), close.toJSDate(), {
        bufferMin: restaurant.bufferMin,
        minUsefulGapMin: 90,
      });
      if (!ranked.length) continue;
      const table = ranked[0].table;

      const status = weighted<ReservationStatus>([['COMPLETED', 85], ['NO_SHOW', 6], ['CANCELLED', 9]]);
      const source = weighted<ReservationSource>([['APP', 45], ['WEB', 22], ['STAFF', 21], ['WALK_IN', 12]]);
      const hasAccount = source === 'APP' || source === 'WEB' || (source === 'WALK_IN' && chance(0.4));
      const client = hasAccount ? (chance(0.07) ? demoClient : chance(0.05) ? maria : pick(allClients)) : null;
      const waiter = pick(waiters);
      const createdAt = start.minus({ hours: source === 'WALK_IN' ? 0 : randInt(2, 96) });
      const checkedIn = status === 'COMPLETED' ? start.plus({ minutes: randInt(-10, 12) }) : null;
      const completedAt = checkedIn ? checkedIn.plus({ minutes: duration - randInt(0, 35) }) : null;

      busy.push({ reservationId: -v - 1, tableId: table.id, startAt: start.toJSDate(), endAt: end.toJSDate() });
      const reservation = await prisma.reservation.create({
        data: {
          code: reservationCode(),
          checkinToken: token(),
          userId: client?.id ?? null,
          createdById: client ? client.id : waiter.id,
          tableId: table.id,
          guests,
          startAt: start.toJSDate(),
          endAt: end.toJSDate(),
          status,
          source,
          guestName: client ? null : pick(WALKIN_NAMES),
          guestPhone: client ? null : `+38067${randInt(1000000, 9999999)}`,
          confirmedAt: status !== 'CANCELLED' || chance(0.5) ? createdAt.plus({ minutes: randInt(3, 40) }).toJSDate() : null,
          checkedInAt: checkedIn?.toJSDate() ?? null,
          completedAt: completedAt?.toJSDate() ?? null,
          cancelledAt: status === 'CANCELLED' ? createdAt.plus({ hours: 1 }).toJSDate() : null,
          cancelReason: status === 'CANCELLED' ? pick(['Змінилися плани', 'Захворіли', 'Перенесли зустріч']) : null,
          createdAt: createdAt.toJSDate(),
          updatedAt: (completedAt ?? createdAt).toJSDate(),
        },
      });
      reservationsCount++;
      if (status !== 'COMPLETED' || !checkedIn || !completedAt) continue;

      const orderRounds = chance(0.28) ? 2 : 1;
      let cursor = checkedIn.plus({ minutes: randInt(4, 14) });
      for (let round = 0; round < orderRounds; round++) {
        const favorites = client?.id === demoClient.id ? DEMO_FAVORITES : undefined;
        const lines =
          round === 0
            ? composeOrder(guests, start.hour, favorites)
            : new Map<string, number>([[pick(keysBy('desserts')), randInt(1, guests)], [pick(['cappuccino', 'matcha', 'aperol']), 1]]);
        if (!lines.size) continue;
        const { total, maxPrep } = orderTotals(lines);
        const createdOrderAt = cursor;
        const confirmedAt = createdOrderAt.plus({ minutes: randInt(1, 4) });
        const preparingAt = confirmedAt.plus({ minutes: randInt(1, 6) });
        const readyAt = preparingAt.plus({ minutes: Math.round(maxPrep * (0.8 + rng() * 0.6)) });
        const servedAt = readyAt.plus({ minutes: randInt(1, 5) });
        const paidAt = round === orderRounds - 1 ? completedAt.minus({ minutes: randInt(2, 10) }) : servedAt.plus({ minutes: randInt(15, 40) });
        const paidAtFinal = paidAt < servedAt ? servedAt.plus({ minutes: 3 }) : paidAt;

        const order = await prisma.order.create({
          data: {
            reservationId: reservation.id,
            tableId: table.id,
            userId: client?.id ?? null,
            createdById: client && chance(0.7) ? client.id : waiter.id,
            status: 'PAID',
            subtotal: total,
            total,
            createdAt: createdOrderAt.toJSDate(),
            confirmedAt: confirmedAt.toJSDate(),
            preparingAt: preparingAt.toJSDate(),
            readyAt: readyAt.toJSDate(),
            servedAt: servedAt.toJSDate(),
            paidAt: paidAtFinal.toJSDate(),
            estimatedReadyAt: preparingAt.plus({ minutes: maxPrep }).toJSDate(),
            updatedAt: paidAtFinal.toJSDate(),
            items: {
              create: [...lines].map(([key, quantity]) => ({
                dishId: dishByKey.get(key)!.id,
                quantity,
                unitPrice: dishByKey.get(key)!.price,
                status: 'READY' as const,
              })),
            },
          },
        });
        ordersCount++;
        const card = chance(0.7);
        await prisma.payment.create({
          data: {
            orderId: order.id,
            amount: total,
            tip: chance(0.6) ? Math.round((total * randInt(5, 15)) / 100 / 100) * 100 : 0,
            method: card ? 'CARD' : 'CASH',
            status: 'SUCCEEDED',
            providerRef: `${card ? 'pi_sbx' : 'cash'}_${token(12)}`,
            cardBrand: card ? pick(['VISA', 'MASTERCARD']) : null,
            cardLast4: card ? pick(['4242', '4444', '1881', '0005', '7310']) : null,
            processedById: card ? null : waiter.id,
            createdAt: paidAtFinal.toJSDate(),
            paidAt: paidAtFinal.toJSDate(),
          },
        });

        if (client && round === 0 && chance(0.45)) {
          const comment = pick(VISIT_COMMENTS);
          const reviewAt = paidAtFinal.plus({ minutes: randInt(10, 600) }).toJSDate();
          await prisma.review.create({
            data: { userId: client.id, orderId: order.id, rating: comment.rating, comment: chance(0.8) ? comment.text : null, createdAt: reviewAt },
          });
          const rated = [...lines.keys()].filter(() => chance(0.6)).slice(0, 3);
          for (const key of rated) {
            const base = DISHES.find((d) => d.key === key)!.chef ? 5 : 4;
            await prisma.review.create({
              data: {
                userId: client.id,
                orderId: order.id,
                dishId: dishByKey.get(key)!.id,
                rating: Math.max(3, Math.min(5, base + weighted<number>([[0, 6], [1, 2], [-1, 2]]))),
                createdAt: reviewAt,
              },
            });
          }
          reviewsCount++;
        }
        cursor = servedAt.plus({ minutes: randInt(20, 40) });
      }
    }
  }

  // ─────────────────────────────── «Живий» стан на сьогодні ───────────────────────────────
  console.log('🔴 Живий стан ресторану на сьогодні…');
  const now = DateTime.now().setZone(TZ);
  const busyToday: BusyInterval[] = [];
  const todayWindow = openingWindow(today);
  const tomorrow = today.plus({ days: 1 });
  const tomorrowWindow = openingWindow(tomorrow);

  async function place(opts: {
    start: DateTime;
    guests: number;
    status: ReservationStatus;
    client?: { id: number } | null;
    guestName?: string;
    source?: ReservationSource;
    preferTable?: number;
    checkedInAt?: DateTime;
    notes?: string;
    window: { open: DateTime; close: DateTime };
  }) {
    const duration = restaurant.durationForParty(opts.guests);
    let end = opts.start.plus({ minutes: duration });
    if (end > opts.window.close) end = opts.window.close;
    if (end <= opts.start) return null;
    const ranked = rankTables(tables, busyToday, opts.guests, opts.start.toJSDate(), end.toJSDate(), opts.window.open.toJSDate(), opts.window.close.toJSDate(), {
      bufferMin: restaurant.bufferMin,
      minUsefulGapMin: 90,
    });
    const table = (opts.preferTable && ranked.find((r) => r.table.number === opts.preferTable)?.table) || ranked[0]?.table;
    if (!table) return null;
    busyToday.push({ reservationId: busyToday.length + 1, tableId: table.id, startAt: opts.start.toJSDate(), endAt: end.toJSDate() });
    const staff = waiters[0];
    const createdAt = opts.checkedInAt ?? now.minus({ hours: randInt(2, 30) });
    const r = await prisma.reservation.create({
      data: {
        code: reservationCode(),
        checkinToken: token(),
        userId: opts.client?.id ?? null,
        createdById: opts.client?.id ?? staff.id,
        tableId: table.id,
        guests: opts.guests,
        startAt: opts.start.toJSDate(),
        endAt: end.toJSDate(),
        status: opts.status,
        source: opts.source ?? (opts.client ? 'APP' : 'STAFF'),
        guestName: opts.client ? null : (opts.guestName ?? pick(WALKIN_NAMES)),
        guestPhone: opts.client ? null : `+38067${randInt(1000000, 9999999)}`,
        notes: opts.notes,
        confirmedAt: opts.status !== 'PENDING' ? createdAt.plus({ minutes: 5 }).toJSDate() : null,
        checkedInAt: opts.checkedInAt?.toJSDate() ?? null,
        createdAt: createdAt.toJSDate(),
      },
    });
    await prisma.statusChange.create({ data: { reservationId: r.id, fromStatus: null, toStatus: opts.status === 'CHECKED_IN' ? 'CONFIRMED' : opts.status, actorId: opts.client?.id ?? staff.id, createdAt: createdAt.toJSDate() } });
    if (opts.status === 'CHECKED_IN') {
      await prisma.statusChange.create({ data: { reservationId: r.id, fromStatus: 'CONFIRMED', toStatus: 'CHECKED_IN', actorId: staff.id, createdAt: opts.checkedInAt!.toJSDate() } });
    }
    return { ...r, table };
  }

  async function liveOrder(r: { id: number; tableId: number; userId: number | null }, keys: [string, number][], status: OrderStatus, ageMin: number) {
    const lines = new Map(keys);
    const { total, maxPrep } = orderTotals(lines);
    const created = now.minus({ minutes: ageMin });
    const confirmedAt = status !== 'NEW' ? created.plus({ minutes: 2 }) : null;
    const preparingAt = ['PREPARING', 'READY', 'SERVED'].includes(status) ? created.plus({ minutes: 4 }) : null;
    const readyAt = ['READY', 'SERVED'].includes(status) ? created.plus({ minutes: Math.min(ageMin - 1, 4 + maxPrep) }) : null;
    const servedAt = status === 'SERVED' ? created.plus({ minutes: Math.min(ageMin, 6 + maxPrep) }) : null;
    const order = await prisma.order.create({
      data: {
        reservationId: r.id,
        tableId: r.tableId,
        userId: r.userId,
        createdById: r.userId ?? waiters[1].id,
        status,
        subtotal: total,
        total,
        createdAt: created.toJSDate(),
        confirmedAt: confirmedAt?.toJSDate(),
        preparingAt: preparingAt?.toJSDate(),
        readyAt: readyAt?.toJSDate(),
        servedAt: servedAt?.toJSDate(),
        estimatedReadyAt: (preparingAt ?? confirmedAt ?? created).plus({ minutes: maxPrep + 3 }).toJSDate(),
        items: {
          create: [...lines].map(([key, quantity], i) => ({
            dishId: dishByKey.get(key)!.id,
            quantity,
            unitPrice: dishByKey.get(key)!.price,
            status: ['READY', 'SERVED'].includes(status) ? 'READY' : status === 'PREPARING' ? (i === 0 ? 'READY' : 'COOKING') : 'QUEUED',
          })),
        },
      },
    });
    const chain: OrderStatus[] = ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED'];
    const upto = chain.indexOf(status);
    for (let i = 0; i <= upto; i++) {
      await prisma.statusChange.create({
        data: { orderId: order.id, fromStatus: i ? chain[i - 1] : null, toStatus: chain[i], actorId: i === 0 ? r.userId : i === 2 || i === 3 ? users[3].id : waiters[1].id, createdAt: created.plus({ minutes: i * 2 }).toJSDate() },
      });
    }
    ordersCount++;
    return order;
  }

  const openNow = now > todayWindow.open.plus({ minutes: 50 }) && now < todayWindow.close.minus({ minutes: 60 });
  if (openNow) {
    const seatedStart = (ago: number) => now.minus({ minutes: ago }).startOf('minute');
    const a = await place({ start: seatedStart(55), guests: 4, status: 'CHECKED_IN', client: maria, preferTable: 5, checkedInAt: seatedStart(55), window: todayWindow });
    if (a) {
      await liveOrder(a, [['bruschetta', 1], ['carbonara', 2], ['ribeye', 1], ['redwine', 2], ['lemonade', 2]], 'SERVED', 48);
      await liveOrder(a, [['tiramisu', 2], ['cappuccino', 2]], 'NEW', 2);
    }
    const b = await place({ start: seatedStart(30), guests: 2, status: 'CHECKED_IN', client: extraClients[0], preferTable: 11, checkedInAt: seatedStart(30), window: todayWindow });
    if (b) await liveOrder(b, [['salmon', 1], ['risotto', 1], ['whitewine', 2]], 'PREPARING', 14);
    const c = await place({ start: seatedStart(25), guests: 3, status: 'CHECKED_IN', guestName: 'Родина Іваненків', source: 'WALK_IN', preferTable: 3, checkedInAt: seatedStart(25), window: todayWindow });
    if (c) {
      await liveOrder(c, [['borsch', 2], ['varenyky', 1], ['margherita', 1]], 'READY', 20);
      await liveOrder(c, [['orange', 3]], 'CONFIRMED', 3);
    }
    const d = await place({ start: seatedStart(12), guests: 2, status: 'CHECKED_IN', client: extraClients[3], preferTable: 13, checkedInAt: seatedStart(12), window: todayWindow });
    if (d) await liveOrder(d, [['burger', 1], ['fries', 1], ['pepperoni', 1], ['mojito', 2]], 'CONFIRMED', 5);
  }

  // Найближчі бронювання на сьогодні (якщо ще працюємо) та на завтра
  const upcomingPlan: { in: number; guests: number; status: ReservationStatus; client?: { id: number }; notes?: string }[] = [
    { in: 60, guests: 2, status: 'CONFIRMED', client: extraClients[5], notes: 'Річниця — свічка на десерт' },
    { in: 90, guests: 4, status: 'PENDING', client: extraClients[6] },
    { in: 120, guests: 6, status: 'CONFIRMED', notes: 'Діловий обід' },
    { in: 150, guests: 2, status: 'PENDING', client: extraClients[8] },
    { in: 180, guests: 8, status: 'CONFIRMED', client: extraClients[9], notes: 'День народження' },
  ];
  for (const p of upcomingPlan) {
    const raw = now.plus({ minutes: p.in });
    const start = raw.set({ minute: raw.minute < 30 ? 30 : 0, second: 0, millisecond: 0 }).plus({ hours: raw.minute < 30 ? 0 : 1 });
    if (start.plus({ minutes: restaurant.durationForParty(p.guests) }) <= todayWindow.close && start >= todayWindow.open) {
      await place({ start, guests: p.guests, status: p.status, client: p.client ?? null, notes: p.notes, window: todayWindow });
    }
  }
  const tomorrowPlan: [number, number, number, ReservationStatus, { id: number } | null][] = [
    [13, 0, 2, 'CONFIRMED', extraClients[10]],
    [18, 30, 4, 'CONFIRMED', extraClients[11]],
    [19, 0, 2, 'CONFIRMED', demoClient],
    [19, 30, 6, 'PENDING', extraClients[12]],
    [20, 0, 2, 'CONFIRMED', null],
  ];
  for (const [h, m, guests, status, client] of tomorrowPlan) {
    await place({ start: tomorrow.set({ hour: h, minute: m }), guests, status, client, window: tomorrowWindow, notes: client?.id === demoClient.id ? 'Столик біля вікна, якщо можна' : undefined });
  }

  const counts = await Promise.all([prisma.reservation.count(), prisma.order.count(), prisma.review.count()]);
  console.log(`\n✅ Готово за ${((Date.now() - started) / 1000).toFixed(1)} с`);
  console.log(`   Бронювань: ${counts[0]}, замовлень: ${counts[1]}, відгуків: ${counts[2]} (візитів з відгуком: ${reviewsCount})`);
  console.log('\n   Тестові облікові записи:');
  for (const u of USERS) console.log(`   ${u.role.padEnd(8)} ${u.email.padEnd(24)} ${u.password}`);
  void reservationsCount;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
