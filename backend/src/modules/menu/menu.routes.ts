import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { createRouter, idParam } from '../../lib/router';
import { prisma } from '../../lib/prisma';
import { conflict, notFound } from '../../lib/errors';
import { emit } from '../../lib/realtime';
import { dishStats, serializeDish, slugify } from './menu.service';

const { router, define } = createRouter('');

// ─────────────────────────────── Категорії ───────────────────────────────

const categoryBody = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]+$/, 'Slug: латиниця, цифри та дефіс')
    .max(60)
    .optional(),
  emoji: z.string().max(8).nullable().optional(),
  description: z.string().max(255).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
});

define({
  method: 'get',
  path: '/categories',
  summary: 'Категорії меню',
  tags: ['Menu'],
  handler: async () => {
    const categories = await prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { dishes: { where: { isArchived: false } } } } },
    });
    return categories.map(({ _count, ...c }) => ({ ...c, dishesCount: _count.dishes }));
  },
});

define({
  method: 'post',
  path: '/categories',
  summary: 'Створити категорію',
  tags: ['Menu'],
  roles: ['ADMIN'],
  status: 201,
  body: categoryBody,
  handler: async ({ body }) => {
    const category = await prisma.category.create({
      data: { ...body, slug: body.slug ?? slugify(body.name) },
    });
    emit('menu:changed', { type: 'category' }, { everyone: true });
    return category;
  },
});

define({
  method: 'patch',
  path: '/categories/:id',
  summary: 'Редагувати категорію',
  tags: ['Menu'],
  roles: ['ADMIN'],
  params: idParam,
  body: categoryBody.partial(),
  handler: async ({ params, body }) => {
    const category = await prisma.category.update({ where: { id: params.id }, data: body });
    emit('menu:changed', { type: 'category' }, { everyone: true });
    return category;
  },
});

define({
  method: 'delete',
  path: '/categories/:id',
  summary: 'Видалити категорію (лише порожню)',
  tags: ['Menu'],
  roles: ['ADMIN'],
  params: idParam,
  handler: async ({ params }) => {
    const count = await prisma.dish.count({ where: { categoryId: params.id } });
    if (count > 0) throw conflict('У категорії є страви — спочатку перенесіть або видаліть їх', 'CATEGORY_NOT_EMPTY');
    await prisma.category.delete({ where: { id: params.id } });
    emit('menu:changed', { type: 'category' }, { everyone: true });
    return undefined;
  },
});

// ─────────────────────────────── Страви ───────────────────────────────

const dishQuery = z.object({
  categoryId: z.coerce.number().int().positive().optional(),
  category: z.string().optional(),
  search: z.string().trim().max(100).optional(),
  vegetarian: z.stringbool().optional(),
  spicy: z.stringbool().optional(),
  available: z.stringbool().optional(),
  chefChoice: z.stringbool().optional(),
  maxPrice: z.coerce.number().int().positive().optional(),
  includeArchived: z.stringbool().optional(),
  sort: z.enum(['popular', 'price_asc', 'price_desc', 'rating', 'name', 'menu']).default('menu'),
});

const dishBody = z.object({
  categoryId: z.number().int().positive(),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().min(1).max(500),
  price: z.number().int().positive('Ціна має бути більшою за 0').max(10_000_00),
  imageUrl: z.string().trim().max(500).nullable().optional(),
  weightGrams: z.number().int().positive().max(10000).nullable().optional(),
  calories: z.number().int().min(0).max(10000).nullable().optional(),
  prepTimeMin: z.number().int().min(1).max(180).default(15),
  isAvailable: z.boolean().default(true),
  isVegetarian: z.boolean().default(false),
  isSpicy: z.boolean().default(false),
  isChefChoice: z.boolean().default(false),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  allergens: z.array(z.string().trim().min(1).max(30)).max(15).default([]),
});

