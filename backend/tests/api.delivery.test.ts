/**
 * DELIVERY API — окремий сервіс доставки на спільній БД.
 * Перевіряємо бізнес-правила доставки, оплату, роботу курʼєра, взаємодію з кухнею Restaurant API,
 * обмеження цілісності БД і шину подій PostgreSQL LISTEN/NOTIFY між системами.
 */
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, login, prisma, realTime, seedFixtures, setNow, type Fixtures } from './helpers';
import { createDeliveryApp } from '../src/delivery/app';
import { runDeliveryMaintenance } from '../src/delivery/scheduler';
import { ORDER_CHANNEL, setSystemName, subscribeOrderEvents, type OrderBusEvent } from '../src/lib/bus';

const deliveryApp = createDeliveryApp();
const dapi = () => request(deliveryApp);

let fx: Fixtures;
let client: string;
let client2: string;
let staff: string;
let kitchen: string;
let admin: string;
let courier: string;
let courier2: string;
let zones: { center: number; far: number; closed: number };
let courierIds: { c1: number; c2: number };

const cashBody = (items: { dishId: number; quantity: number }[], extra: Record<string, unknown> = {}) => ({
  items,
  address: { zoneId: zones.center, street: 'вул. Мечникова', house: '12', apartment: '5' },
  phone: '0501234567',
  paymentMethod: 'CASH',
  ...extra,
});

async function cookAll(orderId: number) {
  const k = await api().get('/api/kitchen/orders').set(bearer(kitchen));
  const o = k.body.find((x: { id: number }) => x.id === orderId);
  for (const it of o.items) {
    await api().patch(`/api/kitchen/orders/${orderId}/items/${it.id}`).set(bearer(kitchen)).send({ status: 'READY' }).expect(200);
  }
}

beforeAll(async () => {
  realTime();
  fx = await seedFixtures();
  const hash = await bcrypt.hash('Passw0rd!', 4);
  const [c1, c2] = await Promise.all([
    prisma.user.create({ data: { email: 'courier@test.ua', role: 'COURIER', name: 'Курʼєр Один', phone: '+380670000001', passwordHash: hash } }),
    prisma.user.create({ data: { email: 'courier2@test.ua', role: 'COURIER', name: 'Курʼєр Два', passwordHash: hash } }),
  ]);
  courierIds = { c1: c1.id, c2: c2.id };
  const [center, far, closed] = await Promise.all([
    prisma.deliveryZone.create({ data: { name: 'Печерський', fee: 4900, minOrder: 30000, freeFrom: 80000, travelMin: 15, sortOrder: 1 } }),
    prisma.deliveryZone.create({ data: { name: 'Оболонський', fee: 8900, minOrder: 50000, travelMin: 35, sortOrder: 2 } }),
    prisma.deliveryZone.create({ data: { name: 'Бровари', fee: 14900, minOrder: 80000, travelMin: 45, isActive: false } }),
  ]);
  zones = { center: center.id, far: far.id, closed: closed.id };
  [client, client2, staff, kitchen, admin, courier, courier2] = await Promise.all([
    login(fx.users.client),
    login(fx.users.client2),
    login(fx.users.staff),
    login(fx.users.kitchen),
    login(fx.users.admin),
    login({ email: 'courier@test.ua', password: 'Passw0rd!' }),
    login({ email: 'courier2@test.ua', password: 'Passw0rd!' }),
  ]);
});

afterAll(() => realTime());

