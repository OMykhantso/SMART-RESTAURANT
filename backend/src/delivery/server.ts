import http from 'node:http';
import os from 'node:os';
import { env } from '../config';
import { prisma } from '../lib/prisma';
import { setSystemName, subscribeOrderEvents } from '../lib/bus';
import { emitLocally, loadOrder, setDeliveryHook } from '../modules/orders/orders.service';
import { createDeliveryApp } from './app';
import { emitDeliveryUpdate, initDeliveryRealtime } from './realtime';
import { startDeliveryScheduler } from './scheduler';

setSystemName('delivery');
setDeliveryHook(emitDeliveryUpdate);

const app = createDeliveryApp();
const server = http.createServer(app);
initDeliveryRealtime(server);
const timer = startDeliveryScheduler();

// зміни замовлень доставки з Restaurant API (кухня) → клієнт і курʼєри
let stopBus: (() => Promise<void>) | null = null;
subscribeOrderEvents(async (e) => {
  const order = await loadOrder(e.orderId).catch(() => null);
  if (order) emitLocally(order, e.event);
}).then((stop) => (stopBus = stop));

server.listen(env.deliveryPort, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  console.log(`\n🛵 Smart Restaurant · Delivery API → http://localhost:${env.deliveryPort}/api`);
  console.log(`📘 Swagger (OpenAPI)              → http://localhost:${env.deliveryPort}/api/docs`);
  if (lan) console.log(`📱 Для мобільного (LAN)           → http://${lan}:${env.deliveryPort}`);
  console.log('');
});

async function shutdown() {
  clearInterval(timer);
  await stopBus?.();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
