# 5. Логічна модель бази даних

СУБД — **PostgreSQL 16**, схема описана в `backend/prisma/schema.prisma`, створюється міграціями (`backend/prisma/migrations`). Гроші зберігаються цілими числами в копійках.

**Одна база даних для двох систем.** З нею працюють Restaurant API (порт 4000) і Delivery API (порт 4100). Міграції застосовує Restaurant API; обидва сервіси користуються тією самою Prisma-схемою. Замовлення доставки зберігаються в тій самій таблиці `orders` (`type = 'DELIVERY'`), тому кухня бачить їх разом із замовленнями в залі, а аналітика рахує обидва канали продажів.

## 5.1 ER-діаграма (логічна модель)

```mermaid
erDiagram
    users ||--o{ refresh_tokens : "має сесії"
    users ||--o{ reservations : "бронює (user_id)"
    users ||--o{ reservations : "створює (created_by_id)"
    users ||--o{ orders : "замовляє (user_id)"
    users ||--o{ orders : "оформлює (created_by_id)"
    users ||--o{ payments : "приймає готівку"
    users ||--o{ reviews : "пише"
    users ||--o{ status_changes : "виконує"
    categories ||--o{ dishes : "містить"
    tables ||--o{ reservations : "бронюється"
    tables ||--o{ orders : "обслуговує"
    reservations ||--o{ orders : "візит має"
    reservations ||--o{ status_changes : "історія"
    orders ||--|{ order_items : "складається з"
    dishes ||--o{ order_items : "входить у"
    orders ||--o{ payments : "оплачується"
    orders ||--o{ reviews : "оцінюється"
    dishes ||--o{ reviews : "оцінюється"
    orders ||--o{ status_changes : "історія"
    orders ||--o| deliveries : "доставка (type = DELIVERY)"
    delivery_zones ||--o{ deliveries : "тариф"
    delivery_zones ||--o{ addresses : "район"
    users ||--o{ addresses : "зберігає"
    users ||--o{ deliveries : "везе (courier_id)"

    users {
      int id PK
      varchar email UK "NOT NULL"
      text password_hash "bcrypt"
      varchar name
      varchar phone
      enum role "CLIENT|STAFF|KITCHEN|ADMIN|COURIER"
      bool is_active
      timestamptz created_at
    }
    refresh_tokens {
      int id PK
      int user_id FK
      char token_hash UK "SHA-256"
      timestamptz expires_at
      timestamptz revoked_at
    }
    categories {
      int id PK
      varchar name UK
      varchar slug UK
      varchar emoji
      int sort_order
    }
    dishes {
      int id PK
      int category_id FK
      varchar name
      int price "коп., CHECK > 0"
      int prep_time_min "CHECK 1..180"
      int weight_grams
      int calories
      bool is_available "стоп-лист"
      bool is_archived
      bool is_vegetarian
      bool is_spicy
      bool is_chef_choice
      text_array tags
      text_array allergens
    }
    tables {
      int id PK
      int number UK "CHECK > 0"
      int seats "CHECK 1..20"
      enum zone "HALL|TERRACE|VIP|BAR"
      enum shape
      float pos_x "0..100"
      float pos_y "0..100"
      varchar qr_token UK
      bool is_active
    }
    reservations {
      int id PK
      varchar code UK "R-XXXXXX"
      varchar checkin_token
      int user_id FK "NULL для гостей без акаунта"
      int created_by_id FK
      int table_id FK
      int guests "CHECK 1..20"
      timestamptz start_at
      timestamptz end_at "CHECK > start_at"
      enum status
      enum source "APP|WEB|STAFF|WALK_IN"
      varchar guest_name
      varchar guest_phone
      varchar notes
      timestamptz confirmed_at
      timestamptz checked_in_at
      timestamptz completed_at
    }
    orders {
      int id PK "починається з 1001"
      enum type "DINE_IN|DELIVERY"
      int reservation_id FK "лише DINE_IN"
      int table_id FK "лише DINE_IN"
      int user_id FK
      int created_by_id FK
      enum status
      int subtotal
      int total
      timestamptz estimated_ready_at "ETA"
      timestamptz confirmed_at
      timestamptz preparing_at
      timestamptz ready_at
      timestamptz served_at
      timestamptz paid_at
    }
    order_items {
      int id PK
      int order_id FK
      int dish_id FK
      int quantity "CHECK 1..50"
      int unit_price "знімок ціни"
      varchar notes
      enum status "QUEUED|COOKING|READY"
    }
    payments {
      int id PK
      int order_id FK
      int amount
      int tip
      enum method "CARD|CASH"
      enum status "PENDING|REQUIRES_ACTION|SUCCEEDED|FAILED|REFUNDED"
      varchar provider_ref UK
      varchar card_brand
      char card_last4
      varchar idempotency_key UK
      int processed_by_id FK
    }
    reviews {
      int id PK
      int user_id FK
      int order_id FK
      int dish_id FK "NULL = відгук про візит"
      smallint rating "CHECK 1..5"
      varchar comment
    }
    delivery_zones {
      int id PK
      varchar name UK
      int fee "коп., CHECK >= 0"
      int min_order "коп."
      int free_from "безкоштовно від"
      int travel_min "CHECK 5..180"
      bool is_active
    }
    addresses {
      int id PK
      int user_id FK
      int zone_id FK
      varchar label "Дім / Робота"
      varchar street
      varchar house
      varchar apartment
      bool is_default "одна на клієнта"
    }
    deliveries {
      int order_id PK "FK → orders"
      int zone_id FK
      int courier_id FK "users.role = COURIER"
      varchar recipient_name
      varchar phone "CHECK +380XXXXXXXXX"
      varchar street "знімок адреси"
      varchar house
      int fee "коп."
      enum payment_method "CARD|CASH"
      int change_from "решта з (лише CASH)"
      timestamptz eta_at "прогноз доставки"
      timestamptz assigned_at
      timestamptz picked_up_at
      timestamptz delivered_at
    }
    status_changes {
      int id PK
      int reservation_id FK
      int order_id FK
      varchar from_status
      varchar to_status
      int actor_id FK
      varchar note
      timestamptz created_at
    }
```

