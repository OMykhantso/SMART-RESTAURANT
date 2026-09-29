import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { env } from './config';
import { errorHandler, notFoundHandler } from './middleware/error';
import { buildOpenApi } from './lib/openapi';
import { prisma } from './lib/prisma';
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import menuRoutes from './modules/menu/menu.routes';
import tablesRoutes from './modules/tables/tables.routes';
import bookingRoutes from './modules/booking/booking.routes';
import reservationsRoutes from './modules/reservations/reservations.routes';
import ordersRoutes from './modules/orders/orders.routes';
import paymentsRoutes from './modules/payments/payments.routes';
import recommendationsRoutes from './modules/recommendations/recommendations.routes';
import analyticsRoutes from './modules/analytics/analytics.routes';
import uploadsRoutes from './modules/uploads/uploads.routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );
  app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(','), credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  if (!env.isTest) app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

  app.use('/uploads', express.static(env.uploadsDir, { maxAge: '7d' }));

  app.get('/api/health', async (_req, res) => {
    const started = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', db: 'up', dbLatencyMs: Date.now() - started, time: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/users', usersRoutes);
  app.use('/api', menuRoutes);
  app.use('/api/tables', tablesRoutes);
  app.use('/api/booking', bookingRoutes);
  app.use('/api/reservations', reservationsRoutes);
  app.use('/api', ordersRoutes);
  app.use('/api/payments', paymentsRoutes);
  app.use('/api/recommendations', recommendationsRoutes);
  app.use('/api/analytics', analyticsRoutes);
  app.use('/api/uploads', uploadsRoutes);

  const openapi = buildOpenApi();
  app.get('/api/openapi.json', (_req, res) => res.json(openapi));
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openapi, {
      customSiteTitle: 'Smart Restaurant API',
      swaggerOptions: { persistAuthorization: true, docExpansion: 'none', tagsSorter: 'alpha' },
    }),
  );

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
