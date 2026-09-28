import { expect, test, type APIRequestContext } from '@playwright/test';

/**
 * Наскрізний сценарій захисту через UI:
 * новий клієнт → бронювання на плані залу → підтвердження працівником (real-time) →
 * check-in → замовлення з кошика → кухня → подача → оплата 3-D Secure → відгук.
 */

async function login(request: APIRequestContext, email: string, password: string) {
  const res = await request.post('/api/auth/login', { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()).accessToken as string;
}

async function call(request: APIRequestContext, method: 'PATCH' | 'POST', url: string, token: string, data: unknown) {
  const res = await request.fetch(url, { method, data, headers: { Authorization: `Bearer ${token}` } });
  expect(res.ok(), `${method} ${url} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json();
}

test('повний цикл: бронювання → замовлення → оплата', async ({ page, request }) => {
  const staff = await login(request, 'staff@smartrest.ua', 'Staff123!');
  const kitchen = await login(request, 'kitchen@smartrest.ua', 'Kitchen123!');

  // 1. Реєстрація нового клієнта через UI
  await page.goto('/register');
  await page.locator('input[autocomplete="name"]').fill('Е2Е Тестовий');
  await page.locator('input[type="email"]').fill(`e2e${Date.now()}@test.ua`);
  await page.locator('input[type="password"]').fill('E2eTest123');
  await page.getByRole('button', { name: 'Зареєструватися' }).click();
  await expect(page).toHaveURL(/\/account$/);

  // 2. Бронювання: перший вільний слот, рекомендований столик на плані залу
  await page.goto('/booking');
  const slot = page.locator('button:has(span.font-display):not([disabled])').filter({ hasText: /\d\d:\d\d/ }).first();
  const noSlots = page.getByText('вільних слотів не залишилось', { exact: false });
  await expect(slot.or(noSlots)).toBeVisible();
  if (await noSlots.isVisible()) test.skip(true, 'Ресторан на сьогодні вже не приймає бронювань — запустіть тест у робочі години');
  await slot.click();
  await expect(page.getByText(/^Столик №\d+$/)).toBeVisible();
  await page.getByRole('button', { name: 'Підтвердити бронювання' }).click();
  await expect(page.getByText('Заявку прийнято!')).toBeVisible();
  const code = (await page.locator('text=/^R-[A-Z0-9]{6}$/').first().textContent())!.trim();

  // 3. Працівник підтверджує → клієнт отримує real-time сповіщення
  const token = await page.evaluate(() => sessionStorage.getItem('sr.access'));
  const mine = await (await request.get('/api/reservations/my', { headers: { Authorization: `Bearer ${token}` } })).json();
  const reservation = mine.find((r: { code: string }) => r.code === code);
  await call(request, 'PATCH', `/api/reservations/${reservation.id}/status`, staff, { status: 'CONFIRMED' });
  await expect(page.getByText(`Бронювання ${code} підтверджено!`, { exact: false })).toBeVisible();

  // 4. Check-in (хостес сканує QR бронювання). Якщо ранній check-in зараз неможливий (до візиту > 60 хв
  //    або за рекомендованим столиком ще сидять попередні гості), гість сідає за вільний столик через
  //    QR столика (walk-in) — процес замовлення той самий.
  let tableNumber = reservation.table.number as number;
  let visitId = reservation.id as number;
  const checkIn = await request.post('/api/reservations/check-in', { data: { qr: reservation.qrPayload }, headers: { Authorization: `Bearer ${staff}` } });
  if (!checkIn.ok()) {
    expect(['CHECKIN_TOO_EARLY', 'TABLE_STILL_OCCUPIED', 'TABLE_NOT_READY']).toContain((await checkIn.json()).error.code);
    const admin = await login(request, 'admin@smartrest.ua', 'Admin123!');
    const live = await (await request.get('/api/tables/live', { headers: { Authorization: `Bearer ${staff}` } })).json();
    const free = live.find((t: { state: string; seats: number; next: { minutesToStart: number } | null }) => t.state === 'FREE' && t.seats >= 2 && (!t.next || t.next.minutesToStart > 90));
    const qr = await (await request.get(`/api/tables/${free.id}/qr?format=json`, { headers: { Authorization: `Bearer ${admin}` } })).json();
    const walkIn = await call(request, 'POST', '/api/reservations/walk-in', token!, { qr: qr.payload, guests: 2 });
    tableNumber = free.number;
    visitId = walkIn.id;
    // бронювання, яке не знадобилось, скасовує хостес — щоб не блокувати столик для наступних прогонів
    await call(request, 'PATCH', `/api/reservations/${reservation.id}/status`, staff, { status: 'CANCELLED', reason: 'E2E: гостя посаджено за інший столик' });
  }

  // 5. Замовлення за столиком через UI
  await page.goto('/order');
  await expect(page.getByText(`Столик №${tableNumber}`).first()).toBeVisible();
  const add = page.getByRole('button', { name: 'Додати в кошик' });
  await add.nth(0).click();
  await add.nth(1).click();
  await page.getByRole('button', { name: /^Кошик ·/ }).click();
  await page.getByRole('button', { name: /Надіслати на кухню/ }).click();
  await expect(page).toHaveURL(/\/account\/orders\/\d+$/);
  const orderId = Number(page.url().split('/').pop());

  // 6. Офіціант → кухня → подача; клієнт бачить статуси наживо
  await call(request, 'PATCH', `/api/orders/${orderId}/status`, staff, { status: 'CONFIRMED' });
  await call(request, 'PATCH', `/api/orders/${orderId}/status`, kitchen, { status: 'PREPARING' });
  await expect(page.getByRole('heading', { name: 'Готується' })).toBeVisible();
  await call(request, 'PATCH', `/api/orders/${orderId}/status`, kitchen, { status: 'READY' });
  await call(request, 'PATCH', `/api/orders/${orderId}/status`, staff, { status: 'SERVED' });
  await expect(page.getByRole('heading', { name: 'Подано' })).toBeVisible();

  // 7. Оплата карткою з 3-D Secure
  await page.getByRole('button', { name: /^Оплатити/ }).click();
  await page.locator('input[autocomplete="cc-number"]').fill('4000000000003220');
  await page.locator('input[autocomplete="cc-exp"]').fill('1229');
  await page.locator('input[autocomplete="cc-csc"]').fill('123');
  await page.getByRole('button', { name: /^Сплатити/ }).click();
  await page.locator('input[placeholder="••••••"]').fill('123456');
  await page.getByRole('button', { name: 'Підтвердити' }).click();
  await expect(page.getByText('Оплачено!')).toBeVisible();
  await page.getByRole('button', { name: 'Готово' }).click();

  // 8. Відгук
  await page.getByRole('button', { name: 'Залишити відгук' }).click();
  await page.getByRole('button', { name: 'Надіслати відгук' }).click();
  await expect(page.getByText('Дякуємо за відгук', { exact: false }).first()).toBeVisible();

  // 9. Завершення візиту — столик звільняється
  await page.goto(`/account/reservations/${visitId}`);
  await page.getByRole('button', { name: 'Завершити візит' }).click();
  await expect(page.getByText('Завершено').first()).toBeVisible();
});

test('RBAC у UI: клієнт не потрапляє в панель персоналу', async ({ page, request }) => {
  const res = await request.post('/api/auth/login', { data: { email: 'client@smartrest.ua', password: 'Client123!' } });
  const { accessToken, refreshToken } = await res.json();
  await page.goto('/');
  await page.evaluate(([a, r]) => {
    sessionStorage.setItem('sr.access', a);
    sessionStorage.setItem('sr.refresh', r);
  }, [accessToken, refreshToken]);
  await page.goto('/staff');
  await expect(page).toHaveURL(/\/account$/);
});

test('кожна вкладка має власну сесію: клієнт і офіціант поруч без F5', async ({ context }) => {
  const client = await context.newPage();
  await client.goto('/login');
  await client.getByRole('button', { name: /Клієнт/ }).first().click();
  await expect(client).toHaveURL(/\/account$/);

  // нова вкладка підхоплює останній вхід (окрема сесія через /auth/fork)
  const staff = await context.newPage();
  await staff.goto('/account');
  await expect(staff.getByRole('heading', { name: /Вітаємо/ })).toBeVisible();

  // у другій вкладці входимо офіціантом — перша вкладка лишається клієнтом без перезавантаження
  await staff.goto('/login');
  await staff.getByRole('button', { name: /Офіціант/ }).first().click();
  await expect(staff).toHaveURL(/\/staff$/);

  await client.getByRole('link', { name: 'Меню', exact: true }).first().click();
  await client.locator('header a[href="/account"]').first().click();
  await expect(client).toHaveURL(/\/account$/);
  await expect(client.getByRole('heading', { name: /Вітаємо/ })).toBeVisible();

  await staff.locator('aside a[href="/staff/reservations"]').first().click();
  await expect(staff).toHaveURL(/\/staff\/reservations$/);

  // F5 зберігає сесію саме цієї вкладки
  await client.reload();
  await expect(client).toHaveURL(/\/account$/);
  await staff.reload();
  await expect(staff).toHaveURL(/\/staff\/reservations$/);
});