## 5.2 Призначення таблиць

| Таблиця | Призначення |
|---|---|
| `users` | Облікові записи всіх ролей. Роль визначає доступ (RBAC). |
| `refresh_tokens` | Сесії: хеші refresh-токенів для ротації та відкликання. |
| `categories`, `dishes` | Меню. `is_available` — стоп-лист, `is_archived` — м'яке видалення страв, що вже є в історії. |
| `tables` | Столики з координатами на плані залу та унікальним QR-токеном. |
| `reservations` | Бронювання / візити (у т.ч. walk-in) — центральна сутність бізнес-процесу. |
| `orders`, `order_items` | Замовлення: у залі (`DINE_IN`, у межах візиту) або доставка (`DELIVERY`); ціна фіксується на момент замовлення. |
| `delivery_zones` | Райони доставки: вартість, мінімальна сума, поріг безкоштовної доставки, час у дорозі, увімкнено / вимкнено. |
| `addresses` | Збережені адреси клієнта («Дім», «Робота»). |
| `deliveries` | Доставка замовлення (1 : 1 з `orders`): знімок адреси, отримувач, тариф, спосіб оплати, курʼєр і хронологія (призначено → забрав → вручив). |
| `payments` | Спроби оплат (карткою через sandbox або готівкою; для доставки готівку фіксує курʼєр, скасування оплаченої — `REFUNDED`). |
| `reviews` | Відгуки про візит (dish_id = NULL) та оцінки страв. |
| `status_changes` | Аудит бізнес-процесу: хто, коли і з якого в який стан перевів бронювання / замовлення. |

## 5.3 Обмеження цілісності

