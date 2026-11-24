### Додаток А. Фрагменти програмного коду

Наведено найважливіші фрагменти власної реалізації, які характеризують архітектуру, бізнес-логіку та компоненти підвищеної складності. Повний код — у Git-репозиторії проєкту.

Лістинг А.1 – Автомати станів замовлення в залі та доставки

```ts
// backend/src/lib/stateMachine.ts (рядки 37–92)
export const ORDER_FLOW: Machine<OrderStatus> = {
  NEW: {
    CONFIRMED: ['STAFF', 'ADMIN'],
    CANCELLED: ['OWNER', 'STAFF', 'ADMIN'],
  },
  CONFIRMED: {
    PREPARING: ['KITCHEN', 'ADMIN'],
    CANCELLED: ['STAFF', 'KITCHEN', 'ADMIN'],
  },
  PREPARING: {
    READY: ['KITCHEN', 'ADMIN', 'SYSTEM'],
  },
  READY: {
    SERVED: ['STAFF', 'ADMIN'],
  },
  SERVED: {
    PAID: ['SYSTEM'],
  },
  PAID: {},
  DELIVERING: {},
  DELIVERED: {},
  CANCELLED: {},
};

/**
 * Автомат замовлення ДОСТАВКИ (Delivery API).
 * Картка: NEW (очікує онлайн-оплати) → CONFIRMED лише після успішної оплати (SYSTEM).
 * Готівка: замовлення створюється одразу CONFIRMED.
 * Кухня працює так само, як із замовленнями в залі; далі — курʼєр.
 */
export const DELIVERY_FLOW: Machine<OrderStatus> = {
  NEW: {
    CONFIRMED: ['SYSTEM'],
    CANCELLED: ['OWNER', 'STAFF', 'ADMIN', 'SYSTEM'],
  },
  CONFIRMED: {
    PREPARING: ['KITCHEN', 'ADMIN'],
    CANCELLED: ['OWNER', 'STAFF', 'KITCHEN', 'ADMIN'],
  },
  PREPARING: {
    READY: ['KITCHEN', 'ADMIN', 'SYSTEM'],
    CANCELLED: ['ADMIN'],
  },
  READY: {
    DELIVERING: ['COURIER', 'ADMIN'],
    CANCELLED: ['ADMIN'],
  },
  DELIVERING: {
    DELIVERED: ['COURIER', 'ADMIN'],
    CANCELLED: ['ADMIN'],
  },
  SERVED: {},
  PAID: {},
  DELIVERED: {},
  CANCELLED: {},
};
```

Лістинг А.2 – Перевірка допустимості переходу та прав актора

```ts
// backend/src/lib/stateMachine.ts (рядки 134–158)
/**
 * Перевіряє допустимість переходу. Кидає:
 *  409 INVALID_TRANSITION — переходу не існує в автоматі;
 *  403 TRANSITION_FORBIDDEN — перехід існує, але цей актор не має права його виконати.
 */
export function assertTransition<S extends string>(machine: Machine<S>, labels: Record<S, string>, from: S, to: S, actors: Actor[]) {
  const allowed = allowedActors(machine, from, to);
  if (!allowed) {
    throw new AppError(409, 'INVALID_TRANSITION', `Неможливо змінити статус «${labels[from]}» на «${labels[to]}»`, { from, to });
  }
  if (!actors.some((a) => allowed.includes(a))) {
    throw new AppError(403, 'TRANSITION_FORBIDDEN', `Ваша роль не може виконати перехід «${labels[from]}» → «${labels[to]}»`, {
      from,
      to,
    });
  }
}

/** Набір «акторів», від імені яких діє користувач щодо ресурсу. */
export function actorsFor(user: { id: number; role: Role } | 'SYSTEM', ownerId: number | null | undefined): Actor[] {
  if (user === 'SYSTEM') return ['SYSTEM'];
  const actors: Actor[] = [user.role];
  if (ownerId != null && ownerId === user.id) actors.push('OWNER');
  return actors;
}
```

Лістинг А.3 – Декларативний маршрут: автентифікація, RBAC, валідація zod і реєстр для OpenAPI

