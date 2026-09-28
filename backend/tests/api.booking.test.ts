import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { api, at, bearer, login, prisma, realTime, seedFixtures, setNow, today, type Fixtures } from './helpers';
import { runMaintenance } from '../src/jobs/scheduler';

let fx: Fixtures;
let client: string;
let client2: string;
let staff: string;

beforeAll(async () => {
  realTime();
  fx = await seedFixtures();
  client = await login(fx.users.client);
  client2 = await login(fx.users.client2);
  staff = await login(fx.users.staff);
});

beforeEach(async () => {
  realTime();
  await prisma.statusChange.deleteMany();
  await prisma.reservation.deleteMany();
  setNow(12, 0); // «зараз» — сьогодні 12:00 за Києвом
});

afterAll(() => realTime());

describe('Booking engine через API', () => {
  it('повертає сітку доступних слотів з рекомендованим столиком (TC-10)', async () => {
    const res = await api().get(`/api/booking/availability?date=${today(1)}&guests=2`);
    expect(res.status).toBe(200);
    expect(res.body.durationMin).toBe(90);
    expect(res.body.slots.length).toBeGreaterThan(10);
    const slot = res.body.slots.find((s: { time: string }) => s.time === '19:00');
    expect(slot).toMatchObject({ available: true, tablesLeft: 3 });
    expect(slot.bestTable.seats).toBe(2); // best-fit: найменший достатній столик
  });

  it('створює бронювання зі статусом PENDING та автоматично підбирає столик (TC-11)', async () => {
    const res = await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(19, 0, 1), guests: 4 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('PENDING');
    expect(res.body.table.seats).toBe(4);
    expect(res.body.code).toMatch(/^R-[A-Z0-9]{6}$/);
    expect(res.body.qrPayload).toContain(`smartrest://reservation/${res.body.code}`);
  });

  it('не дозволяє забронювати зайнятий столик — 409 з альтернативами (TC-12)', async () => {
    const t = fx.tables[0];
    const first = await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(19, 0, 1), guests: 2, tableId: t.id });
    expect(first.status).toBe(201);
    const clash = await api().post('/api/reservations').set(bearer(client2)).send({ startAt: at(19, 30, 1), guests: 2, tableId: t.id });
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe('TABLE_ALREADY_BOOKED');
    expect(clash.body.error.details.alternatives.length).toBeGreaterThan(0);
  });

  it('коли всі столики зайняті — NO_TABLES_AVAILABLE', async () => {
    for (const t of fx.tables) {
      await api().post('/api/reservations').set(bearer(staff)).send({ startAt: at(19, 0, 1), guests: 2, tableId: t.id, guestName: `Гість ${t.number}` });
    }
    const res = await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(19, 0, 1), guests: 2 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NO_TABLES_AVAILABLE');
  });

  it('БД-рівень: EXCLUDE-обмеження не дає вставити перетин навіть в обхід API', async () => {
    const t = fx.tables[1];
    const base = { tableId: t.id, guests: 2, status: 'CONFIRMED' as const, guestName: 'X', checkinToken: 'x' };
    await prisma.reservation.create({ data: { ...base, code: 'R-DB0001', startAt: new Date(at(18, 0, 2)), endAt: new Date(at(20, 0, 2)) } });
    await expect(
      prisma.reservation.create({ data: { ...base, code: 'R-DB0002', startAt: new Date(at(19, 0, 2)), endAt: new Date(at(21, 0, 2)) } }),
    ).rejects.toThrow(/reservations_no_overlap|23P01|exclusion/i);
  });

  it('перевіряє бізнес-правила часу: години роботи, сітка, минуле, мінімальний lead time (TC-13)', async () => {
    const outside = await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(22, 30, 1), guests: 2 });
    expect(outside.status).toBe(422);
    expect(outside.body.error.code).toBe('OUTSIDE_OPENING_HOURS');
    const misaligned = await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(19, 10, 1), guests: 2 });
    expect(misaligned.body.error.code).toBe('INVALID_SLOT');
    const past = await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(11, 0), guests: 2 });
    expect(past.body.error.code).toBe('TOO_LATE_TO_BOOK');
    const tooSoon = await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(12, 0), guests: 2 });
    expect(tooSoon.body.error.code).toBe('TOO_LATE_TO_BOOK');
    const tooMany = await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(19, 0, 1), guests: 15 });
    expect(tooMany.status).toBe(400);
  });

  it('обмежує кількість активних бронювань і не дає клієнту подвійне бронювання на той самий час', async () => {
    const r1 = await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(13, 0, 1), guests: 2 });
    expect(r1.status).toBe(201);
    const overlap = await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(13, 30, 1), guests: 2 });
    expect(overlap.body.error.code).toBe('OVERLAPPING_OWN_RESERVATION');
    await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(13, 0, 2), guests: 2 });
    await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(13, 0, 3), guests: 2 });
    const fourth = await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(13, 0, 4), guests: 2 });
    expect(fourth.status).toBe(409);
    expect(fourth.body.error.code).toBe('TOO_MANY_RESERVATIONS');
  });
});

