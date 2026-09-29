/**
 * Наскрізний сценарій захисту курсової:
 * бронювання → підтвердження → check-in (QR) → замовлення → приготування → готовність → подача → оплата → відгук.
 * Паралельно перевіряється real-time: клієнт отримує події через Socket.IO.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as ioClient, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app, api, at, bearer, login, prisma, realTime, seedFixtures, setNow, type Fixtures } from './helpers';
import { initRealtime } from '../src/lib/realtime';

let fx: Fixtures;
let client: string;
let client2: string;
let staff: string;
let kitchen: string;
let server: http.Server;
let socket: Socket;
const events: { event: string; payload: { status?: string } }[] = [];

beforeAll(async () => {
  realTime();
  fx = await seedFixtures();
  [client, client2, staff, kitchen] = await Promise.all([
    login(fx.users.client),
    login(fx.users.client2),
    login(fx.users.staff),
    login(fx.users.kitchen),
  ]);
  server = http.createServer(app);
  initRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as AddressInfo).port;
  socket = ioClient(`http://127.0.0.1:${port}`, { auth: { token: client }, transports: ['websocket'] });
  await new Promise<void>((resolve) => socket.on('hello', () => resolve()));
  socket.onAny((event, payload) => events.push({ event, payload }));
});

afterAll(async () => {
  realTime();
  socket?.close();
  await new Promise((r) => server.close(r));
});

async function waitForEvent(event: string, status?: string, timeoutMs = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (events.some((e) => e.event === event && (!status || e.payload.status === status))) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`Подія ${event}/${status} не надійшла`);
}

describe('Повний цикл: бронювання → замовлення → оплата', () => {
  const ctx: { reservationId?: number; code?: string; tableQr?: string; orderId?: number; tableNumber?: number } = {};

  it('1. Клієнт (Mobile) створює бронювання', async () => {
    setNow(18, 20);
    const res = await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(19, 0), guests: 2, notes: 'Біля вікна' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    ctx.reservationId = res.body.id;
    ctx.code = res.body.code;
    ctx.tableNumber = res.body.table.number;
    ctx.tableQr = fx.tables.find((t) => t.number === res.body.table.number)!.qrToken;
  });

  it('2. Працівник (Web) бачить бронювання і підтверджує його → клієнт отримує подію real-time', async () => {
    const list = await api().get('/api/reservations?status=PENDING').set(bearer(staff));
    expect(list.body.map((r: { id: number }) => r.id)).toContain(ctx.reservationId);
    const res = await api().patch(`/api/reservations/${ctx.reservationId}/status`).set(bearer(staff)).send({ status: 'CONFIRMED' });
    expect(res.body.status).toBe('CONFIRMED');
    await waitForEvent('reservation:updated', 'CONFIRMED');
  });

  it('3. Замовлення до check-in неможливе', async () => {
    const res = await api().post('/api/orders').set(bearer(client)).send({ items: [{ dishId: fx.dishes.steak.id, quantity: 1 }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_CHECKED_IN');
  });

  it('4. Клієнт сканує QR іншого столика → підказка; свого → check-in', async () => {
    setNow(18, 55);
    const wrongTable = fx.tables.find((t) => t.number !== ctx.tableNumber)!;
    const wrong = await api().post('/api/reservations/scan-table').set(bearer(client)).send({ qr: `smartrest://table/${wrongTable.qrToken}` });
    expect(wrong.status).toBe(409);
    expect(wrong.body.error.code).toBe('WRONG_TABLE');
    const ok = await api().post('/api/reservations/scan-table').set(bearer(client)).send({ qr: `smartrest://table/${ctx.tableQr}` });
    expect(ok.status).toBe(200);
    expect(ok.body.action).toBe('CHECKED_IN');
    expect(ok.body.reservation.status).toBe('CHECKED_IN');
  });

  it('5. Стоп-лист: недоступну страву замовити не можна', async () => {
    await api().patch(`/api/dishes/${fx.dishes.pizza.id}/availability`).set(bearer(kitchen)).send({ isAvailable: false });
    const res = await api().post('/api/orders').set(bearer(client)).send({ items: [{ dishId: fx.dishes.pizza.id, quantity: 1 }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DISH_UNAVAILABLE');
    await api().patch(`/api/dishes/${fx.dishes.pizza.id}/availability`).set(bearer(kitchen)).send({ isAvailable: true });
  });

  it('6. Клієнт робить замовлення; сума рахується на сервері', async () => {
    const res = await api()
      .post('/api/orders')
      .set(bearer(client))
      .send({
        items: [
          { dishId: fx.dishes.steak.id, quantity: 1, notes: 'medium rare' },
          { dishId: fx.dishes.wine.id, quantity: 2 },
          { dishId: fx.dishes.wine.id, quantity: 1 }, // дублікати об'єднуються
        ],
        // спроба підмінити ціну ігнорується — схема її не приймає
        total: 1,
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('NEW');
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(fx.dishes.steak.price + 3 * fx.dishes.wine.price);
    expect(res.body.estimatedReadyAt).toBeTruthy();
    ctx.orderId = res.body.id;
  });

  it('7. Чужий клієнт не бачить замовлення, а неготове замовлення не можна оплатити', async () => {
    expect((await api().get(`/api/orders/${ctx.orderId}`).set(bearer(client2))).status).toBe(403);
    const pay = await api()
      .post('/api/payments/card')
      .set(bearer(client))
      .send({ orderId: ctx.orderId, card: { number: '4242424242424242', expMonth: 12, expYear: 2099, cvc: '123' } });
    expect(pay.status).toBe(409);
    expect(pay.body.error.code).toBe('ORDER_NOT_SERVED');
  });

  it('8. Офіціант приймає замовлення → кухня бачить його в черзі', async () => {
    const kitchenBefore = await api().get('/api/kitchen/orders').set(bearer(kitchen));
    expect(kitchenBefore.body.map((o: { id: number }) => o.id)).not.toContain(ctx.orderId);
    const res = await api().patch(`/api/orders/${ctx.orderId}/status`).set(bearer(staff)).send({ status: 'CONFIRMED' });
    expect(res.body.status).toBe('CONFIRMED');
    const kitchenAfter = await api().get('/api/kitchen/orders').set(bearer(kitchen));
    expect(kitchenAfter.body.map((o: { id: number }) => o.id)).toContain(ctx.orderId);
    await waitForEvent('order:updated', 'CONFIRMED');
  });

  it('9. Офіціант не може «приготувати» замовлення — це дія кухні', async () => {
    const res = await api().patch(`/api/orders/${ctx.orderId}/status`).set(bearer(staff)).send({ status: 'PREPARING' });
    expect(res.status).toBe(403);
  });

  it('10. Kitchen display: відмітка першої страви → PREPARING, усіх → READY автоматично', async () => {
    const order = await api().get(`/api/orders/${ctx.orderId}`).set(bearer(kitchen));
    const [first, second] = order.body.items;
    const r1 = await api().patch(`/api/kitchen/orders/${ctx.orderId}/items/${first.id}`).set(bearer(kitchen)).send({ status: 'READY' });
    expect(r1.body.status).toBe('PREPARING');
    const r2 = await api().patch(`/api/kitchen/orders/${ctx.orderId}/items/${second.id}`).set(bearer(kitchen)).send({ status: 'READY' });
    expect(r2.body.status).toBe('READY');
    await waitForEvent('order:updated', 'READY');
  });

  it('11. Офіціант подає страви', async () => {
    const res = await api().patch(`/api/orders/${ctx.orderId}/status`).set(bearer(staff)).send({ status: 'SERVED' });
    expect(res.body.status).toBe('SERVED');
    expect(res.body.actions.canPay).toBe(true); // офіціант може прийняти оплату готівкою/терміналом
    const mine = await api().get(`/api/orders/${ctx.orderId}`).set(bearer(client));
    expect(mine.body.actions.canPay).toBe(true);
  });

  it('12. Завершити візит з неоплаченим замовленням не можна', async () => {
    const res = await api().patch(`/api/reservations/${ctx.reservationId}/status`).set(bearer(staff)).send({ status: 'COMPLETED' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('UNPAID_ORDERS');
  });

  it('13. Sandbox-оплата: відмова банку → 402; некоректний номер → 422', async () => {
    const declined = await api()
      .post('/api/payments/card')
      .set(bearer(client))
      .send({ orderId: ctx.orderId, card: { number: '4000 0000 0000 0002', expMonth: 12, expYear: 2099, cvc: '123' } });
    expect(declined.status).toBe(402);
    expect(declined.body.error.details.reason).toBe('card_declined');
    const invalid = await api()
      .post('/api/payments/card')
      .set(bearer(client))
      .send({ orderId: ctx.orderId, card: { number: '4242 4242 4242 4241', expMonth: 12, expYear: 2099, cvc: '123' } });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('CARD_INVALID');
  });

  it('14. 3-D Secure: невірний код → відмова, правильний → оплачено', async () => {
    const pay3ds = async () =>
      api()
        .post('/api/payments/card')
        .set(bearer(client))
        .send({ orderId: ctx.orderId, tip: 5000, card: { number: '4000000000003220', expMonth: 12, expYear: 2099, cvc: '123' } });
    const first = await pay3ds();
    expect(first.status).toBe(200);
    expect(first.body.requiresAction).toBe(true);
    const bad = await api().post(`/api/payments/${first.body.payment.id}/confirm`).set(bearer(client)).send({ otp: '000000' });
    expect(bad.status).toBe(402);

    const second = await pay3ds();
    const ok = await api().post(`/api/payments/${second.body.payment.id}/confirm`).set(bearer(client)).send({ otp: '123456' });
    expect(ok.status).toBe(200);
    expect(ok.body.payment).toMatchObject({ status: 'SUCCEEDED', tip: 5000, cardLast4: '3220', cardBrand: 'VISA' });
    expect(ok.body.order.status).toBe('PAID');
    await waitForEvent('payment:succeeded');
  });

  it('15. Повторна оплата неможлива; у БД рівно один успішний платіж', async () => {
    const again = await api()
      .post('/api/payments/card')
      .set(bearer(client))
      .send({ orderId: ctx.orderId, card: { number: '4242424242424242', expMonth: 12, expYear: 2099, cvc: '123' } });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_PAID');
    const succeeded = await prisma.payment.count({ where: { orderId: ctx.orderId, status: 'SUCCEEDED' } });
    expect(succeeded).toBe(1);
    const card = await prisma.payment.findFirstOrThrow({ where: { orderId: ctx.orderId, status: 'SUCCEEDED' } });
    expect(JSON.stringify(card)).not.toContain('4000000000003220'); // повний номер картки не зберігається
  });

  it('16. Клієнт залишає відгук (лише один раз)', async () => {
    const review = {
      rating: 5,
      comment: 'Чудово!',
      dishes: [{ dishId: fx.dishes.steak.id, rating: 5 }],
    };
    const res = await api().post(`/api/orders/${ctx.orderId}/review`).set(bearer(client)).send(review);
    expect(res.status).toBe(201);
    expect(res.body.reviewsCreated).toBe(2);
    const dup = await api().post(`/api/orders/${ctx.orderId}/review`).set(bearer(client)).send(review);
    expect(dup.status).toBe(409);
    const dish = await api().get(`/api/dishes/${fx.dishes.steak.id}`);
    expect(dish.body.avgRating).toBe(5);
  });

  it('17. Клієнт завершує візит → столик звільняється; історія статусів збережена', async () => {
    const res = await api().patch(`/api/reservations/${ctx.reservationId}/status`).set(bearer(client)).send({ status: 'COMPLETED' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('COMPLETED');
    const details = await api().get(`/api/reservations/${ctx.reservationId}`).set(bearer(client));
    expect(details.body.history.map((h: { to: string }) => h.to)).toEqual(['PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED']);
    const order = await api().get(`/api/orders/${ctx.orderId}`).set(bearer(client));
    expect(order.body.history.map((h: { to: string }) => h.to)).toEqual(['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'PAID']);
  });
});

describe('Офіціант (POS) та ідемпотентність оплат', () => {
  it('офіціант створює замовлення для столика — одразу CONFIRMED; оплата готівкою', async () => {
    setNow(20, 0);
    const walk = await api().post('/api/reservations/walk-in').set(bearer(staff)).send({ tableId: fx.tables[2].id, guests: 5, guestName: 'Компанія' });
    expect(walk.status).toBe(201);
    const order = await api()
      .post('/api/orders')
      .set(bearer(staff))
      .send({ tableId: fx.tables[2].id, items: [{ dishId: fx.dishes.soup.id, quantity: 5 }] });
    expect(order.body.status).toBe('CONFIRMED');
    const cancelNoReason = await api().patch(`/api/orders/${order.body.id}/status`).set(bearer(staff)).send({ status: 'CANCELLED' });
    expect(cancelNoReason.status).toBe(422);

    await api().patch(`/api/orders/${order.body.id}/status`).set(bearer(kitchen)).send({ status: 'PREPARING' });
    await api().patch(`/api/orders/${order.body.id}/status`).set(bearer(kitchen)).send({ status: 'READY' });
    await api().patch(`/api/orders/${order.body.id}/status`).set(bearer(staff)).send({ status: 'SERVED' });
    const cash = await api().post('/api/payments/cash').set(bearer(staff)).send({ orderId: order.body.id, tip: 10000 });
    expect(cash.status).toBe(200);
    expect(cash.body.payment).toMatchObject({ method: 'CASH', status: 'SUCCEEDED' });
  });

  it('Idempotency-Key: повторний запит не створює другий платіж', async () => {
    const walk = await api().post('/api/reservations/walk-in').set(bearer(client2)).send({ qr: fx.tables[1].qrToken, guests: 2 });
    expect(walk.status).toBe(201);
    const order = await api().post('/api/orders').set(bearer(client2)).send({ items: [{ dishId: fx.dishes.lemonade.id, quantity: 2 }] });
    await api().patch(`/api/orders/${order.body.id}/status`).set(bearer(staff)).send({ status: 'CONFIRMED' });
    await api().patch(`/api/orders/${order.body.id}/status`).set(bearer(kitchen)).send({ status: 'PREPARING' });
    await api().patch(`/api/orders/${order.body.id}/status`).set(bearer(kitchen)).send({ status: 'READY' });
    await api().patch(`/api/orders/${order.body.id}/status`).set(bearer(staff)).send({ status: 'SERVED' });
    const body = { orderId: order.body.id, card: { number: '5555555555554444', expMonth: 1, expYear: 2099, cvc: '999' } };
    const first = await api().post('/api/payments/card').set(bearer(client2)).set('Idempotency-Key', 'idem-1').send(body);
    const replay = await api().post('/api/payments/card').set(bearer(client2)).set('Idempotency-Key', 'idem-1').send(body);
    expect(first.body.payment.status).toBe('SUCCEEDED');
    expect(replay.body.replayed).toBe(true);
    expect(replay.body.payment.id).toBe(first.body.payment.id);
    expect(await prisma.payment.count({ where: { orderId: order.body.id } })).toBe(1);
  });

  it('аналітика враховує оплачені замовлення', async () => {
    const admin = await login(fx.users.admin);
    const res = await api().get('/api/analytics/overview?days=7').set(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.kpis.paidOrders).toBeGreaterThanOrEqual(3);
    expect(res.body.topDishes.length).toBeGreaterThan(0);
    const todayStats = await api().get('/api/analytics/today').set(bearer(staff));
    expect(todayStats.body.revenue).toBeGreaterThan(0);
  });

  it('рекомендації повертають пояснення', async () => {
    const res = await api().get(`/api/recommendations?cart=${fx.dishes.steak.id}`).set(bearer(client));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('reasons');
    expect(res.body.map((r: { dish: { id: number } }) => r.dish.id)).not.toContain(fx.dishes.steak.id);
  });
});