```ts
// backend/src/lib/router.ts (рядки 49–89)
/**
 * Створює Express Router, у якому кожен маршрут описаний декларативно:
 * валідація (zod) + автентифікація + авторизація за ролями + документація.
 */
export function createRouter(basePath: string, registry: RegisteredRoute[] = routeRegistry) {
  const router = Router();

  function define<B = unknown, Q = unknown, P = unknown>(def: RouteDef<B, Q, P>) {
    registry.push({ ...(def as RouteDef), fullPath: `/api${basePath}${def.path === '/' ? '' : def.path}` });

    const chain: RequestHandler[] = [];
    if (def.auth === true || def.roles) chain.push(authenticate);
    else if (def.auth === 'optional') chain.push(optionalAuth);

    if (def.roles) {
      const allowed = def.roles;
      chain.push((req, _res, next) => {
        if (!req.user || !allowed.includes(req.user.role)) return next(forbidden());
        next();
      });
    }
    if (def.middleware) chain.push(...def.middleware);

    chain.push(async (req, res) => {
      const params = def.params ? def.params.parse(req.params) : (req.params as P);
      const query = def.query ? def.query.parse(req.query) : (req.query as Q);
      const body = def.body ? def.body.parse(req.body ?? {}) : (req.body as B);
      const result = await def.handler({ req, res, body, query, params, user: req.user });
      if (res.headersSent) return;
      if (result === undefined) {
        res.status(def.status ?? 204).end();
        return;
      }
      res.status(def.status ?? 200).json(result);
    });

    router[def.method](def.path, ...chain);
  }

  return { router, define };
}
```

Лістинг А.4 – Штрафна функція вибору столика (booking engine)

```ts
// backend/src/modules/booking/engine.ts (рядки 75–141)
/**
 * Штрафна функція для столика (менше — краще).
 * dayOpen / dayClose — межі робочого дня, які теж вважаються «сусідами».
 */
export function scoreTable(
  table: EngineTable,
  guests: number,
  start: Date,
  end: Date,
  busyForTable: BusyInterval[],
  dayOpen: Date,
  dayClose: Date,
  settings: EngineSettings,
  prefs: Preferences = {},
): ScoredTable {
  const reasons: string[] = [];
  let score = 0;

  const waste = table.seats - guests;
  score += waste * 10;
  if (waste === 0) reasons.push('Ідеально за кількістю місць');
  else if (waste <= 1) reasons.push('Оптимальний розмір столика');

  if (prefs.zone) {
    if (table.zone !== prefs.zone) score += 30;
    else reasons.push('У бажаній зоні');
  } else if (table.zone === 'BAR') {
    // барні місця пропонуємо лише тим, хто їх явно обрав, або коли інших варіантів немає
    score += 8;
  }

  // Найближчі сусідні бронювання до та після нашого інтервалу
  let prevEnd = dayOpen.getTime();
  let nextStart = dayClose.getTime();
  let hasPrev = false;
  let hasNext = false;
  for (const b of busyForTable) {
    const bEnd = b.endAt.getTime() + settings.bufferMin * MIN;
    const bStart = b.startAt.getTime() - settings.bufferMin * MIN;
    if (bEnd <= start.getTime() && bEnd >= prevEnd) {
      prevEnd = bEnd;
      hasPrev = true;
    }
    if (bStart >= end.getTime() && bStart <= nextStart) {
      nextStart = bStart;
      hasNext = true;
    }
  }
  const gapBefore = Math.max(0, (start.getTime() - prevEnd) / MIN);
  const gapAfter = Math.max(0, (nextStart - end.getTime()) / MIN);

  let fragmentation = 0;
  for (const gap of [gapBefore, gapAfter]) {
    if (gap > 0 && gap < settings.minUsefulGapMin) fragmentation += (settings.minUsefulGapMin - gap) / 5;
  }
  score += fragmentation;

  const tightFit = (hasPrev && gapBefore === 0) || (hasNext && gapAfter === 0);
  if (tightFit) {
    score -= 5;
    reasons.push('Щільне планування без «мертвих» проміжків');
  } else if (fragmentation === 0 && (hasPrev || hasNext)) {
    reasons.push('Не створює незручних проміжків у розкладі');
  }

  return { table, score: Math.round(score * 100) / 100, reasons };
}
```

Лістинг А.5 – Ідемпотентна оплата карткою через sandbox-шлюз