define({
  method: 'get',
  path: '/dishes',
  summary: 'Меню: пошук, фільтрація та сортування страв',
  tags: ['Menu'],
  auth: 'optional',
  query: dishQuery,
  handler: async ({ query, user }) => {
    const canSeeArchived = user?.role === 'ADMIN' && query.includeArchived;
    const where: Prisma.DishWhereInput = {
      ...(canSeeArchived ? {} : { isArchived: false }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.category ? { category: { slug: query.category } } : {}),
      ...(query.vegetarian !== undefined ? { isVegetarian: query.vegetarian } : {}),
      ...(query.spicy !== undefined ? { isSpicy: query.spicy } : {}),
      ...(query.available !== undefined ? { isAvailable: query.available } : {}),
      ...(query.chefChoice !== undefined ? { isChefChoice: query.chefChoice } : {}),
      ...(query.maxPrice ? { price: { lte: query.maxPrice } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { tags: { has: query.search.toLowerCase() } },
            ],
          }
        : {}),
    };
    const [dishes, stats] = await Promise.all([
      prisma.dish.findMany({
        where,
        include: { category: true },
        orderBy: [{ category: { sortOrder: 'asc' } }, { isChefChoice: 'desc' }, { name: 'asc' }],
      }),
      dishStats(),
    ]);
    const items = dishes.map((d) => serializeDish(d, stats.get(d.id)));
    switch (query.sort) {
      case 'price_asc':
        items.sort((a, b) => a.price - b.price);
        break;
      case 'price_desc':
        items.sort((a, b) => b.price - a.price);
        break;
      case 'rating':
        items.sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0) || b.reviewsCount - a.reviewsCount);
        break;
      case 'popular':
        items.sort((a, b) => b.ordersCount - a.ordersCount);
        break;
      case 'name':
        items.sort((a, b) => a.name.localeCompare(b.name, 'uk'));
        break;
    }
    return items;
  },
});

define({
  method: 'get',
  path: '/dishes/:id',
  summary: 'Деталі страви з останніми відгуками',
  tags: ['Menu'],
  params: idParam,
  handler: async ({ params }) => {
    const dish = await prisma.dish.findUnique({ where: { id: params.id }, include: { category: true } });
    if (!dish) throw notFound('Страву не знайдено');
    const [stats, reviews] = await Promise.all([
      dishStats(),
      prisma.review.findMany({
        where: { dishId: dish.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: { select: { name: true } } },
      }),
    ]);
    return {
      ...serializeDish(dish, stats.get(dish.id)),
      reviews: reviews.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        author: r.user.name.split(' ')[0],
      })),
    };
  },
});

define({
  method: 'post',
  path: '/dishes',
  summary: 'Додати страву',
  tags: ['Menu'],
  roles: ['ADMIN'],
  status: 201,
  body: dishBody,
  handler: async ({ body }) => {
    const dish = await prisma.dish.create({ data: body, include: { category: true } });
    emit('menu:changed', { type: 'dish', id: dish.id }, { everyone: true });
    return serializeDish(dish);
  },
});

define({
  method: 'patch',
  path: '/dishes/:id',
  summary: 'Редагувати страву',
  tags: ['Menu'],
  roles: ['ADMIN'],
  params: idParam,
  body: dishBody.partial().extend({ isArchived: z.boolean().optional() }),
  handler: async ({ params, body }) => {
    const dish = await prisma.dish.update({ where: { id: params.id }, data: body, include: { category: true } });
    emit('menu:changed', { type: 'dish', id: dish.id }, { everyone: true });
    return serializeDish(dish);
  },
});

define({
  method: 'patch',
  path: '/dishes/:id/availability',
  summary: 'Стоп-лист: увімкнути / вимкнути наявність страви',
  description: 'Доступно працівникам залу та кухні. Зміна миттєво розсилається всім клієнтам через WebSocket.',
  tags: ['Menu'],
  roles: ['STAFF', 'KITCHEN', 'ADMIN'],
  params: idParam,
  body: z.object({ isAvailable: z.boolean() }),
  handler: async ({ params, body }) => {
    const dish = await prisma.dish.update({
      where: { id: params.id },
      data: { isAvailable: body.isAvailable },
      include: { category: true },
    });
    emit('menu:changed', { type: 'availability', id: dish.id, isAvailable: dish.isAvailable }, { everyone: true });
    return serializeDish(dish);
  },
});

define({
  method: 'delete',
  path: '/dishes/:id',
  summary: 'Видалити страву (архівація, якщо вона вже є в замовленнях)',
  tags: ['Menu'],
  roles: ['ADMIN'],
  params: idParam,
  handler: async ({ params }) => {
    const used = await prisma.orderItem.count({ where: { dishId: params.id } });
    if (used > 0) {
      await prisma.dish.update({ where: { id: params.id }, data: { isArchived: true, isAvailable: false } });
      emit('menu:changed', { type: 'dish', id: params.id }, { everyone: true });
      return { archived: true };
    }
    await prisma.dish.delete({ where: { id: params.id } });
    emit('menu:changed', { type: 'dish', id: params.id }, { everyone: true });
    return { archived: false, deleted: true };
  },
});

export default router;
