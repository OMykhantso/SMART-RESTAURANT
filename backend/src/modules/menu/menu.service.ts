import type { Dish, Category } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export interface DishStats {
  avgRating: number | null;
  reviewsCount: number;
  ordersCount: number;
  /** Входить у топ-6 за продажами за 30 днів */
  isHit: boolean;
}

/** Агреговані показники страв: середній рейтинг, к-сть відгуків, популярність (к-сть порцій за 30 днів). */
export async function dishStats(): Promise<Map<number, DishStats>> {
  const since = new Date(Date.now() - 30 * 86400000);
  const [ratings, sales] = await Promise.all([
    prisma.review.groupBy({
      by: ['dishId'],
      where: { dishId: { not: null } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.orderItem.groupBy({
      by: ['dishId'],
      where: { order: { status: { not: 'CANCELLED' }, createdAt: { gte: since } } },
      _sum: { quantity: true },
    }),
  ]);
  const map = new Map<number, DishStats>();
  const get = (id: number) => {
    let s = map.get(id);
    if (!s) {
      s = { avgRating: null, reviewsCount: 0, ordersCount: 0, isHit: false };
      map.set(id, s);
    }
    return s;
  };
  for (const r of ratings) {
    if (r.dishId == null) continue;
    const s = get(r.dishId);
    s.avgRating = r._avg.rating ? Math.round(r._avg.rating * 10) / 10 : null;
    s.reviewsCount = r._count._all;
  }
  for (const r of sales) get(r.dishId).ordersCount = r._sum.quantity ?? 0;
  const threshold = [...map.values()].map((s) => s.ordersCount).sort((a, b) => b - a)[5] ?? 0;
  for (const s of map.values()) s.isHit = s.ordersCount > 0 && s.ordersCount >= threshold;
  return map;
}

export function serializeDish(dish: Dish & { category?: Category | null }, stats?: DishStats) {
  return {
    id: dish.id,
    categoryId: dish.categoryId,
    category: dish.category
      ? { id: dish.category.id, name: dish.category.name, slug: dish.category.slug, emoji: dish.category.emoji }
      : undefined,
    name: dish.name,
    description: dish.description,
    price: dish.price,
    imageUrl: dish.imageUrl,
    weightGrams: dish.weightGrams,
    calories: dish.calories,
    prepTimeMin: dish.prepTimeMin,
    isAvailable: dish.isAvailable,
    isArchived: dish.isArchived,
    isVegetarian: dish.isVegetarian,
    isSpicy: dish.isSpicy,
    isChefChoice: dish.isChefChoice,
    tags: dish.tags,
    allergens: dish.allergens,
    avgRating: stats?.avgRating ?? null,
    reviewsCount: stats?.reviewsCount ?? 0,
    ordersCount: stats?.ordersCount ?? 0,
    isHit: stats?.isHit ?? false,
  };
}

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ye', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'yi',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh',
  ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'yu', я: 'ya', "'": '', 'ʼ': '',
};

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .split('')
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
