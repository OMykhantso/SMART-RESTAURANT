# 7. Бізнес-логіка: стани та правила

Обидва ключові процеси реалізовано як **скінченні автомати** (`backend/src/lib/stateMachine.ts`). Для кожного переходу задано, *хто* може його виконати: власник ресурсу (`OWNER`), роль (`STAFF`, `KITCHEN`, `ADMIN`) або лише сервер (`SYSTEM`). Недопустимий перехід → **409 INVALID_TRANSITION**, перехід не для цієї ролі → **403 TRANSITION_FORBIDDEN**. Кожна зміна записується в `status_changes` і розсилається в реальному часі.

## 7.1 Бронювання (візит)

```mermaid
stateDiagram-v2
    [*] --> PENDING: клієнт створює
    [*] --> CONFIRMED: працівник (телефон)
    [*] --> CHECKED_IN: walk-in (QR / хостес)
    PENDING --> CONFIRMED: STAFF, ADMIN
    PENDING --> REJECTED: STAFF, ADMIN (з причиною)
    PENDING --> CANCELLED: OWNER*, STAFF, ADMIN, SYSTEM (не підтверджено до початку)
    PENDING --> CHECKED_IN: STAFF, ADMIN (гість прийшов)
    CONFIRMED --> CHECKED_IN: OWNER (QR столика), STAFF, ADMIN (QR бронювання)
    CONFIRMED --> CANCELLED: OWNER*, STAFF, ADMIN
    CONFIRMED --> NO_SHOW: STAFF, ADMIN, SYSTEM (через 20 хв)
    CHECKED_IN --> COMPLETED: OWNER, STAFF, ADMIN, SYSTEM (усе оплачено)
    COMPLETED --> [*]
    CANCELLED --> [*]
    REJECTED --> [*]
    NO_SHOW --> [*]
```
`*` — клієнт може скасувати онлайн не пізніше ніж за 60 хв до початку.

| Правило | Де перевіряється | Код помилки |
|---|---|---|
| Час кратний 30 хв (клієнт) / 15 хв (персонал), у межах годин роботи, візит закінчується до закриття | `validateReservationWindow` | 422 `INVALID_SLOT`, `OUTSIDE_OPENING_HOURS` |
| Клієнт бронює щонайменше за 30 хв і не більше ніж на 60 днів уперед | те саме | 422 `TOO_LATE_TO_BOOK`, `DATE_TOO_FAR` |
| 1–12 гостей; тривалість залежить від кількості (90/120/150/180 хв) | `assertGuests`, `durationForParty` | 400 `INVALID_GUESTS` |
| Столик вільний з урахуванням 15-хв буфера на прибирання | booking engine + advisory lock + EXCLUDE | 409 `TABLE_ALREADY_BOOKED` / `NO_TABLES_AVAILABLE` (+ альтернативи) |
| Не більше 3 активних майбутніх бронювань на клієнта, без власних перетинів | `createReservation` | 409 `TOO_MANY_RESERVATIONS`, `OVERLAPPING_OWN_RESERVATION` |
| Check-in: не раніше ніж за 60 хв і до кінця візиту; клієнт — лише скануванням QR **свого** столика; столик має бути вільним | `transitionReservation` | 409 `CHECKIN_TOO_EARLY`, `WRONG_TABLE`, `TABLE_NOT_READY` / 403 |
| Ранній check-in зсуває початок візиту (чесна зайнятість столика) | те саме | — |
| Завершити візит можна лише без неоплачених замовлень | те саме | 409 `UNPAID_ORDERS` |
| Скасований / відхилений / no-show / завершений візит миттєво звільняє столик | EXCLUDE діє лише для активних статусів | — |
| Walk-in: столик вільний зараз; візит обмежується наступним бронюванням (мін. 45 хв) | `walkInWindow` | 409 `TABLE_UNAVAILABLE` |

**Фонові задачі** (щохвилини, `jobs/scheduler.ts`): `PENDING` після початку → `CANCELLED`; `CONFIRMED` через 20 хв після початку → `NO_SHOW`; `CHECKED_IN` через годину після кінця без боргів → `COMPLETED`.

## 7.2 Замовлення

```mermaid
stateDiagram-v2
    [*] --> NEW: клієнт (після check-in)
    [*] --> CONFIRMED: офіціант (POS)
    NEW --> CONFIRMED: STAFF, ADMIN
    NEW --> CANCELLED: OWNER, STAFF, ADMIN
    CONFIRMED --> PREPARING: KITCHEN, ADMIN (або перша страва в роботі)
    CONFIRMED --> CANCELLED: STAFF, KITCHEN, ADMIN (з причиною)
    PREPARING --> READY: KITCHEN, ADMIN (або всі страви відмічені)
    READY --> SERVED: STAFF, ADMIN
    SERVED --> PAID: SYSTEM (лише успішний платіж)
    PAID --> [*]
    CANCELLED --> [*]
```

| Правило | Код помилки |
|---|---|
| Замовлення лише в межах візиту `CHECKED_IN` (не «доставка» і не «просто меню») | 409 `NOT_CHECKED_IN` / `TABLE_NOT_OCCUPIED` |
| Страви зі стоп-листа / архіву не приймаються | 409 `DISH_UNAVAILABLE` |
| Ціни беруться лише з БД; однакові позиції обʼєднуються; до 50 порцій | 422 `QUANTITY_TOO_LARGE` |
| Клієнт скасовує лише `NEW`; персонал — до початку приготування і з причиною | 403 / 422 `REASON_REQUIRED` |
| Офіціант не може «готувати», кухар не може «подати» | 403 `TRANSITION_FORBIDDEN` |
| Статус `PAID` не можна встановити вручну | 403 |
| Оплата лише після подачі (`SERVED`); скасоване / оплачене не оплачується | 409 `ORDER_NOT_SERVED`, `ORDER_CANCELLED`, `ALREADY_PAID` |
| Відгук — лише власником, лише після оплати, лише один раз; оцінювати можна тільки страви з замовлення | 409 `ORDER_NOT_PAID`, `ALREADY_REVIEWED`, 422 `DISH_NOT_IN_ORDER` |

## 7.3 Паралельність і узгодженість

* **Бронювання** створюються/змінюються в транзакції з `pg_advisory_xact_lock` — перевірка вільності й вставка атомарні. Остання лінія захисту — EXCLUDE-обмеження (помилка `23P01` перетворюється на 409).
* **Замовлення** змінюються з `SELECT … FOR UPDATE` на рядку замовлення — дві дії кухні/офіціанта не перетирають одна одну.
* **Оплата**: авторизація в шлюзі поза транзакцією (не тримаємо блокування під час мережевої затримки), фіналізація — в транзакції з блокуванням та повторною перевіркою статусу; partial unique index гарантує одну успішну оплату.