```ts
// backend/src/modules/payments/payments.service.ts (рядки 123–175)
export async function payByCard(actor: AuthUser, input: { orderId: number; tip: number; card: CardInput; idempotencyKey?: string }) {
  // Ідемпотентність: повторний запит з тим самим ключем не створює другий платіж
  if (input.idempotencyKey) {
    const existing = await prisma.payment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.orderId !== input.orderId) throw conflict('Ключ ідемпотентності вже використано', 'IDEMPOTENCY_KEY_REUSED');
      const order = await loadOrder(existing.orderId);
      return {
        payment: serializePayment(existing),
        order: serializeOrder(order, actor),
        requiresAction: existing.status === 'REQUIRES_ACTION',
        replayed: true,
      };
    }
  }

  const order = await loadOrder(input.orderId);
  assertPayable(order, actor);
  const invalid = validateCard(input.card, now());
  if (invalid) throw unprocessable(invalid.message, 'CARD_INVALID', { field: invalid.field });

  const digits = normalizeCardNumber(input.card.number);
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      amount: order.total,
      tip: input.tip,
      method: 'CARD',
      status: 'PENDING',
      createdAt: now(),
      providerRef: newProviderRef(),
      cardBrand: detectBrand(digits),
      cardLast4: digits.slice(-4),
      idempotencyKey: input.idempotencyKey,
    },
  });

  // Імітація мережевої затримки платіжного провайдера
  if (env.paymentLatencyMs > 0) await sleep(env.paymentLatencyMs);
  const outcome = authorize(input.card);

  if (outcome.kind === 'declined') return markFailed(payment.id, outcome.code, outcome.message);
  if (outcome.kind === 'requires_action') {
    const updated = await prisma.payment.update({ where: { id: payment.id }, data: { status: 'REQUIRES_ACTION' } });
    return {
      payment: serializePayment(updated),
      order: serializeOrder(await loadOrder(order.id), actor),
      requiresAction: true,
      challenge: { type: '3ds_otp', message: 'Банк надіслав код підтвердження (sandbox: 123456)' },
    };
  }
  return { ...(await finalizeSuccess(payment.id, actor)), requiresAction: false };
}
```

Лістинг А.6 – Шина подій між Restaurant API і Delivery API (PostgreSQL LISTEN/NOTIFY)

```ts
// backend/src/lib/bus.ts (рядки 32–83)
export async function publishOrderEvent(e: Omit<OrderBusEvent, 'source'>, db: Tx = prisma) {
  const payload: OrderBusEvent = { ...e, source: currentSystem };
  try {
    await db.$executeRaw`SELECT pg_notify(${ORDER_CHANNEL}, ${JSON.stringify(payload)})`;
  } catch (err) {
    if (!env.isTest) console.error('[bus] publish failed', err);
  }
}

/** Підписка на події іншої системи. Повертає функцію зупинки. */
export async function subscribeOrderEvents(handler: (e: OrderBusEvent) => void | Promise<void>) {
  // параметр ?schema=… потрібен лише Prisma; драйверу pg він невідомий
  const url = env.databaseUrl.replace(/\?.*$/, '');
  let client: Client | null = null;
  let stopped = false;

  const connect = async () => {
    client = new Client({ connectionString: url });
    client.on('notification', (msg) => {
      if (msg.channel !== ORDER_CHANNEL || !msg.payload) return;
      try {
        const e = JSON.parse(msg.payload) as OrderBusEvent;
        if (e.source === currentSystem) return; // власні події вже оброблено локально
        Promise.resolve(handler(e)).catch((err) => console.error('[bus] handler failed', err));
      } catch {
        /* некоректне повідомлення ігноруємо */
      }
    });
    client.on('error', () => reconnect());
    client.on('end', () => reconnect());
    await client.connect();
    await client.query(`LISTEN ${ORDER_CHANNEL}`);
  };

  let retry: NodeJS.Timeout | null = null;
  const reconnect = () => {
    if (stopped || retry) return;
    client?.removeAllListeners();
    client = null;
    retry = setTimeout(() => {
      retry = null;
      connect().catch(() => reconnect());
    }, 2000);
  };

  await connect().catch(() => reconnect());
  return async () => {
    stopped = true;
    if (retry) clearTimeout(retry);
    await client?.end().catch(() => null);
  };
}
```

Лістинг А.7 – Визначення зони доставки за геолокацією

```ts
// backend/src/delivery/geo.ts (рядки 25–58)
/** Відстань по поверхні Землі (формула гаверсинуса), км */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface ZoneMatch<Z extends GeoZone> {
  zone: Z;
  distanceKm: number;
  /** відстань відносно радіуса зони: ≤ 1 — точка всередині */
  ratio: number;
}

/**
 * Зони, відсортовані від найбільш до найменш відповідної точці.
 * Зони без центру/радіуса не беруть участі; неактивні — лише якщо includeInactive.
 */
export function rankZones<Z extends GeoZone>(zones: Z[], point: GeoPoint, includeInactive = false): ZoneMatch<Z>[] {
  return zones
    .filter((z) => z.centerLat != null && z.centerLng != null && z.radiusKm && (includeInactive || z.isActive))
    .map((zone) => {
      const d = distanceKm(point, { lat: zone.centerLat!, lng: zone.centerLng! });
      return { zone, distanceKm: d, ratio: d / zone.radiusKm! };
    })
    .sort((a, b) => a.ratio - b.ratio);
}

/** Зона, що обслуговує точку, або null — точка поза всіма активними зонами */
export function locateZone<Z extends GeoZone>(zones: Z[], point: GeoPoint): ZoneMatch<Z> | null {
  const best = rankZones(zones, point)[0];
  return best && best.ratio <= 1 ? best : null;
}
```

