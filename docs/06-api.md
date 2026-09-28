# 6. Специфікація REST API

> Файл згенеровано автоматично командою `npm run docs:api` з реєстру маршрутів backend.
> Інтерактивна документація (OpenAPI 3.1 / Swagger UI): **http://localhost:4000/api/docs**, JSON: `/api/openapi.json`.

**Базовий URL:** `/api` · **Формат:** JSON · **Автентифікація:** `Authorization: Bearer <accessToken>` (JWT, 30 хв) + refresh-токен (30 днів, ротація).
**Гроші:** цілі числа в копійках. **Час:** ISO 8601 (UTC), часовий пояс ресторану — Europe/Kyiv.

## Формат помилки

```json
{ "error": { "code": "TABLE_ALREADY_BOOKED", "message": "Столик №3 вже зайнятий на цей час", "details": { "alternatives": [] } } }
```

| HTTP | Коли |
|---|---|
| 400 | Помилка валідації (`VALIDATION_ERROR`, деталі по полях) |
| 401 | Немає / недійсний токен (`UNAUTHORIZED`, `TOKEN_INVALID`) |
| 402 | Платіж відхилено банком (`PAYMENT_DECLINED`) |
| 403 | Недостатньо прав (`FORBIDDEN`, `TRANSITION_FORBIDDEN`) |
| 404 | Ресурс не знайдено |
| 409 | Конфлікт бізнес-правил (`INVALID_TRANSITION`, `TABLE_ALREADY_BOOKED`, `NOT_CHECKED_IN`, `ALREADY_PAID`…) |
| 422 | Дані коректні синтаксично, але порушують правило (`OUTSIDE_OPENING_HOURS`, `CARD_INVALID`…) |

## Endpoints (58)

### Auth

| Метод | URL | Доступ | Опис |
|---|---|---|---|
| `POST` | `/api/auth/register` | публічний | Реєстрація нового клієнта → **201** |
| `POST` | `/api/auth/login` | публічний | Вхід (email + пароль) → access + refresh токени |
| `POST` | `/api/auth/refresh` | публічний | Оновлення пари токенів (ротація refresh-токена) |
| `POST` | `/api/auth/logout` | публічний | Вихід — відкликання refresh-токена |
| `GET` | `/api/auth/me` | будь-який автентифікований | Поточний користувач |
| `PATCH` | `/api/auth/me` | будь-який автентифікований | Оновлення профілю (імʼя, телефон) |
| `POST` | `/api/auth/change-password` | будь-який автентифікований | Зміна пароля (відкликає всі сесії) |

### Users (Admin)

| Метод | URL | Доступ | Опис |
|---|---|---|---|
| `GET` | `/api/users` | ADMIN | Список користувачів (пошук, фільтр за роллю, пагінація) |
| `POST` | `/api/users` | ADMIN | Створення користувача будь-якої ролі (наприклад, працівника) → **201** |
| `PATCH` | `/api/users/:id` | ADMIN | Зміна ролі / деактивація / редагування користувача |

### Menu

| Метод | URL | Доступ | Опис |
|---|---|---|---|
| `GET` | `/api/categories` | публічний | Категорії меню |
| `POST` | `/api/categories` | ADMIN | Створити категорію → **201** |
| `PATCH` | `/api/categories/:id` | ADMIN | Редагувати категорію |
| `DELETE` | `/api/categories/:id` | ADMIN | Видалити категорію (лише порожню) |
| `GET` | `/api/dishes` | публічний (JWT опц.) | Меню: пошук, фільтрація та сортування страв |
| `GET` | `/api/dishes/:id` | публічний | Деталі страви з останніми відгуками |
| `POST` | `/api/dishes` | ADMIN | Додати страву → **201** |
| `PATCH` | `/api/dishes/:id` | ADMIN | Редагувати страву |
| `PATCH` | `/api/dishes/:id/availability` | STAFF, KITCHEN, ADMIN | Стоп-лист: увімкнути / вимкнути наявність страви |
| `DELETE` | `/api/dishes/:id` | ADMIN | Видалити страву (архівація, якщо вона вже є в замовленнях) |

### Tables

| Метод | URL | Доступ | Опис |
|---|---|---|---|
| `GET` | `/api/tables` | публічний (JWT опц.) | Список столиків (план залу) |
| `GET` | `/api/tables/live` | STAFF, KITCHEN, ADMIN | Живий стан залу: хто сидить, наступні бронювання, сигнали для офіціанта |
| `POST` | `/api/tables` | ADMIN | Додати столик → **201** |
| `PATCH` | `/api/tables/:id` | ADMIN | Редагувати столик (у т.ч. позицію на плані залу) |
| `DELETE` | `/api/tables/:id` | ADMIN | Видалити столик (деактивація, якщо є історія бронювань) |
| `GET` | `/api/tables/:id/qr` | STAFF, ADMIN | QR-код столика (SVG / PNG / JSON) для друку та check-in |
| `POST` | `/api/tables/:id/qr/rotate` | ADMIN | Перевипустити QR-код столика (старий стає недійсним) |

### Booking engine

| Метод | URL | Доступ | Опис |
|---|---|---|---|
| `GET` | `/api/booking/config` | публічний | Параметри бронювання: години роботи, крок слотів, обмеження |
| `GET` | `/api/booking/availability` | публічний (JWT опц.) | Доступні слоти на дату для N гостей (з рекомендованим столиком для кожного слоту) |
| `GET` | `/api/booking/tables` | публічний | План залу: стан кожного столика на обраний час (FREE / BUSY / TOO_SMALL) + рекомендація |

