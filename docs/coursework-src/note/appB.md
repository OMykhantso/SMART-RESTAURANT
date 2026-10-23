### Додаток Б. Додаткові матеріали

**Б.1. Трасування ключових вимог.** Для основних бізнес-функцій забезпечено звʼязок «вимога → варіант використання → API → таблиці БД → екрани Web / Mobile → тестові сценарії» (табл. Б.1).

Таблиця Б.1 – Трасування вимог

| Вимога | UC | API | БД | Web / Mobile | Тести |
| --- | --- | --- | --- | --- | --- |
| FR-C03, FR-C04 Бронювання | UC-03 | GET /booking/availability, POST /reservations | reservations, tables | Booking / BookingScreen | TC-10–TC-13 |
| FR-S03 Підтвердження | UC-10 | PATCH /reservations/:id/status | reservations, status_changes | staff/Reservations | TC-14, TC-15 |
| FR-C06 Check-in за QR | UC-05 | POST /reservations/scan-table | reservations | – / ScanScreen | TC-18, TC-21 |
| FR-S04 Check-in хостес | UC-11 | POST /reservations/check-in | reservations | staff/Scan / StaffScanScreen | TC-16 |
| FR-C07 Замовлення | UC-06 | POST /orders | orders, order_items | CartDrawer / CartScreen | TC-20, TC-22, TC-23 |
| FR-K01–FR-K03 Кухня | UC-15 | PATCH /kitchen/orders/:id/items/:itemId | order_items | Kitchen / KitchenScreen | TC-25, TC-26 |
| FR-C09 Оплата | UC-08 | POST /payments/card, /payments/:id/confirm | payments | PaymentModal / PaymentScreen | TC-27–TC-32 |
| FR-D01–FR-D04 Доставка | UC-22 | POST :4100/delivery/quote, /delivery/orders | orders, deliveries | – / CheckoutScreen | TC-D01–TC-D04 |
| FR-D08 Геолокація | UC-22 | POST :4100/delivery/locate | delivery_zones | – / LocateMeButton | TC-D09 |
| FR-D05, FR-D06 Відстеження | UC-23 | GET :4100/delivery/orders/:id | deliveries, payments | – / DeliveryOrderScreen | TC-D03, TC-D04 |
| FR-K04 Доставка на KDS | UC-15 | GET /kitchen/orders + LISTEN/NOTIFY | orders.type | Kitchen / KitchenScreen | TC-D03, TC-D08 |
| FR-R01–FR-R04 Курʼєр | UC-24, UC-25 | /courier/orders/:id/accept, /pickup, /delivered | deliveries | – / CourierScreens | TC-D03, TC-D05 |
| FR-S07, FR-A04 Диспетчерська, зони | UC-26 | /delivery/orders, /assign, /delivery/zones | delivery_zones | – / DispatchScreen | TC-D01, TC-D05 |

**Б.2. Тестові облікові записи.** Демонстраційна база даних створюється командою `npm run db:setup` (міграції та демо-дані) або автоматично під час першого запуску в Docker:

- клієнт — client@smartrest.ua / Client123! (а також maria@smartrest.ua);
- працівник залу — staff@smartrest.ua / Staff123!;
- кухар — kitchen@smartrest.ua / Kitchen123!;
- адміністратор — admin@smartrest.ua / Admin123!;
- курʼєр — courier@smartrest.ua / Courier123! (а також courier2@smartrest.ua).

Тестові картки sandbox-шлюзу: 4242 4242 4242 4242 — успішна оплата; 4000 0000 0000 3220 — 3-D Secure, код 123456; 4000 0000 0000 0002 — відмова банку.

**Б.3. Запуск системи.**

- Docker: `docker compose up -d --build` — PostgreSQL, Restaurant API (порт 4000), Delivery API (порт 4100), сайт із HTTPS (https://localhost:8443).
- Розробка: `npm run install:all`, `npm run db:setup`, `npm run dev` — обидва API та Web; мобільний застосунок — `cd mobile && npx expo start` і Expo Go на телефоні в тій самій мережі.
- Документація API: Swagger UI — `/api/docs` на кожній системі; повний перелік 59 + 27 endpoint — `docs/06-api.md`.
- Перевірки: `npm run check` (lint, формат, типи, тести), `npm run test:weekdays`, `npm run e2e`.
- Перегляд записів бази даних: `npm --prefix backend run db:studio` (Prisma Studio).