describe('TC-D01 Єдиний вхід і довідники доставки', () => {
  it('токен Restaurant API приймається Delivery API (SSO); без токена — 401', async () => {
    const me = await dapi().get('/api/me').set(bearer(client)).expect(200);
    expect(me.body).toMatchObject({ email: fx.users.client.email, role: 'CLIENT' });
    await dapi().get('/api/me').expect(401);
  });

  it('у години роботи доставка відкрита; клієнт бачить лише активні зони, адміністратор — усі', async () => {
    setNow(13, 0);
    const info = await dapi().get('/api/delivery/info').expect(200);
    expect(info.body.window.isOpen).toBe(true);
    expect(info.body.zones.map((z: { name: string }) => z.name)).toEqual(['Печерський', 'Оболонський']);
    const all = await dapi().get('/api/delivery/zones?all=true').set(bearer(admin)).expect(200);
    expect(all.body).toHaveLength(3);
    const notAdmin = await dapi().get('/api/delivery/zones?all=true').set(bearer(client)).expect(200);
    expect(notAdmin.body).toHaveLength(2);
  });

  it('розрахунок: мінімальна сума і безкоштовна доставка від порогу', async () => {
    setNow(13, 0);
    const small = await dapi().post('/api/delivery/quote').send({ zoneId: zones.center, items: [{ dishId: fx.dishes.pizza.id, quantity: 1 }] }).expect(200);
    expect(small.body).toMatchObject({ subtotal: 23500, fee: 4900, total: 28400, canOrder: false, missingToMin: 6500 });
    const big = await dapi().post('/api/delivery/quote').send({ zoneId: zones.center, items: [{ dishId: fx.dishes.steak.id, quantity: 2 }] }).expect(200);
    expect(big.body).toMatchObject({ subtotal: 149000, fee: 0, total: 149000, canOrder: true });
    expect(big.body.etaMinutes).toBeGreaterThan(15);
  });

  it('лише адміністратор змінює зони', async () => {
    await dapi().patch(`/api/delivery/zones/${zones.far}`).set(bearer(staff)).send({ fee: 9900 }).expect(403);
    const upd = await dapi().patch(`/api/delivery/zones/${zones.far}`).set(bearer(admin)).send({ fee: 9900 }).expect(200);
    expect(upd.body.fee).toBe(9900);
    await dapi().patch(`/api/delivery/zones/${zones.far}`).set(bearer(admin)).send({ travelMin: 2 }).expect(400);
  });
});

describe('TC-D02 Правила оформлення доставки', () => {
  it('сума нижча за мінімальну → 422 BELOW_MIN_ORDER', async () => {
    setNow(13, 0);
    const res = await dapi().post('/api/delivery/orders').set(bearer(client)).send(cashBody([{ dishId: fx.dishes.pizza.id, quantity: 1 }])).expect(422);
    expect(res.body.error.code).toBe('BELOW_MIN_ORDER');
    expect(res.body.error.details.missing).toBe(6500);
  });

  it('неактивна зона → 409, некоректний телефон → 422, не клієнт → 403', async () => {
    setNow(13, 0);
    const items = [{ dishId: fx.dishes.steak.id, quantity: 1 }];
    const z = await dapi().post('/api/delivery/orders').set(bearer(client)).send(cashBody(items, { address: { zoneId: zones.closed, street: 'бульв. Незалежності', house: '1' } })).expect(409);
    expect(z.body.error.code).toBe('ZONE_INACTIVE');
    const p = await dapi().post('/api/delivery/orders').set(bearer(client)).send(cashBody(items, { phone: '1234567890' })).expect(422);
    expect(p.body.error.code).toBe('PHONE_INVALID');
    await dapi().post('/api/delivery/orders').set(bearer(staff)).send(cashBody(items)).expect(403);
  });

  it('страва зі стоп-листа не потрапить у доставку', async () => {
    setNow(13, 0);
    await prisma.dish.update({ where: { id: fx.dishes.tiramisu.id }, data: { isAvailable: false } });
    const res = await dapi()
      .post('/api/delivery/orders')
      .set(bearer(client))
      .send(cashBody([{ dishId: fx.dishes.steak.id, quantity: 1 }, { dishId: fx.dishes.tiramisu.id, quantity: 1 }]))
      .expect(409);
    expect(res.body.error.code).toBe('DISH_UNAVAILABLE');
    await prisma.dish.update({ where: { id: fx.dishes.tiramisu.id }, data: { isAvailable: true } });
  });

  it('поза годинами доставки → 409 DELIVERY_CLOSED з часом відкриття', async () => {
    setNow(23, 30);
    const res = await dapi().post('/api/delivery/orders').set(bearer(client)).send(cashBody([{ dishId: fx.dishes.steak.id, quantity: 1 }])).expect(409);
    expect(res.body.error.code).toBe('DELIVERY_CLOSED');
    expect(res.body.error.message).toMatch(/відкриємось/);
    setNow(13, 0);
  });

  it('решта з суми, меншої за замовлення → 422', async () => {
    setNow(13, 0);
    const res = await dapi()
      .post('/api/delivery/orders')
      .set(bearer(client))
      .send(cashBody([{ dishId: fx.dishes.steak.id, quantity: 1 }], { changeFrom: 50000 }))
      .expect(422);
    expect(res.body.error.code).toBe('CHANGE_TOO_SMALL');
  });
});