### Reservations

| Метод | URL | Доступ | Опис |
|---|---|---|---|
| `POST` | `/api/reservations` | CLIENT, STAFF, ADMIN | Створити бронювання (booking engine підбирає оптимальний столик) → **201** |
| `GET` | `/api/reservations/my` | будь-який автентифікований | Мої бронювання (клієнт) |
| `GET` | `/api/reservations/current` | будь-який автентифікований | Поточний активний візит клієнта (CHECKED_IN) або найближче бронювання |
| `GET` | `/api/reservations` | STAFF, ADMIN | Бронювання ресторану за день (працівник): фільтр за статусом, пошук |
| `GET` | `/api/reservations/:id` | будь-який автентифікований | Деталі бронювання з історією змін статусу |
| `PATCH` | `/api/reservations/:id/status` | будь-який автентифікований | Змінити статус бронювання (підтвердити / відхилити / скасувати / check-in / завершити / no-show) |
| `PATCH` | `/api/reservations/:id` | STAFF, ADMIN | Пересадити гостей / змінити кількість гостей / нотатки (працівник) |
| `POST` | `/api/reservations/check-in` | STAFF, ADMIN | Check-in гостя працівником за QR-кодом бронювання або кодом R-XXXXXX |
| `POST` | `/api/reservations/scan-table` | CLIENT | Клієнт сканує QR-код столика: check-in за бронюванням або пропозиція walk-in |
| `POST` | `/api/reservations/walk-in` | CLIENT, STAFF, ADMIN | Walk-in: посадити гостя без бронювання (клієнт через QR столика або працівник) → **201** |

### Orders

| Метод | URL | Доступ | Опис |
|---|---|---|---|
| `POST` | `/api/orders` | CLIENT, STAFF, ADMIN | Створити замовлення за столиком → **201** |
| `GET` | `/api/orders/my` | будь-який автентифікований | Мої замовлення (історія клієнта) |
| `GET` | `/api/orders` | STAFF, KITCHEN, ADMIN | Замовлення ресторану (працівник): фільтр за статусами, датою, столиком |
| `GET` | `/api/orders/:id` | будь-який автентифікований | Деталі замовлення з історією статусів |
| `PATCH` | `/api/orders/:id/status` | будь-який автентифікований | Змінити статус замовлення (підтвердити / готувати / готово / подано / скасувати) |

### Kitchen

| Метод | URL | Доступ | Опис |
|---|---|---|---|
| `GET` | `/api/kitchen/orders` | KITCHEN, STAFF, ADMIN | Kitchen display: черга замовлень для кухні |
| `PATCH` | `/api/kitchen/orders/:id/items/:itemId` | KITCHEN, ADMIN | Kitchen display: відмітити страву (у роботі / готово) |

### Reviews

| Метод | URL | Доступ | Опис |
|---|---|---|---|
| `POST` | `/api/orders/:id/review` | CLIENT | Залишити відгук про візит і оцінити страви (лише після оплати) → **201** |
| `GET` | `/api/reviews` | публічний | Останні відгуки гостей (публічно — загальні відгуки про візит) |

### Payments (sandbox)

| Метод | URL | Доступ | Опис |
|---|---|---|---|
| `GET` | `/api/payments/test-cards` | публічний | Тестові картки sandbox-шлюзу |
| `POST` | `/api/payments/card` | CLIENT, STAFF, ADMIN | Оплата замовлення карткою через sandbox-шлюз |
| `POST` | `/api/payments/:id/confirm` | CLIENT, STAFF, ADMIN | Підтвердження 3-D Secure (одноразовий код) |
| `POST` | `/api/payments/cash` | STAFF, ADMIN | Зафіксувати оплату готівкою / терміналом (офіціант) |
| `GET` | `/api/payments` | STAFF, ADMIN | Журнал платежів за день |

### Recommendations

| Метод | URL | Доступ | Опис |
|---|---|---|---|
| `GET` | `/api/recommendations` | публічний (JWT опц.) | Персональні рекомендації страв (з урахуванням кошика, історії, популярності, рейтингу, часу доби) |

### Analytics

| Метод | URL | Доступ | Опис |
|---|---|---|---|
| `GET` | `/api/analytics/overview` | STAFF, ADMIN | Аналітика за період: виручка, середній чек, топ страв, завантаженість, воронка бронювань |
| `GET` | `/api/analytics/today` | STAFF, KITCHEN, ADMIN | Оперативна зведена інформація на сьогодні (для дашборду працівника) |

### Uploads

| Метод | URL | Доступ | Опис |
|---|---|---|---|
| `POST` | `/api/uploads` | ADMIN | Завантажити зображення страви (multipart/form-data, поле file, до 5 МБ) → **201** |

## Real-time події (Socket.IO)

Підключення: `io(<host>, { auth: { token: accessToken } })`. Кімнати призначаються сервером за роллю.

| Подія | Отримувачі | Коли |
|---|---|---|
| `reservation:created` | персонал, власник | нове бронювання / walk-in |
| `reservation:updated` | персонал, власник | зміна статусу (підтвердження, check-in, скасування…) |
| `order:created` | персонал, кухня, власник | нове замовлення |
| `order:updated` | персонал, кухня, власник | зміна статусу замовлення / страви |
| `payment:succeeded` | персонал, власник | успішна оплата |
| `tables:changed` | персонал | змінився стан залу |
| `menu:changed` | усі | зміна меню / стоп-листа |