describe('Життєвий цикл бронювання', () => {
  it('клієнт не може підтвердити власне бронювання; працівник — може (TC-14)', async () => {
    const r = await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(19, 0, 1), guests: 2 });
    const self = await api().patch(`/api/reservations/${r.body.id}/status`).set(bearer(client)).send({ status: 'CONFIRMED' });
    expect(self.status).toBe(403);
    expect(self.body.error.code).toBe('TRANSITION_FORBIDDEN');
    const ok = await api().patch(`/api/reservations/${r.body.id}/status`).set(bearer(staff)).send({ status: 'CONFIRMED' });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('CONFIRMED');
  });

  it('інший клієнт не бачить чуже бронювання', async () => {
    const r = await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(19, 0, 1), guests: 2 });
    const res = await api().get(`/api/reservations/${r.body.id}`).set(bearer(client2));
    expect(res.status).toBe(403);
  });

  it('недопустимий перехід PENDING → COMPLETED відхиляється (TC-15)', async () => {
    const r = await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(19, 0, 1), guests: 2 });
    const res = await api().patch(`/api/reservations/${r.body.id}/status`).set(bearer(staff)).send({ status: 'COMPLETED' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('дедлайн онлайн-скасування: пізніше ніж за 60 хв — лише через ресторан', async () => {
    const r = await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(13, 0), guests: 2 });
    expect(r.status).toBe(201);
    setNow(12, 30);
    const late = await api().patch(`/api/reservations/${r.body.id}/status`).set(bearer(client)).send({ status: 'CANCELLED' });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('CANCEL_DEADLINE_PASSED');
    const byStaff = await api()
      .patch(`/api/reservations/${r.body.id}/status`)
      .set(bearer(staff))
      .send({ status: 'CANCELLED', reason: 'Гість зателефонував' });
    expect(byStaff.body.status).toBe('CANCELLED');
    // скасоване бронювання звільняє столик
    const again = await api().post('/api/reservations').set(bearer(client2)).send({ startAt: at(13, 30), guests: 2, tableId: r.body.table.id });
    expect(again.status).toBe(201);
  });

  it('check-in працівником за QR бронювання; підроблений токен відхиляється (TC-16)', async () => {
    const r = await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(13, 0), guests: 2 });
    await api().patch(`/api/reservations/${r.body.id}/status`).set(bearer(staff)).send({ status: 'CONFIRMED' });
    const fake = await api().post('/api/reservations/check-in').set(bearer(staff)).send({ qr: `smartrest://reservation/${r.body.code}?t=forged` });
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe('INVALID_QR');
    const ok = await api().post('/api/reservations/check-in').set(bearer(staff)).send({ qr: r.body.qrPayload });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('CHECKED_IN');
  });

  it('клієнт не може зробити check-in без сканування QR столика', async () => {
    const r = await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(13, 0), guests: 2 });
    await api().patch(`/api/reservations/${r.body.id}/status`).set(bearer(staff)).send({ status: 'CONFIRMED' });
    const res = await api().patch(`/api/reservations/${r.body.id}/status`).set(bearer(client)).send({ status: 'CHECKED_IN' });
    expect(res.status).toBe(403);
  });

  it('check-in занадто рано відхиляється', async () => {
    const r = await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(19, 0), guests: 2 });
    await api().patch(`/api/reservations/${r.body.id}/status`).set(bearer(staff)).send({ status: 'CONFIRMED' });
    const res = await api().post('/api/reservations/check-in').set(bearer(staff)).send({ code: r.body.code });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CHECKIN_TOO_EARLY');
  });

  it('фонова задача: непідтверджені → CANCELLED, неприбулі → NO_SHOW (TC-17)', async () => {
    const pending = await api().post('/api/reservations').set(bearer(client)).send({ startAt: at(13, 0), guests: 2 });
    const confirmed = await api().post('/api/reservations').set(bearer(staff)).send({ startAt: at(13, 0), guests: 4, guestName: 'Гість' });
    setNow(13, 25);
    const result = await runMaintenance();
    expect(result).toMatchObject({ cancelled: 1, noShow: 1 });
    const [p, c] = await Promise.all([
      prisma.reservation.findUniqueOrThrow({ where: { id: pending.body.id } }),
      prisma.reservation.findUniqueOrThrow({ where: { id: confirmed.body.id } }),
    ]);
    expect(p.status).toBe('CANCELLED');
    expect(c.status).toBe('NO_SHOW');
  });

  it('walk-in через QR столика: вільний столик → гість сідає одразу (TC-18)', async () => {
    const scan = await api().post('/api/reservations/scan-table').set(bearer(client)).send({ qr: `smartrest://table/${fx.tables[1].qrToken}` });
    expect(scan.status).toBe(200);
    expect(scan.body.action).toBe('WALK_IN_AVAILABLE');
    const walk = await api().post('/api/reservations/walk-in').set(bearer(client)).send({ qr: `smartrest://table/${fx.tables[1].qrToken}`, guests: 3 });
    expect(walk.status).toBe(201);
    expect(walk.body).toMatchObject({ status: 'CHECKED_IN', source: 'WALK_IN' });
    // той самий столик для іншого гостя вже недоступний
    const other = await api().post('/api/reservations/walk-in').set(bearer(client2)).send({ qr: fx.tables[1].qrToken, guests: 2 });
    expect(other.status).toBe(409);
  });

  it('walk-in скорочується, якщо далі на столику бронювання', async () => {
    await api().post('/api/reservations').set(bearer(staff)).send({ startAt: at(13, 30), guests: 2, tableId: fx.tables[0].id, guestName: 'Наступний гість' });
    const scan = await api().post('/api/reservations/scan-table').set(bearer(client)).send({ qr: fx.tables[0].qrToken });
    expect(scan.body.action).toBe('WALK_IN_AVAILABLE');
    expect(scan.body.walkIn.maxDurationMin).toBe(75); // до 13:15 (13:30 − 15 хв буфера)
  });
});
