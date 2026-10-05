import { Router, type Request, type Response, type RequestHandler } from 'express';
import type { Role } from '@prisma/client';
import { z, type ZodType } from 'zod';
import { authenticate, optionalAuth, type AuthUser } from '../middleware/auth';
import { forbidden } from './errors';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface RouteContext<B, Q, P> {
  req: Request;
  res: Response;
  body: B;
  query: Q;
  params: P;
  user: AuthUser | undefined;
}

export interface RouteDef<B = any, Q = any, P = any> {
  method: Method;
  path: string;
  summary: string;
  description?: string;
  tags: string[];
  /** true — потрібен JWT; 'optional' — JWT опціональний; false/undefined — публічний */
  auth?: boolean | 'optional';
  /** Ролі, яким дозволено виклик (RBAC). Перевіряється на сервері. */
  roles?: Role[];
  body?: ZodType<B>;
  query?: ZodType<Q>;
  params?: ZodType<P>;
  status?: number;
  responses?: Record<number, string>;
  middleware?: RequestHandler[];
  /** Повертає тіло відповіді (JSON). Якщо відповідь вже відправлена — повертає undefined. */
  handler: (ctx: RouteContext<B, Q, P>) => unknown | Promise<unknown>;
}

export interface RegisteredRoute extends RouteDef {
  fullPath: string;
}

/** Реєстр усіх endpoint Restaurant API — використовується для генерації OpenAPI (Swagger). */
export const routeRegistry: RegisteredRoute[] = [];
/** Окремий реєстр Delivery API (окремий сервіс — окрема специфікація). */
export const deliveryRegistry: RegisteredRoute[] = [];

export const idParam = z.object({ id: z.coerce.number().int().positive() });

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