describe('TC-D03 Готівка: клієнт → кухня (Restaurant API) → курʼєр → вручення', () => {
  const ctx: { id?: number } = {};

  it('замовлення з оплатою готівкою одразу CONFIRMED, ціни й доставка — з БД', async () => {
    setNow(13, 0);
    const res = await dapi()
      .post('/api/delivery/orders')
      .set(bearer(client))
      .send(cashBody([{ dishId: fx.dishes.pizza.id, quantity: 2 }], { changeFrom: 60000, saveAddressAs: 'Дім' }))
      .expect(201);
    ctx.id = res.body.id;
    expect(res.body).toMatchObject({ type: 'DELIVERY', status: 'CONFIRMED', subtotal: 47000, total: 51900, table: null });
    expect(res.body.delivery).toMatchObject({ fee: 4900, phone: '+380501234567', paymentMethod: 'CASH', changeFrom: 60000 });
    expect(res.body.delivery.addressLine).toContain('кв. 5');
    const addresses = await dapi().get('/api/addresses').set(bearer(client)).expect(200);
    expect(addresses.body).toHaveLength(1);
    expect(addresses.body[0]).toMatchObject({ label: 'Дім', isDefault: true });
  });

  it('кухня бачить доставку у kitchen display Restaurant API разом із замовленнями залу', async () => {
    const k = await api().get('/api/kitchen/orders').set(bearer(kitchen)).expect(200);
    expect(k.body.find((o: { id: number }) => o.id === ctx.id)).toMatchObject({ type: 'DELIVERY', table: null });
  });

  it('курʼєр бере замовлення, поки воно готується; інший курʼєр — 409', async () => {
    const avail = await dapi().get('/api/courier/orders?scope=available').set(bearer(courier)).expect(200);
    expect(avail.body.some((o: { id: number }) => o.id === ctx.id)).toBe(true);
    const acc = await dapi().post(`/api/courier/orders/${ctx.id}/accept`).set(bearer(courier)).expect(200);
    expect(acc.body.delivery.courier).toMatchObject({ id: courierIds.c1 });
    const second = await dapi().post(`/api/courier/orders/${ctx.id}/accept`).set(bearer(courier2)).expect(409);
    expect(second.body.error.code).toBe('ALREADY_TAKEN');
    await dapi().get(`/api/delivery/orders/${ctx.id}`).set(bearer(courier2)).expect(403);
  });

  it('забрати можна лише готове замовлення; статуси курʼєра недоступні через Restaurant API', async () => {
    const early = await dapi().post(`/api/courier/orders/${ctx.id}/pickup`).set(bearer(courier)).expect(409);
    expect(early.body.error.code).toBe('NOT_READY');
    await cookAll(ctx.id!);
    const viaRestaurant = await api().patch(`/api/orders/${ctx.id}/status`).set(bearer(admin)).send({ status: 'DELIVERING' }).expect(409);
    expect(viaRestaurant.body.error.code).toBe('USE_DELIVERY_API');
    await dapi().post(`/api/courier/orders/${ctx.id}/pickup`).set(bearer(courier2)).expect(403);
    const picked = await dapi().post(`/api/courier/orders/${ctx.id}/pickup`).set(bearer(courier)).expect(200);
    expect(picked.body.status).toBe('DELIVERING');
    expect(picked.body.delivery.pickedUpAt).toBeTruthy();
  });

  it('вручення: готівковий платіж фіксує курʼєр, замовлення DELIVERED, відгук стає доступним', async () => {
    setNow(13, 40);
    const done = await dapi().post(`/api/courier/orders/${ctx.id}/delivered`).set(bearer(courier)).send({ tip: 2000 }).expect(200);
    expect(done.body.status).toBe('DELIVERED');
    expect(done.body.payment).toMatchObject({ method: 'CASH', amount: 51900, tip: 2000 });
    const pay = await prisma.payment.findFirstOrThrow({ where: { orderId: ctx.id } });
    expect(pay.processedById).toBe(courierIds.c1);
    const summary = await dapi().get('/api/courier/summary').set(bearer(courier)).expect(200);
    expect(summary.body).toMatchObject({ deliveredToday: 1, cashOnHand: 53900, tipsToday: 2000 });
    const review = await api()
      .post(`/api/orders/${ctx.id}/review`)
      .set(bearer(client))
      .send({ rating: 5, comment: 'Гаряча і швидко', dishes: [{ dishId: fx.dishes.pizza.id, rating: 5 }] })
      .expect(201);
    expect(review.body.reviewsCreated).toBe(2);
    const hist = await dapi().get(`/api/delivery/orders/${ctx.id}`).set(bearer(client)).expect(200);
    expect(hist.body.history.map((h: { to: string }) => h.to)).toEqual(expect.arrayContaining(['CONFIRMED', 'PREPARING', 'READY', 'DELIVERING', 'DELIVERED']));
  });
});

