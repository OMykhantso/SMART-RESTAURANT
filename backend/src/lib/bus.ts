import { Client } from 'pg';
import { prisma, type Tx } from './prisma';
import { env } from '../config';

/**
 * ШИНА ПОДІЙ МІЖ СИСТЕМАМИ (PostgreSQL LISTEN / NOTIFY).
 *
 * Restaurant API і Delivery API — два окремі процеси з власними Socket.IO-серверами,
 * але однією базою даних. Коли одна система змінює спільне замовлення, вона надсилає
 * NOTIFY у канал `sr_orders`; інша система отримує подію і сповіщає своїх клієнтів
 * (кухня у Web, клієнт і курʼєри — у мобільному застосунку).
 * NOTIFY, виконаний у транзакції, доставляється лише після COMMIT — подія ніколи не
 * випереджає дані.
 */
export const ORDER_CHANNEL = 'sr_orders';

export type SystemName = 'restaurant' | 'delivery';

export interface OrderBusEvent {
  source: SystemName;
  event: 'order:created' | 'order:updated';
  orderId: number;
  status: string;
}

let currentSystem: SystemName = 'restaurant';
export const setSystemName = (name: SystemName) => {
  currentSystem = name;
};
export const systemName = () => currentSystem;

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