| Обмеження | Тип | Навіщо |
|---|---|---|
| `reservations_no_overlap` | **EXCLUDE USING gist** (`table_id =`, `tstzrange(start_at,end_at) &&`) `WHERE status IN (PENDING, CONFIRMED, CHECKED_IN)` | Гарантія на рівні БД: столик не може мати два активні бронювання з перетином часу — навіть при паралельних запитах чи записі в обхід API |
| `payments_one_success_per_order` | partial UNIQUE (`order_id`) `WHERE status = 'SUCCEEDED'` | Неможлива подвійна успішна оплата |
| `reviews_one_visit_review_per_order` | partial UNIQUE (`order_id`) `WHERE dish_id IS NULL` + UNIQUE (`order_id`, `dish_id`) | Один відгук про візит і одна оцінка кожної страви |
| `status_changes_single_target` | CHECK `num_nonnulls(reservation_id, order_id) = 1` | Запис історії належить рівно одному обʼєкту |
| `reservations_guest_identity` | CHECK `user_id IS NOT NULL OR guest_name IS NOT NULL` | Бронювання завжди має гостя |
| `reservations_time_order` | CHECK `end_at > start_at` | Коректний інтервал |
| `orders_type_consistency` | CHECK: `DINE_IN` має `reservation_id` і `table_id`, `DELIVERY` — не має | Замовлення в залі завжди привʼязане до візиту, доставка — ні |
| `deliveries_order_type` | **тригер** `BEFORE INSERT/UPDATE` | Рядок доставки можна створити лише для замовлення типу `DELIVERY` |
| `addresses_one_default_per_user` | partial UNIQUE (`user_id`) `WHERE is_default` | Не більше однієї основної адреси |
| `deliveries_phone_format`, `deliveries_change_only_cash`, `deliveries_timeline_order` | CHECK | Телефон `+380XXXXXXXXX`; «решта з» лише для готівки; час «забрав» ≥ «призначено», «вручив» ≥ «забрав» |
| `delivery_zones_*` | CHECK | Тариф ≥ 0, мінімальна сума ≥ 0, час у дорозі 5–180 хв |
| Діапазони | CHECK: ціна > 0, кількість 1..50, місць 1..20, рейтинг 1..5, час приготування 1..180, координати 0..100, `card_last4 ~ '^[0-9]{4}$'` | Валідність даних незалежно від клієнта |
| FK | `ON DELETE RESTRICT` для бізнес-даних (страва в замовленні, столик у бронюванні), `CASCADE` для залежних (позиції, історія), `SET NULL` для авторів | Referential integrity |

## 5.4 Індекси

| Індекс | Для чого |
|---|---|
| `reservations (table_id, start_at)` | пошук зайнятості столика — booking engine |
| `reservations (status, start_at)`, `(user_id, start_at)` | списки бронювань персоналу та клієнта, фонові задачі |
| `orders (status, created_at)`, `(user_id, created_at)`, `(reservation_id)`, `(type, status, created_at)` | kanban, KDS, історія клієнта, рахунок візиту, черга доставок |
| `deliveries (courier_id)`, `(zone_id)` | завантаження курʼєра, аналітика за районами |
| `addresses (user_id)` | адреси клієнта |
| `order_items (order_id)`, `(dish_id)` | склад замовлення, аналітика продажів і рекомендації |
| `payments (order_id)`, `(status, paid_at)` | оплати замовлення, виручка за період |
| `dishes (category_id)`, `(is_available, is_archived)` | меню |
| GiST (`reservations_no_overlap`) | перевірка перетину інтервалів |

## 5.5 Нормалізація

Схема відповідає **3НФ**: кожен неключовий атрибут залежить лише від ключа своєї таблиці. Свідома денормалізація:
* `order_items.unit_price` — **знімок** ціни на момент замовлення (історична правильність рахунку при зміні меню);
* `orders.table_id` — копія столика візиту для швидких запитів KDS / плану залу (оновлюється при пересадці гостей разом із бронюванням);
* `deliveries.street/house/…` — **знімок** адреси на момент замовлення: зміна чи видалення збереженої адреси не змінює історію доставок.
