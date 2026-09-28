/**
 * Генерує docs/06-api.md з реєстру маршрутів (той самий, з якого будується Swagger),
 * тож документація API завжди відповідає реальному коду.
 *   npm run docs:api
 */
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from '../src/app';
import { routeRegistry } from '../src/lib/router';

createApp();

const groups = new Map<string, typeof routeRegistry>();
for (const r of routeRegistry) {
  const tag = r.tags[0];
  groups.set(tag, [...(groups.get(tag) ?? []), r]);
}

const access = (r: (typeof routeRegistry)[number]) =>
  r.roles ? r.roles.join(', ') : r.auth === true ? 'будь-який автентифікований' : r.auth === 'optional' ? 'публічний (JWT опц.)' : 'публічний';

let md = `# 6. Специфікація REST API

> Файл згенеровано автоматично командою \`npm run docs:api\` з реєстру маршрутів backend.
> Інтерактивна документація (OpenAPI 3.1 / Swagger UI): **http://localhost:4000/api/docs**, JSON: \`/api/openapi.json\`.

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

## Endpoints (${routeRegistry.length})

`;

for (const [tag, routes] of groups) {
  md += `### ${tag}\n\n| Метод | URL | Доступ | Опис |\n|---|---|---|---|\n`;
  for (const r of routes) {
    md += `| \`${r.method.toUpperCase()}\` | \`${r.fullPath}\` | ${access(r)} | ${r.summary}${r.status && r.status !== 200 ? ` → **${r.status}**` : ''} |\n`;
  }
  md += '\n';
}

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
`;

const out = path.resolve(__dirname, '../../docs/06-api.md');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, md);
console.log(`✅ ${routeRegistry.length} endpoints → ${path.relative(process.cwd(), out)}`);
process.exit(0);
