import http from 'node:http';
import os from 'node:os';
import { env } from './config';
import { createApp } from './app';
import { initRealtime } from './lib/realtime';
import { prisma } from './lib/prisma';
import { startScheduler } from './jobs/scheduler';

const app = createApp();
const server = http.createServer(app);
initRealtime(server);
const timer = startScheduler();

server.listen(env.port, '0.0.0.0', () => {
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  console.log(`\n🍽  Smart Restaurant API  → http://localhost:${env.port}/api`);
  console.log(`📘 Swagger (OpenAPI)     → http://localhost:${env.port}/api/docs`);
  if (lan) console.log(`📱 Для мобільного (LAN)  → http://${lan}:${env.port}`);
  console.log('');
});

async function shutdown() {
  clearInterval(timer);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