describe('TC-D04 Картка: NEW → оплата (3-D Secure, ідемпотентність) → кухня', () => {
  const ctx: { id?: number; paymentId?: number } = {};

  it('неоплачене онлайн-замовлення не бачать ні зал, ні кухня', async () => {
    setNow(14, 0);
    const res = await dapi()
      .post('/api/delivery/orders')
      .set(bearer(client2))
      .send({ ...cashBody([{ dishId: fx.dishes.steak.id, quantity: 1 }]), paymentMethod: 'CARD' })
      .expect(201);
    ctx.id = res.body.id;
    expect(res.body).toMatchObject({ status: 'NEW', statusLabel: 'Очікує оплати' });
    expect(res.body.actions.canPay).toBe(true);
    const staffList = await api().get('/api/orders').set(bearer(staff)).expect(200);
    expect(staffList.body.some((o: { id: number }) => o.id === ctx.id)).toBe(false);
    const k = await api().get('/api/kitchen/orders').set(bearer(kitchen)).expect(200);
    expect(k.body.some((o: { id: number }) => o.id === ctx.id)).toBe(false);
  });

  it('відмова банку → 402, замовлення лишається NEW; чужий клієнт не може платити', async () => {
    const card = { number: '4000000000000002', expMonth: 12, expYear: 2031, cvc: '123' };
    const declined = await dapi().post(`/api/delivery/orders/${ctx.id}/pay`).set(bearer(client2)).send({ card }).expect(402);
    expect(declined.body.error.code).toBe('PAYMENT_DECLINED');
    await dapi().post(`/api/delivery/orders/${ctx.id}/pay`).set(bearer(client)).send({ card: { ...card, number: '4242424242424242' } }).expect(403);
  });

  it('3-D Secure → CONFIRMED; повтор з тим самим Idempotency-Key не створює другий платіж', async () => {
    const card = { number: '4000000000003220', expMonth: 12, expYear: 2031, cvc: '123' };
    const first = await dapi().post(`/api/delivery/orders/${ctx.id}/pay`).set(bearer(client2)).set('Idempotency-Key', 'd-key-1').send({ card, tip: 1000 }).expect(200);
    expect(first.body.requiresAction).toBe(true);
    ctx.paymentId = first.body.payment.id;
    const replay = await dapi().post(`/api/delivery/orders/${ctx.id}/pay`).set(bearer(client2)).set('Idempotency-Key', 'd-key-1').send({ card, tip: 1000 }).expect(200);
    expect(replay.body).toMatchObject({ replayed: true, payment: { id: ctx.paymentId } });
    const ok = await dapi().post(`/api/delivery/payments/${ctx.paymentId}/confirm`).set(bearer(client2)).send({ otp: '123456' }).expect(200);
    expect(ok.body.order).toMatchObject({ status: 'CONFIRMED', payment: { method: 'CARD', amount: 79400, tip: 1000 } });
    const again = await dapi()
      .post(`/api/delivery/orders/${ctx.id}/pay`)
      .set(bearer(client2))
      .send({ card: { ...card, number: '4242424242424242' } })
      .expect(409);
    expect(again.body.error.code).toBe('ALREADY_PAID');
    const k = await api().get('/api/kitchen/orders').set(bearer(kitchen)).expect(200);
    expect(k.body.some((o: { id: number }) => o.id === ctx.id)).toBe(true);
  });

  it('скасування оплаченого замовлення до приготування → повернення коштів (REFUNDED)', async () => {
    const res = await dapi().post(`/api/delivery/orders/${ctx.id}/cancel`).set(bearer(client2)).send({}).expect(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.refunded).toMatchObject({ amount: 80400 });
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: ctx.paymentId } });
    expect(p.status).toBe('REFUNDED');
  });
});

