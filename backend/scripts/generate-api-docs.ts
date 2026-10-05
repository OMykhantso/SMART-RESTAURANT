/**
 * Генерує docs/06-api.md з реєстру маршрутів (той самий, з якого будується Swagger),
 * тож документація API завжди відповідає реальному коду.
 *   npm run docs:api
 */
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/app';
import { createDeliveryApp } from '../src/delivery/app';
import { deliveryRegistry, routeRegistry } from '../src/lib/router';

createApp();
createDeliveryApp();

function grouped(registry: typeof routeRegistry) {
  const groups = new Map<string, typeof routeRegistry>();
  for (const r of registry) {
    const tag = r.tags[0];
    groups.set(tag, [...(groups.get(tag) ?? []), r]);
  }
  return groups;
}

const access = (r: (typeof routeRegistry)[number]) =>
  r.roles ? r.roles.join(', ') : r.auth === true ? 'будь-який автентифікований' : r.auth === 'optional' ? 'публічний (JWT опц.)' : 'публічний';

let md = `# 6. Специфікація REST API

> Файл згенеровано автоматично командою \`npm run docs:api\` з реєстрів маршрутів обох сервісів.
> Система складається з **двох окремих API на одній базі даних PostgreSQL**:
>
> | Сервіс | Порт | Swagger UI | Для кого |
> |---|---|---|---|
> | **Restaurant API** | 4000 | http://localhost:4000/api/docs | Web (гість, зал, кухня, адмін), мобільний: меню, бронювання, QR, замовлення за столиком, вхід |
> | **Delivery API** | 4100 | http://localhost:4100/api/docs | мобільний: доставка, адреси, курʼєр, диспетчерська, зони |
>
> Вхід — один для обох систем: \`POST :4000/api/auth/login\` видає JWT, який приймає і Delivery API.

**Базовий URL:** \`/api\` · **Формат:** JSON · **Автентифікація:** \`Authorization: Bearer <accessToken>\` (JWT, 30 хв) + refresh-токен (30 днів, ротація).
**Гроші:** цілі числа в копійках. **Час:** ISO 8601 (UTC), часовий пояс ресторану — Europe/Kyiv.

## Формат помилки

\`\`\`json
{ "error": { "code": "TABLE_ALREADY_BOOKED", "message": "Столик №3 вже зайнятий на цей час", "details": { "alternatives": [] } } }
\`\`\`

| HTTP | Коли |
|---|---|
| 400 | Помилка валідації (\`VALIDATION_ERROR\`, деталі по полях) |
| 401 | Немає / недійсний токен (\`UNAUTHORIZED\`, \`TOKEN_INVALID\`) |
| 402 | Платіж відхилено банком (\`PAYMENT_DECLINED\`) |
| 403 | Недостатньо прав (\`FORBIDDEN\`, \`TRANSITION_FORBIDDEN\`) |
| 404 | Ресурс не знайдено |
| 409 | Конфлікт бізнес-правил (\`INVALID_TRANSITION\`, \`TABLE_ALREADY_BOOKED\`, \`NOT_CHECKED_IN\`, \`ALREADY_PAID\`…) |
| 422 | Дані коректні синтаксично, але порушують правило (\`OUTSIDE_OPENING_HOURS\`, \`CARD_INVALID\`…) |

## Restaurant API — endpoints (${routeRegistry.length}), порт 4000

`;

const table = (registry: typeof routeRegistry, level: string) => {
  for (const [tag, routes] of grouped(registry)) {
    md += `${level} ${tag}\n\n| Метод | URL | Доступ | Опис |\n|---|---|---|---|\n`;
    for (const r of routes) {
      md += `| \`${r.method.toUpperCase()}\` | \`${r.fullPath}\` | ${access(r)} | ${r.summary}${r.status && r.status !== 200 ? ` → **${r.status}**` : ''} |\n`;
    }
    md += '\n';
  }
};
table(routeRegistry, '###');

md += `## Delivery API — endpoints (${deliveryRegistry.length}), порт 4100

Окремий сервіс служби доставки. Типові коди помилок: \`DELIVERY_CLOSED\`, \`ZONE_INACTIVE\`, \`BELOW_MIN_ORDER\`, \`PHONE_INVALID\`,
\`TOO_MANY_ACTIVE_DELIVERIES\`, \`ALREADY_TAKEN\`, \`COURIER_BUSY\`, \`NOT_READY\`, \`TOO_LATE_TO_CANCEL\`, \`ORDER_NOT_AWAITING_PAYMENT\`.

`;
table(deliveryRegistry, '###');

md += `## Real-time події (Socket.IO)

Підключення: \`io(<host>, { auth: { token: accessToken } })\`. Кімнати призначаються сервером за роллю.

| Подія | Отримувачі | Коли |
|---|---|---|
| \`reservation:created\` | персонал, власник | нове бронювання / walk-in |
| \`reservation:updated\` | персонал, власник | зміна статусу (підтвердження, check-in, скасування…) |
| \`order:created\` | персонал, кухня, власник | нове замовлення |
| \`order:updated\` | персонал, кухня, власник | зміна статусу замовлення / страви |
| \`payment:succeeded\` | персонал, власник | успішна оплата |
| \`tables:changed\` | персонал | змінився стан залу |
| \`menu:changed\` | усі | зміна меню / стоп-листа |

**Delivery API** має власний Socket.IO-сервер (порт 4100, той самий JWT):

| Подія | Отримувачі | Коли |
|---|---|---|
| \`delivery:updated\` | клієнт, призначений курʼєр, диспетчерська (зал / адмін) | будь-яка зміна доставки: оплата, кухня, курʼєр, скасування |
| \`courier:queue\` | усі курʼєри | змінилась черга замовлень, що шукають курʼєра |

**Звʼязок між системами.** Коли Delivery API створює чи змінює доставку, він робить \`pg_notify('sr_orders', …)\` у спільній БД;
Restaurant API слухає канал (\`LISTEN\`) і надсилає \`order:created\` / \`order:updated\` кухні й залу у Web. І навпаки: коли кухня
в Web позначає «Готово», Delivery API отримує подію і сповіщає клієнта та курʼєрів. NOTIFY у транзакції доставляється лише після COMMIT.
`;

const out = path.resolve(__dirname, '../../docs/06-api.md');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, md);
console.log(`✅ ${routeRegistry.length} + ${deliveryRegistry.length} endpoints → ${path.relative(process.cwd(), out)}`);
process.exit(0);
