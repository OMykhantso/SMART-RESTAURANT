import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * Дві системи — одна база даних:
 * клієнт оформлює й оплачує доставку в Delivery API (як мобільний застосунок) →
 * кухня бачить тікет «Доставка» у Web (Restaurant API) у реальному часі → готує →
 * курʼєр забирає й вручає через Delivery API → статус бачать обидві системи.
 */
const DELIVERY = process.env.E2E_DELIVERY_URL ?? 'http://localhost:4100';

async function login(request: APIRequestContext, email: string, password: string) {
  const res = await request.post('/api/auth/login', { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).accessToken as string;
}

async function call<T = any>(request: APIRequestContext, method: 'GET' | 'PATCH' | 'POST', url: string, token: string, data?: unknown): Promise<T> {
  const res = await request.fetch(url, { method, data, headers: { Authorization: `Bearer ${token}` } });
  expect(res.ok(), `${method} ${url} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json();
}

test('доставка: Delivery API → kitchen display у Web → курʼєр', async ({ page, request }) => {
  const client = await login(request, 'maria@smartrest.ua', 'Client123!');
  const kitchen = await login(request, 'kitchen@smartrest.ua', 'Kitchen123!');
  const courier = await login(request, 'courier2@smartrest.ua', 'Courier123!');

  const info = await call(request, 'GET', `${DELIVERY}/api/delivery/info`, client);
  if (!info.window.isOpen) test.skip(true, 'Доставка зараз зачинена — запустіть у робочі години або з DELIVERY_IGNORE_HOURS=true');

  // кухар відкриває kitchen display у Web
  await page.goto('/login');
  await page.getByLabel('Email').fill('kitchen@smartrest.ua');
  await page.getByLabel('Пароль').fill('Kitchen123!');
  await page.getByRole('button', { name: 'Увійти' }).click();
  await expect(page).toHaveURL(/\/kitchen$/);

  // клієнт оформлює доставку карткою на збережену адресу і платить (3-D Secure)
  const dishes = await call<{ id: number; price: number; isAvailable: boolean; category?: { slug: string } }[]>(request, 'GET', '/api/dishes', client);
  const main = dishes.filter((d) => d.isAvailable && d.category?.slug !== 'cocktails').sort((a, b) => b.price - a.price)[0];
  const addresses = await call<{ id: number }[]>(request, 'GET', `${DELIVERY}/api/addresses`, client);
  // у клієнта може бути не більше 3 активних доставок — звільняємо місце від попередніх запусків
  for (const o of await call<{ id: number; status: string }[]>(request, 'GET', `${DELIVERY}/api/delivery/orders/my?active=true`, client)) {
    if (o.status === 'NEW' || o.status === 'CONFIRMED') await call(request, 'POST', `${DELIVERY}/api/delivery/orders/${o.id}/cancel`, client, {});
  }
  const order = await call(request, 'POST', `${DELIVERY}/api/delivery/orders`, client, {
    items: [{ dishId: main.id, quantity: 2 }],
    addressId: addresses[0].id,
    phone: '+380502345678',
    paymentMethod: 'CARD',
  });
  expect(order.status).toBe('NEW');
  const pay = await call(request, 'POST', `${DELIVERY}/api/delivery/orders/${order.id}/pay`, client, {
    card: { number: '4000000000003220', expMonth: 12, expYear: 2031, cvc: '123' },
  });
  expect(pay.requiresAction).toBe(true);
  const paid = await call(request, 'POST', `${DELIVERY}/api/delivery/payments/${pay.payment.id}/confirm`, client, { otp: '123456' });
  expect(paid.order.status).toBe('CONFIRMED');

  // тікет доставки зʼявляється на кухні без перезавантаження сторінки (подія йде через PostgreSQL LISTEN/NOTIFY)
  const ticket = page.locator('article', { hasText: `#${order.id}` });
  await expect(ticket).toBeVisible({ timeout: 15_000 });
  await expect(ticket.getByText('Доставка', { exact: true })).toBeVisible();

  // кухар відмічає всі страви → «Готово»
  const k = await call<{ id: number; items: { id: number }[] }[]>(request, 'GET', '/api/kitchen/orders', kitchen);
  for (const it of k.find((o) => o.id === order.id)!.items) {
    await call(request, 'PATCH', `/api/kitchen/orders/${order.id}/items/${it.id}`, kitchen, { status: 'READY' });
  }
  await expect(page.locator('section', { hasText: 'Готові до видачі' }).locator('article', { hasText: `#${order.id}` })).toBeVisible({ timeout: 15_000 });

  // курʼєр приймає, забирає і вручає — через Delivery API
  await call(request, 'POST', `${DELIVERY}/api/courier/orders/${order.id}/accept`, courier, {});
  await call(request, 'POST', `${DELIVERY}/api/courier/orders/${order.id}/pickup`, courier, {});
  const done = await call(request, 'POST', `${DELIVERY}/api/courier/orders/${order.id}/delivered`, courier, {});
  expect(done.status).toBe('DELIVERED');

  // обидві системи бачать той самий запис у спільній БД
  const viaRestaurant = await call(request, 'GET', `/api/orders/${order.id}`, client);
  expect(viaRestaurant).toMatchObject({ type: 'DELIVERY', status: 'DELIVERED', table: null });
  expect(viaRestaurant.history.map((h: { to: string }) => h.to)).toEqual(expect.arrayContaining(['CONFIRMED', 'READY', 'DELIVERING', 'DELIVERED']));
});
