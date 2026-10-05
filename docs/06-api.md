# 6. Специфікація REST API

> Файл згенеровано автоматично командою `npm run docs:api` з реєстрів маршрутів обох сервісів.
> Система складається з **двох окремих API на одній базі даних PostgreSQL**:
>
> | Сервіс | Порт | Swagger UI | Для кого |
> |---|---|---|---|
> | **Restaurant API** | 4000 | http://localhost:4000/api/docs | Web (гість, зал, кухня, адмін), мобільний: меню, бронювання, QR, замовлення за столиком, вхід |
> | **Delivery API** | 4100 | http://localhost:4100/api/docs | мобільний: доставка, адреси, курʼєр, диспетчерська, зони |
>
> Вхід — один для обох систем: `POST :4000/api/auth/login` видає JWT, який приймає і Delivery API.

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

## Restaurant API — endpoints (59), порт 4000

### Auth

| Метод | URL | Доступ | Опис |
|---|---|---|---|
| `POST` | `/api/auth/register` | публічний | Реєстрація нового клієнта → **201** |
| `POST` | `/api/auth/login` | публічний | Вхід (email + пароль) → access + refresh токени |
| `POST` | `/api/auth/refresh` | публічний | Оновлення пари токенів (ротація refresh-токена) |
| `POST` | `/api/auth/fork` | публічний | Нова незалежна сесія для іншої вкладки (refresh-токен не споживається) |
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
| `POST` | `/api/orders/:id/review` | CLIENT | Залишити відгук про візит / доставку і оцінити страви (після оплати або доставки) → **201** |
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

## Delivery API — endpoints (26), порт 4100

Окремий сервіс служби доставки. Типові коди помилок: `DELIVERY_CLOSED`, `ZONE_INACTIVE`, `BELOW_MIN_ORDER`, `PHONE_INVALID`,
`TOO_MANY_ACTIVE_DELIVERIES`, `ALREADY_TAKEN`, `COURIER_BUSY`, `NOT_READY`, `TOO_LATE_TO_CANCEL`, `ORDER_NOT_AWAITING_PAYMENT`.

### Auth

| Метод | URL | Доступ | Опис |
|---|---|---|---|
| `GET` | `/api/me` | будь-який автентифікований | Поточний користувач (той самий JWT, що видає Restaurant API) |

### Delivery

| Метод | URL | Доступ | Опис |
|---|---|---|---|
| `GET` | `/api/delivery/info` | публічний | Чи працює доставка зараз, години, зони і прогноз часу |
| `POST` | `/api/delivery/quote` | публічний | Розрахунок: сума, вартість доставки, мінімальне замовлення і прогноз часу |

### Delivery zones

| Метод | URL | Доступ | Опис |
|---|---|---|---|
| `GET` | `/api/delivery/zones` | публічний (JWT опц.) | Зони доставки (адміністратор бачить і неактивні) |
| `POST` | `/api/delivery/zones` | ADMIN | Створити зону доставки → **201** |
| `PATCH` | `/api/delivery/zones/:id` | ADMIN | Змінити зону: вартість, мінімальна сума, час у дорозі, увімкнути/вимкнути |

### Addresses

| Метод | URL | Доступ | Опис |
|---|---|---|---|
| `GET` | `/api/addresses` | CLIENT | Мої збережені адреси |
| `POST` | `/api/addresses` | CLIENT | Зберегти адресу → **201** |
| `PATCH` | `/api/addresses/:id` | CLIENT | Змінити адресу або зробити її основною |
| `DELETE` | `/api/addresses/:id` | CLIENT | Видалити адресу |

### Delivery orders

| Метод | URL | Доступ | Опис |
|---|---|---|---|
| `POST` | `/api/delivery/orders` | CLIENT | Оформити доставку → **201** |
| `GET` | `/api/delivery/orders/my` | CLIENT | Мої доставки (історія та активні) |
| `GET` | `/api/delivery/orders` | STAFF, ADMIN | Диспетчерська: доставки за день (зал / адміністратор) |
| `GET` | `/api/delivery/orders/:id` | будь-який автентифікований | Деталі доставки з історією статусів |
| `POST` | `/api/delivery/orders/:id/cancel` | CLIENT, STAFF, ADMIN | Скасувати доставку (клієнт — до початку приготування; оплачене — з поверненням коштів) |
| `POST` | `/api/delivery/orders/:id/assign` | STAFF, ADMIN | Призначити або зняти курʼєра (диспетчер) |

### Delivery payments

| Метод | URL | Доступ | Опис |
|---|---|---|---|
| `GET` | `/api/delivery/test-cards` | публічний | Тестові картки sandbox-шлюзу |
| `POST` | `/api/delivery/orders/:id/pay` | CLIENT | Оплатити доставку карткою (sandbox, 3-D Secure, Idempotency-Key) |
| `POST` | `/api/delivery/payments/:id/confirm` | CLIENT | Підтвердження 3-D Secure (код sandbox: 123456) |

### Courier

| Метод | URL | Доступ | Опис |
|---|---|---|---|
| `GET` | `/api/courier/orders` | COURIER | Замовлення курʼєра: available — шукають курʼєра; mine — мої активні; history — доставлені за 7 днів |
| `GET` | `/api/courier/summary` | COURIER | Підсумок зміни курʼєра: доставлено, готівка на руках, чайові, середній час у дорозі |
| `POST` | `/api/courier/orders/:id/accept` | COURIER | Прийняти замовлення (поки готується або вже готове) |
| `POST` | `/api/courier/orders/:id/release` | COURIER | Відмовитися від замовлення (до того, як забрали) |
| `POST` | `/api/courier/orders/:id/pickup` | COURIER, ADMIN | Забрав з кухні → «В дорозі» (лише коли кухня позначила «Готово») |
| `POST` | `/api/courier/orders/:id/delivered` | COURIER, ADMIN | Вручено клієнту (готівка — фіксується оплата курʼєру) |
| `GET` | `/api/courier/couriers` | STAFF, ADMIN | Курʼєри та їх поточне навантаження (для диспетчера) |

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

**Delivery API** має власний Socket.IO-сервер (порт 4100, той самий JWT):

| Подія | Отримувачі | Коли |
|---|---|---|
| `delivery:updated` | клієнт, призначений курʼєр, диспетчерська (зал / адмін) | будь-яка зміна доставки: оплата, кухня, курʼєр, скасування |
| `courier:queue` | усі курʼєри | змінилась черга замовлень, що шукають курʼєра |

**Звʼязок між системами.** Коли Delivery API створює чи змінює доставку, він робить `pg_notify('sr_orders', …)` у спільній БД;
Restaurant API слухає канал (`LISTEN`) і надсилає `order:created` / `order:updated` кухні й залу у Web. І навпаки: коли кухня
в Web позначає «Готово», Delivery API отримує подію і сповіщає клієнта та курʼєрів. NOTIFY у транзакції доставляється лише після COMMIT.
