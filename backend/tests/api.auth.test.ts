import { beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, login, prisma, seedFixtures, type Fixtures } from './helpers';

let fx: Fixtures;
beforeAll(async () => {
  fx = await seedFixtures();
});

describe('Автентифікація', () => {
  it('реєструє клієнта та повертає пару токенів (TC-01)', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ name: 'Тарас Шевченко', email: 'Taras@Example.com', password: 'Kobzar1814', phone: '+380501112233' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'taras@example.com', role: 'CLIENT' });
    expect(res.body.accessToken).toBeTypeOf('string');
    expect(res.body.refreshToken).toBeTypeOf('string');
    const stored = await prisma.user.findUniqueOrThrow({ where: { email: 'taras@example.com' } });
    expect(stored.passwordHash).not.toContain('Kobzar1814');
    expect(stored.passwordHash.startsWith('$2')).toBe(true); // bcrypt
  });

  it('не дозволяє повторну реєстрацію email (TC-02)', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'Двійник', email: 'taras@example.com', password: 'Passw0rd!' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('серверна валідація: слабкий пароль і некоректний email (TC-03)', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'А', email: 'not-an-email', password: '123' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    const fields = res.body.error.details.map((d: { field: string }) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });

  it('відхиляє неправильний пароль (TC-04)', async () => {
    const res = await api().post('/api/auth/login').send({ email: fx.users.client.email, password: 'wrong-pass1' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('ротація refresh-токенів і захист від повторного використання (TC-05)', async () => {
    const first = await api().post('/api/auth/login').send({ email: fx.users.client.email, password: fx.users.client.password });
    const r1 = first.body.refreshToken;
    const second = await api().post('/api/auth/refresh').send({ refreshToken: r1 });
    expect(second.status).toBe(200);
    const r2 = second.body.refreshToken;
    expect(r2).not.toBe(r1);
    // повторне використання старого токена → відкликаються всі сесії
    const reuse = await api().post('/api/auth/refresh').send({ refreshToken: r1 });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('REFRESH_REUSED');
    const afterReuse = await api().post('/api/auth/refresh').send({ refreshToken: r2 });
    expect(afterReuse.status).toBe(401);
  });

  it('окрема сесія для нової вкладки: fork не споживає вихідний refresh-токен (TC-05a)', async () => {
    const first = await api().post('/api/auth/login').send({ email: fx.users.client.email, password: fx.users.client.password });
    const r1 = first.body.refreshToken;
    const forked = await api().post('/api/auth/fork').send({ refreshToken: r1 });
    expect(forked.status).toBe(200);
    expect(forked.body.user.email).toBe(fx.users.client.email);
    // обидві вкладки ротують свої токени незалежно — без REFRESH_REUSED
    expect((await api().post('/api/auth/refresh').send({ refreshToken: r1 })).status).toBe(200);
    expect((await api().post('/api/auth/refresh').send({ refreshToken: forked.body.refreshToken })).status).toBe(200);
    // відкликаний (вже використаний) токен не можна «розмножити»
    const stale = await api().post('/api/auth/fork').send({ refreshToken: r1 });
    expect(stale.status).toBe(401);
    expect(stale.body.error.code).toBe('REFRESH_INVALID');
  });

  it('деактивований користувач втрачає доступ навіть з валідним токеном (TC-06)', async () => {
    const token = await login(fx.users.client2);
    expect((await api().get('/api/auth/me').set(bearer(token))).status).toBe(200);
    await prisma.user.update({ where: { id: fx.users.client2.id }, data: { isActive: false } });
    const res = await api().get('/api/auth/me').set(bearer(token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
    await prisma.user.update({ where: { id: fx.users.client2.id }, data: { isActive: true } });
  });
});

describe('Авторизація (RBAC перевіряється на сервері)', () => {
  it('без токена — 401', async () => {
    expect((await api().get('/api/reservations/my')).status).toBe(401);
    expect((await api().get('/api/users')).status).toBe(401);
  });

  it('клієнт не має доступу до адмін- та staff-функцій (TC-07)', async () => {
    const token = await login(fx.users.client);
    expect((await api().get('/api/users').set(bearer(token))).status).toBe(403);
    expect((await api().get('/api/reservations').set(bearer(token))).status).toBe(403);
    expect((await api().get('/api/kitchen/orders').set(bearer(token))).status).toBe(403);
    const dish = await api()
      .post('/api/dishes')
      .set(bearer(token))
      .send({ categoryId: 1, name: 'Хакерська страва', description: 'x', price: 1 });
    expect(dish.status).toBe(403);
  });

  it('працівник залу не може редагувати меню, але може ставити страву у стоп-лист', async () => {
    const token = await login(fx.users.staff);
    const edit = await api().patch(`/api/dishes/${fx.dishes.steak.id}`).set(bearer(token)).send({ price: 1 });
    expect(edit.status).toBe(403);
    const stop = await api().patch(`/api/dishes/${fx.dishes.steak.id}/availability`).set(bearer(token)).send({ isAvailable: false });
    expect(stop.status).toBe(200);
    expect(stop.body.isAvailable).toBe(false);
    await api().patch(`/api/dishes/${fx.dishes.steak.id}/availability`).set(bearer(token)).send({ isAvailable: true });
  });

  it('адміністратор керує користувачами, але не може заблокувати себе', async () => {
    const token = await login(fx.users.admin);
    const list = await api().get('/api/users?role=CLIENT').set(bearer(token));
    expect(list.status).toBe(200);
    expect(list.body.items.every((u: { role: string }) => u.role === 'CLIENT')).toBe(true);
    const self = await api().patch(`/api/users/${fx.users.admin.id}`).set(bearer(token)).send({ isActive: false });
    expect(self.status).toBe(400);
    expect(self.body.error.code).toBe('SELF_LOCKOUT');
  });

  it('публічне меню доступне без автентифікації з фільтрами та сортуванням', async () => {
    const res = await api().get('/api/dishes?sort=price_asc');
    expect(res.status).toBe(200);
    const prices = res.body.map((d: { price: number }) => d.price);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    const search = await api().get('/api/dishes?search=борщ');
    expect(search.body.map((d: { name: string }) => d.name)).toEqual(['Борщ']);
  });

  it('OpenAPI-специфікація генерується з реєстру маршрутів', async () => {
    const res = await api().get('/api/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(Object.keys(res.body.paths)).toEqual(expect.arrayContaining(['/api/reservations', '/api/orders/{id}/status', '/api/payments/card']));
  });
});
