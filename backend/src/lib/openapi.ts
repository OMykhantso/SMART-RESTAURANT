import { z } from 'zod';
import { routeRegistry } from './router';

/**
 * Генерує OpenAPI 3.1 специфікацію з реєстру маршрутів.
 * Схеми запитів беруться безпосередньо з zod-валідаторів, тож документація
 * завжди відповідає реальній серверній валідації.
 */
function toJsonSchema(schema: unknown, io: 'input' | 'output' = 'input') {
  try {
    const json = z.toJSONSchema(schema as z.ZodType, { io, unrepresentable: 'any' }) as Record<string, unknown>;
    delete json.$schema;
    return json;
  } catch {
    return { type: 'object' };
  }
}

export function buildOpenApi() {
  const paths: Record<string, Record<string, unknown>> = {};
  const tagSet = new Set<string>();

  for (const r of routeRegistry) {
    const path = r.fullPath.replace(/:(\w+)/g, '{$1}');
    paths[path] ??= {};
    r.tags.forEach((t) => tagSet.add(t));

    const parameters: unknown[] = [];
    const pathParams = [...r.fullPath.matchAll(/:(\w+)/g)].map((m) => m[1]);
    for (const p of pathParams) {
      parameters.push({ name: p, in: 'path', required: true, schema: { type: 'integer' } });
    }
    if (r.query) {
      const q = toJsonSchema(r.query) as { properties?: Record<string, unknown>; required?: string[] };
      for (const [name, schema] of Object.entries(q.properties ?? {})) {
        parameters.push({ name, in: 'query', required: q.required?.includes(name) ?? false, schema });
      }
    }

    const secured = r.auth === true || Boolean(r.roles);
    const description = [
      r.description,
      r.roles ? `**Ролі:** ${r.roles.join(', ')}` : secured ? '**Потрібна автентифікація**' : r.auth === 'optional' ? 'Автентифікація опціональна' : 'Публічний endpoint',
    ]
      .filter(Boolean)
      .join('\n\n');

    const responses: Record<string, unknown> = {};
    const successStatus = String(r.status ?? 200);
    responses[successStatus] = { description: r.responses?.[Number(successStatus)] ?? 'Успішна відповідь' };
    for (const [code, text] of Object.entries(r.responses ?? {})) {
      if (code !== successStatus) responses[code] = { description: text, content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
    }
    if (r.body || r.query) responses['400'] ??= { description: 'Помилка валідації', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } };
    if (secured) {
      responses['401'] ??= { description: 'Не автентифіковано' };
      if (r.roles) responses['403'] ??= { description: 'Недостатньо прав (RBAC)' };
    }

    paths[path][r.method] = {
      summary: r.summary,
      description,
      tags: r.tags,
      ...(parameters.length ? { parameters } : {}),
      ...(r.body
        ? {
            requestBody: {
              required: true,
              content: { 'application/json': { schema: toJsonSchema(r.body) } },
            },
          }
        : {}),
      ...(secured ? { security: [{ bearerAuth: [] }] } : r.auth === 'optional' ? { security: [{}, { bearerAuth: [] }] } : {}),
      responses,
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'SMART RESTAURANT API',
      version: '1.0.0',
      description:
        'REST API системи «Smart Restaurant»: меню, столики, booking engine, бронювання, замовлення, kitchen display, ' +
        'sandbox-оплата, QR check-in, рекомендації, аналітика.\n\n' +
        'Real-time події — Socket.IO (той самий хост): order:created, order:updated, reservation:created, ' +
        'reservation:updated, tables:changed, menu:changed, payment:succeeded.\n\n' +
        'Усі грошові суми — у копійках (integer).',
    },
    servers: [{ url: '/' }],
    tags: [...tagSet].map((name) => ({ name })),
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'TABLE_ALREADY_BOOKED' },
                message: { type: 'string', example: 'Цей столик вже зайнятий на цей час' },
                details: {},
              },
            },
          },
        },
      },
    },
    paths,
  };
}
