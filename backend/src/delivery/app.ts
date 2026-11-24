import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { env } from '../config';
import { errorHandler, notFoundHandler } from '../middleware/error';
import { buildOpenApi } from '../lib/openapi';
import { deliveryRegistry } from '../lib/router';
import { prisma } from '../lib/prisma';
import { deliveryRouters } from './routes';

/**
 * DELIVERY API — окремий сервіс служби доставки (власний процес, порт і Docker-контейнер).
 * Працює з тією самою базою PostgreSQL, що й Restaurant API: меню, користувачі та замовлення спільні,
 * тому замовлення доставки одразу бачить кухня у Web, а клієнт — статуси кухні в мобільному застосунку.
 */
export function createDeliveryApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' }, contentSecurityPolicy: false }));
  app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(','), credentials: true }));
  app.use(express.json({ limit: '256kb' }));
  if (!env.isTest) app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

  app.get('/api/health', async (_req, res) => {
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', system: 'delivery', db: 'up', dbLatencyMs: Date.now() - started, time: new Date().toISOString() });
  });

  for (const r of deliveryRouters) app.use(r.path, r.router);

  const openapi = buildOpenApi(deliveryRegistry, {
    title: 'SMART RESTAURANT · Delivery API',
    version: '1.0.0',
    description:
      'Окремий сервіс служби доставки: зони, адреси, розрахунок вартості, оформлення й оплата доставки, робоче місце курʼєра, ' +
      'диспетчерська. Спільна з Restaurant API база даних PostgreSQL; вхід — тим самим JWT (POST /api/auth/login у Restaurant API).\n\n' +
      'Real-time — власний Socket.IO (той самий хост і порт): delivery:updated (клієнт, курʼєр, диспетчер), courier:queue (курʼєри). ' +
      'Зміни, зроблені кухнею в Restaurant API, надходять сюди через PostgreSQL LISTEN/NOTIFY.\n\n' +
      'Усі грошові суми — у копійках (integer).',
  });
  app.get('/api/openapi.json', (_req, res) => res.json(openapi));
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openapi, {
      customSiteTitle: 'Smart Restaurant · Delivery API',
      swaggerOptions: { persistAuthorization: true, docExpansion: 'none', tagsSorter: 'alpha' },
    }),
  );

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