describe('TC-D05 Обмеження: скасування, ліміти, доступ', () => {
  it('клієнт не може скасувати замовлення, яке вже готується; адміністратор — лише з причиною', async () => {
    setNow(15, 0);
    const res = await dapi().post('/api/delivery/orders').set(bearer(client)).send(cashBody([{ dishId: fx.dishes.steak.id, quantity: 1 }])).expect(201);
    const k = await api().get('/api/kitchen/orders').set(bearer(kitchen));
    const item = k.body.find((o: { id: number }) => o.id === res.body.id).items[0];
    await api().patch(`/api/kitchen/orders/${res.body.id}/items/${item.id}`).set(bearer(kitchen)).send({ status: 'COOKING' }).expect(200);
    const late = await dapi().post(`/api/delivery/orders/${res.body.id}/cancel`).set(bearer(client)).send({}).expect(409);
    expect(late.body.error.code).toBe('TOO_LATE_TO_CANCEL');
    const noReason = await dapi().post(`/api/delivery/orders/${res.body.id}/cancel`).set(bearer(admin)).send({}).expect(422);
    expect(noReason.body.error.code).toBe('REASON_REQUIRED');
    await dapi().post(`/api/delivery/orders/${res.body.id}/cancel`).set(bearer(admin)).send({ reason: 'Курʼєр потрапив у ДТП' }).expect(200);
    await dapi().get(`/api/delivery/orders/${res.body.id}`).set(bearer(client2)).expect(403);
  });

  it('клієнт — не більше 3 активних доставок; курʼєр — не більше 2 замовлень одночасно', async () => {
    setNow(15, 30);
    const ids: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await dapi().post('/api/delivery/orders').set(bearer(client2)).send(cashBody([{ dishId: fx.dishes.steak.id, quantity: 1 }])).expect(201);
      ids.push(r.body.id);
    }
    const fourth = await dapi().post('/api/delivery/orders').set(bearer(client2)).send(cashBody([{ dishId: fx.dishes.steak.id, quantity: 1 }])).expect(409);
    expect(fourth.body.error.code).toBe('TOO_MANY_ACTIVE_DELIVERIES');

    await dapi().post(`/api/courier/orders/${ids[0]}/accept`).set(bearer(courier2)).expect(200);
    await dapi().post(`/api/courier/orders/${ids[1]}/accept`).set(bearer(courier2)).expect(200);
    const busy = await dapi().post(`/api/courier/orders/${ids[2]}/accept`).set(bearer(courier2)).expect(409);
    expect(busy.body.error.code).toBe('COURIER_BUSY');
    // відмова звільняє місце; диспетчер може призначити курʼєра сам
    await dapi().post(`/api/courier/orders/${ids[1]}/release`).set(bearer(courier2)).expect(200);
    const assigned = await dapi().post(`/api/delivery/orders/${ids[2]}/assign`).set(bearer(staff)).send({ courierId: courierIds.c2 }).expect(200);
    expect(assigned.body.delivery.courier.id).toBe(courierIds.c2);
    const notCourier = await dapi().post(`/api/delivery/orders/${ids[1]}/assign`).set(bearer(staff)).send({ courierId: fx.users.client.id }).expect(422);
    expect(notCourier.body.error.code).toBe('NOT_A_COURIER');
    const couriers = await dapi().get('/api/courier/couriers').set(bearer(admin)).expect(200);
    expect(couriers.body.find((c: { id: number }) => c.id === courierIds.c2).active).toBe(2);
  });

  it('фонова задача скасовує онлайн-замовлення, не оплачені за 15 хв', async () => {
    setNow(16, 0);
    await prisma.order.updateMany({ where: { userId: fx.users.client2.id, type: 'DELIVERY', status: { notIn: ['CANCELLED', 'DELIVERED'] } }, data: { status: 'CANCELLED' } });
    const r = await dapi().post('/api/delivery/orders').set(bearer(client2)).send({ ...cashBody([{ dishId: fx.dishes.steak.id, quantity: 1 }]), paymentMethod: 'CARD' }).expect(201);
    setNow(16, 10);
    expect((await runDeliveryMaintenance()).cancelled).toBe(0);
    setNow(16, 20);
    expect((await runDeliveryMaintenance()).cancelled).toBe(1);
    const o = await prisma.order.findUniqueOrThrow({ where: { id: r.body.id } });
    expect(o.status).toBe('CANCELLED');
    expect(o.cancelReason).toMatch(/Не оплачено/);
  });
});

