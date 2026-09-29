import { z } from 'zod';
import { createRouter } from '../../lib/router';
import { prisma } from '../../lib/prisma';
import { now, toLocal } from '../../lib/time';
import { dishStats, serializeDish } from '../menu/menu.service';
import { recommend } from './engine';

const { router, define } = createRouter('/recommendations');

define({
  method: 'get',
  path: '/',
  summary: 'Персональні рекомендації страв (з урахуванням кошика, історії, популярності, рейтингу, часу доби)',
  description: 'Кожна рекомендація містить пояснення (reasons) та внесок кожного фактора (components).',
  tags: ['Recommendations'],
  auth: 'optional',
  query: z.object({
    cart: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0) : [])),
    limit: z.coerce.number().int().min(1).max(20).default(8),
  }),
  handler: async ({ query, user }) => {
    const since = new Date(now().getTime() - 90 * 86400000);
    const [dishes, orders, userItems, ratings, stats] = await Promise.all([
      prisma.dish.findMany({ where: { isArchived: false }, include: { category: true } }),
      prisma.order.findMany({
        where: { status: { not: 'CANCELLED' }, createdAt: { gte: since } },
        select: { items: { select: { dishId: true } } },
        take: 5000,
        orderBy: { createdAt: 'desc' },
      }),
      user
        ? prisma.orderItem.groupBy({
            by: ['dishId'],
            where: { order: { userId: user.id, status: { not: 'CANCELLED' } } },
            _sum: { quantity: true },
          })
        : Promise.resolve([]),
      prisma.review.groupBy({ by: ['dishId'], where: { dishId: { not: null } }, _avg: { rating: true }, _count: { _all: true } }),
      dishStats(),
    ]);

    const recs = recommend(
      {
        dishes: dishes.map((d) => ({
          id: d.id,
          categoryId: d.categoryId,
          categorySlug: d.category.slug,
          price: d.price,
          isAvailable: d.isAvailable,
          isChefChoice: d.isChefChoice,
          tags: d.tags,
        })),
        baskets: orders.map((o) => o.items.map((i) => i.dishId)),
        userDishCounts: new Map(userItems.map((u) => [u.dishId, u._sum.quantity ?? 0])),
        ratings: new Map(
          ratings.filter((r) => r.dishId != null).map((r) => [r.dishId!, { avg: r._avg.rating ?? 0, count: r._count._all }]),
        ),
        cart: query.cart,
        hour: toLocal(now()).hour,
        names: new Map(dishes.map((d) => [d.id, d.name])),
      },
      query.limit,
    );
    const byId = new Map(dishes.map((d) => [d.id, d]));
    return recs.map((r) => ({
      dish: serializeDish(byId.get(r.dishId)!, stats.get(r.dishId)),
      score: r.score,
      reasons: r.reasons,
      components: r.components,
    }));
  },
});

export default router;
