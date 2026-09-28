<div align="center">

# 🍽️ SMART RESTAURANT

**Ресторан, у якому технології непомітні:** бронювання за 30 секунд → check-in за QR-кодом на столі → замовлення зі смартфона → кухня наживо → оплата в один дотик.

Курсова робота «Інтернет-проєкт» · Web + Mobile + Backend/API + PostgreSQL

`React 19` · `React Native / Expo SDK 57` · `Node.js 22 / Express 5` · `PostgreSQL 16 / Prisma` · `Socket.IO` · `Docker` · `GitHub Actions`

</div>

<p align="center">
  <img src="docs/screenshots/web-landing.jpg" width="100%" alt="Головна сторінка" />
</p>

<p align="center">
  <img src="docs/screenshots/mobile-home.jpg" width="19%" alt="Mobile: головна" />
  <img src="docs/screenshots/mobile-booking.jpg" width="19%" alt="Mobile: бронювання" />
  <img src="docs/screenshots/mobile-qr-checkin.jpg" width="19%" alt="Mobile: QR check-in" />
  <img src="docs/screenshots/mobile-order-status.jpg" width="19%" alt="Mobile: статус замовлення" />
  <img src="docs/screenshots/mobile-payment.jpg" width="19%" alt="Mobile: оплата" />
</p>

---