describe('TC-D06 Збережені адреси', () => {
  it('перша адреса стає основною; нова основна знімає позначку зі старої; видалення основної передає її іншій', async () => {
    const first = await dapi().post('/api/addresses').set(bearer(client2)).send({ label: 'Дім', zoneId: zones.center, street: 'вул. Інститутська', house: '3' }).expect(201);
    expect(first.body.isDefault).toBe(true);
    const second = await dapi().post('/api/addresses').set(bearer(client2)).send({ label: 'Робота', zoneId: zones.far, street: 'вул. Йорданська', house: '4', isDefault: true }).expect(201);
    expect(second.body.isDefault).toBe(true);
    let list = await dapi().get('/api/addresses').set(bearer(client2)).expect(200);
    expect(list.body.filter((a: { isDefault: boolean }) => a.isDefault)).toHaveLength(1);
    await dapi().delete(`/api/addresses/${second.body.id}`).set(bearer(client2)).expect(204);
    list = await dapi().get('/api/addresses').set(bearer(client2)).expect(200);
    expect(list.body).toEqual([expect.objectContaining({ id: first.body.id, isDefault: true })]);
    await dapi().delete(`/api/addresses/${first.body.id}`).set(bearer(client)).expect(404);
    await dapi().post('/api/addresses').set(bearer(client2)).send({ label: 'Дача', zoneId: zones.closed, street: 'вул. Лісна', house: '1' }).expect(409);
  });
});