## Зміст
- [Що вміє система](#що-вміє-система)
- [Швидкий старт (Docker)](#швидкий-старт-docker)
- [Запуск для розробки](#запуск-для-розробки)
- [Мобільний застосунок](#мобільний-застосунок)
- [Тестові облікові записи](#тестові-облікові-записи)
- [Архітектура](#архітектура)
- [Бізнес-процес](#бізнес-процес)
- [Тестування](#тестування)
- [Документація курсової](#документація-курсової)
- [Структура репозиторію](#структура-репозиторію)

## Що вміє система

| Роль | Web | Mobile |
|---|---|---|
| **Клієнт** | меню з пошуком і фільтрами · бронювання з планом залу · кабінет з QR · замовлення за столиком · статус наживо · оплата · відгуки | бронювання з міні-планом залу · **check-in камерою за QR на столі** · walk-in · меню та кошик з рекомендаціями · статус і ETA наживо · **оплата + 3-D Secure** · відгуки · сповіщення та вібрація |
| **Офіціант / хостес** | дашборд зміни · **живий план залу** · бронювання (підтвердити / відхилити / телефонні) · **QR-сканер check-in** · Kanban замовлень · POS · оплата готівкою · стоп-лист | зміна з KPI і «потребує уваги» · живий план залу · **check-in камерою за QR бронювання гостя** · бронювання · замовлення (прийняти / подати / готівка) · сповіщення про нові та готові замовлення |
| **Кухар** | **Kitchen display**: черга, таймери, відмітка страв, автоматичне «Готово», звук, стоп-лист | kitchen display з таймерами та відміткою страв · стоп-лист · вібрація на нове замовлення |
| **Адміністратор** | меню (фото, архів) · **редактор плану залу drag-and-drop** · друк / перевипуск QR · користувачі та ролі · **аналітика** | усе, що має офіціант · аналітика з графіками · користувачі та ролі |

**ADVANCED:** booking engine (слоти, best-fit, анти-фрагментація, альтернативи, EXCLUDE-обмеження PostgreSQL) · QR (бронювання, столики, walk-in) · sandbox-платежі (Luhn, 3-D Secure, ідемпотентність, чайові).
**BONUS:** kitchen display · пояснювані рекомендації (асоціативні правила + персоналізація + байєсівський рейтинг) · real-time (Socket.IO) · прогноз ETA · аналітика · Swagger · Docker · CI · 77 автотестів + E2E (Playwright).

<table>
<tr>
<td><img src="docs/screenshots/web-booking-floor-plan.jpg" alt="Бронювання: план залу" /></td>
<td><img src="docs/screenshots/web-staff-dashboard.jpg" alt="Дашборд персоналу" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/web-kitchen-display.jpg" alt="Kitchen display" /></td>
<td><img src="docs/screenshots/web-orders-kanban.jpg" alt="Kanban замовлень" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/web-order-tracking.jpg" alt="Відстеження замовлення" /></td>
<td><img src="docs/screenshots/web-payment.jpg" alt="Оплата" /></td>
</tr>
</table>

## Швидкий старт (Docker)

Потрібні: [Docker Desktop](https://www.docker.com/products/docker-desktop/).

```bash
git clone <repo-url> smart-restaurant && cd smart-restaurant
docker compose up -d --build
```

| Що | Адреса |
|---|---|
| 🌐 Web (гість, персонал, кухня, адмін) | http://localhost:8080 |
| ⚙️ API | http://localhost:4000/api |
| 📘 Swagger UI | http://localhost:4000/api/docs |
| 🐘 PostgreSQL | `localhost:5433`, користувач / пароль `smart` / `smart` |

Під час першого запуску контейнер backend застосовує міграції та **заповнює БД демо-даними** (меню з 38 страв, 14 столиків, 45 днів історії для аналітики й рекомендацій, «живий» стан залу на сьогодні). Порти можна змінити: `WEB_PORT=8081 API_PORT=4001 docker compose up -d`.

## Запуск для розробки

Потрібні: **Node.js 22+**, **PostgreSQL 16** (або лише БД з Docker: `docker compose up -d db`).

```bash
# 1. Залежності (backend, web, mobile)
npm run install:all

# 2. Налаштування БД
cp backend/.env.example backend/.env      # за потреби змініть DATABASE_URL
#    (для БД з docker compose: postgresql://smart:smart@localhost:5433/smart_restaurant)
npm run db:setup                          # міграції + демо-дані

# 3. API + Web одночасно
npm run dev
```
Web: http://localhost:5173 (Vite проксіює `/api` і WebSocket на `:4000`), API: http://localhost:4000/api.

> Демо-дані можна перегенерувати будь-коли: `npm run db:seed` (очищує таблиці). «Живий» стан залу будується відносно поточного часу.

## Мобільний застосунок

```bash
cd mobile
npm install            # якщо ще не виконано npm run install:all
npx expo start
```
1. Встановіть **Expo Go** на телефон (App Store / Google Play).
2. Телефон і компʼютер — **в одній Wi-Fi мережі**. Відскануйте QR з терміналу.
3. Адреса API визначається автоматично (IP компʼютера з Metro, порт 4000). Якщо потрібно — змініть у застосунку: **Профіль → Підключення**, або задайте `EXPO_PUBLIC_API_URL=http://192.168.x.x:4000`.
4. Для check-in відскануйте QR столика: **Web → Адміністрування → Столики та QR → QR** (можна прямо з екрана монітора) або роздрукуйте настільні картки всіх столиків кнопкою **«Друк усіх QR»**.

> Android-емулятор: API за адресою `http://10.0.2.2:4000` визначається автоматично. Web-превʼю мобільного: `npx expo start --web`.

## Тестові облікові записи

| Роль | Email | Пароль | Де працює |
|---|---|---|---|
| Клієнт | `client@smartrest.ua` | `Client123!` | Mobile, Web |
| Клієнт | `maria@smartrest.ua` | `Client123!` | Mobile, Web |
| Офіціант / хостес | `staff@smartrest.ua` | `Staff123!` | Web → `/staff`, Mobile |
| Офіціант | `waiter@smartrest.ua` | `Staff123!` | Web → `/staff`, Mobile |
| Кухар | `kitchen@smartrest.ua` | `Kitchen123!` | Web → `/kitchen`, Mobile |
| Адміністратор | `admin@smartrest.ua` | `Admin123!` | Web → `/staff`, `/admin/*`, Mobile |

На сторінці входу Web і Mobile є кнопки **демо-доступу** для кожної ролі. Мобільний застосунок сам показує інтерфейс своєї ролі (гість / офіціант / кухар / адмін). У Web кожна вкладка браузера має власну сесію: в одній вкладці можна бути гостем, в іншій — офіціантом.

**Тестові картки (sandbox):**

| Картка | Результат |
|---|---|
| `4242 4242 4242 4242` | успішна оплата |
| `5555 5555 5555 4444` | успішна оплата (Mastercard) |
| `4000 0000 0000 3220` | 3-D Secure — код **`123456`** |
| `4000 0000 0000 0002` | відмова банку |
| `4000 0000 0000 9995` | недостатньо коштів |

Будь-який майбутній термін дії (напр. `12/29`), будь-який CVC (`123`).

## Архітектура

```mermaid
flowchart LR
    W[Web · React] -- REST --> API[Backend · Express<br/>валідація · JWT · RBAC<br/>booking engine · автомати станів<br/>платежі · рекомендації]
    M[Mobile · Expo] -- REST --> API
    W <-- WebSocket --> RT[Socket.IO]
    M <-- WebSocket --> RT
    API --> DB[(PostgreSQL)]
    API --> RT
    API --> PAY[[Sandbox payment]]
```

Web і Mobile працюють **лише через API** з єдиним backend і єдиною БД. Будь-яка дія в одному клієнті миттєво видна в іншому (Socket.IO). Детальніше — [docs/04-architecture.md](docs/04-architecture.md).

## Бізнес-процес

```mermaid
flowchart LR
    A[Бронювання<br/>PENDING] --> B[Підтвердження<br/>CONFIRMED] --> C[Check-in за QR<br/>CHECKED_IN]
    C --> D[Замовлення<br/>NEW → CONFIRMED] --> E[Кухня<br/>PREPARING] --> F[Готово<br/>READY] --> G[Подано<br/>SERVED] --> H[Оплата<br/>PAID] --> I[Візит завершено<br/>COMPLETED]
```

Правила переходів (хто, коли, за яких умов) — [docs/07-business-logic.md](docs/07-business-logic.md).

## Тестування

```bash
cd backend && npm test        # 77 тестів: модульні + інтеграційні з PostgreSQL + WebSocket
npm run typecheck             # TypeScript strict для backend, web, mobile

# E2E у браузері (Playwright): сценарій захисту через UI
npm install && npx playwright install chromium   # один раз
npm run dev                                       # в окремому терміналі
npm run e2e                                       # реєстрація → бронювання → check-in → замовлення → кухня → оплата 3-D Secure → відгук → завершення візиту
```
Тести API використовують окрему БД `smart_restaurant_test` (див. `backend/.env.test`). E2E працює з демо-БД і прибирає за собою (візит завершується); запускайте в робочі години ресторану (10:00–23:00 за Києвом), іншу адресу можна задати `E2E_BASE_URL=http://localhost:8080`. Сценарії та трасування вимог — [docs/09-testing.md](docs/09-testing.md). CI: `.github/workflows/ci.yml`.

## Документація курсової

| Розділ | Файл |
|---|---|
| Аналіз предметної області, аналоги | [docs/01-analysis.md](docs/01-analysis.md) |
| Ролі, функціональні / нефункціональні вимоги, матриця функціональності | [docs/02-requirements.md](docs/02-requirements.md) |
| Use Case діаграма та специфікації | [docs/03-use-cases.md](docs/03-use-cases.md) |
| Архітектура, Web ↔ Mobile інтеграція, безпека | [docs/04-architecture.md](docs/04-architecture.md) |
| Логічна модель БД, обмеження, індекси | [docs/05-database.md](docs/05-database.md) |
| Специфікація API (59 endpoints, згенеровано з коду) | [docs/06-api.md](docs/06-api.md) |
| Стани та бізнес-правила | [docs/07-business-logic.md](docs/07-business-logic.md) |
| ADVANCED / BONUS: алгоритми | [docs/08-advanced.md](docs/08-advanced.md) |
| Тестування | [docs/09-testing.md](docs/09-testing.md) |
| Сценарій захисту | [docs/10-demo-script.md](docs/10-demo-script.md) |

## Структура репозиторію

```
smart-restaurant/
├── backend/            Node.js · Express · Prisma · Socket.IO
│   ├── prisma/         schema.prisma, міграції (з CHECK/EXCLUDE), seed
│   ├── src/modules/    auth, menu, tables, booking, reservations, orders, payments, recommendations, analytics…
│   ├── src/lib/        router (валідація+RBAC+OpenAPI), stateMachine, realtime, openapi
│   └── tests/          vitest: модульні та інтеграційні тести
├── web/                React · Vite · Tailwind (гість + персонал + кухня + адмін)
├── mobile/             React Native · Expo (гостьовий застосунок)
├── docs/               документація курсової + скриншоти
├── docker-compose.yml  db + backend + web (nginx)
└── .github/workflows/  CI
```

## Примітки

* **Фото страв** завантажуються з Unsplash CDN. Без інтернету інтерфейс показує стилізовані заглушки (градієнт + емодзі категорії), тож вигляд залишається цілісним. Адміністратор може завантажити власні фото (Меню → редагування → «Завантажити фото»).
* **Час** — усі правила бронювання працюють у часовому поясі ресторану `Europe/Kyiv` (змінюється `RESTAURANT_TZ`).
* **Гроші** зберігаються в копійках (integer), як у платіжних системах.