describe('TC-D07 Обмеження цілісності БД для доставки', () => {
  it('доставка не може мати столика; рядок доставки — лише для замовлення типу DELIVERY; телефон у форматі +380', async () => {
    const reservation = await prisma.reservation.findFirst();
    const table = await prisma.diningTable.findFirstOrThrow();
    await expect(
      prisma.order.create({
        data: { type: 'DELIVERY', tableId: table.id, reservationId: reservation?.id, createdById: fx.users.client.id, subtotal: 100, total: 100 },
      }),
    ).rejects.toThrow(/orders_type_consistency|check constraint|violates/i);
    await expect(
      prisma.order.create({ data: { type: 'DINE_IN', createdById: fx.users.client.id, subtotal: 100, total: 100 } }),
    ).rejects.toThrow();

    const delivery = await prisma.order.findFirstOrThrow({ where: { type: 'DELIVERY' } });
    await expect(
      prisma.$executeRawUnsafe(`UPDATE deliveries SET phone = '0501234567' WHERE order_id = ${delivery.id}`),
    ).rejects.toThrow(/deliveries_phone_format|check/i);
    await expect(
      prisma.$executeRawUnsafe(`UPDATE deliveries SET change_from = 1000 WHERE order_id = ${delivery.id} AND payment_method = 'CARD'`).then(async (n) => {
        if (n === 0) throw new Error('check: no card row to test');
        return n;
      }),
    ).rejects.toThrow(/deliveries_change_only_cash|check/i);

    const dineIn = await prisma.order.create({
      data: {
        type: 'DINE_IN',
        createdById: fx.users.staff.id,
        subtotal: 100,
        total: 100,
        tableId: table.id,
        reservationId: (await prisma.reservation.create({
          data: {
            code: 'R-TESTDL',
            checkinToken: 'tok-dl',
            tableId: table.id,
            guests: 2,
            guestName: 'Тест',
            startAt: new Date('2030-01-01T10:00:00Z'),
            endAt: new Date('2030-01-01T11:00:00Z'),
            status: 'COMPLETED',
          },
        })).id,
      },
    });
    await expect(
      prisma.delivery.create({
        data: { orderId: dineIn.id, zoneId: zones.center, recipientName: 'X', phone: '+380501112233', street: 'a', house: '1', fee: 0, paymentMethod: 'CASH' },
      }),
    ).rejects.toThrow(/DELIVERY|check/i);
  });

  it('у клієнта не може бути двох основних адрес (частковий UNIQUE)', async () => {
    await prisma.address.create({ data: { userId: fx.users.admin.id, zoneId: zones.center, label: 'A', street: 's', house: '1', isDefault: true } });
    await expect(
      prisma.address.create({ data: { userId: fx.users.admin.id, zoneId: zones.center, label: 'B', street: 's', house: '2', isDefault: true } }),
    ).rejects.toThrow();
  });
});

describe('TC-D08 Шина подій між системами (PostgreSQL LISTEN/NOTIFY)', () => {
  it('подія, опублікована іншою системою, доходить до підписника; власні події ігноруються', async () => {
    realTime();
    setSystemName('restaurant');
    const received: OrderBusEvent[] = [];
    const stop = await subscribeOrderEvents((e) => {
      received.push(e);
    });
    const fromDelivery = JSON.stringify({ source: 'delivery', event: 'order:created', orderId: 4242, status: 'CONFIRMED' });
    const own = JSON.stringify({ source: 'restaurant', event: 'order:updated', orderId: 4243, status: 'READY' });
    await prisma.$executeRaw`SELECT pg_notify(${ORDER_CHANNEL}, ${own})`;
    await prisma.$executeRaw`SELECT pg_notify(${ORDER_CHANNEL}, ${fromDelivery})`;
    const started = Date.now();
    while (!received.length && Date.now() - started < 3000) await new Promise((r) => setTimeout(r, 25));
    await stop();
    expect(received).toEqual([{ source: 'delivery', event: 'order:created', orderId: 4242, status: 'CONFIRMED' }]);
  });
});
