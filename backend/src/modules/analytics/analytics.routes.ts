import { z } from 'zod';
import { DateTime } from 'luxon';
import { createRouter } from '../../lib/router';
import { prisma } from '../../lib/prisma';
import { now, TZ } from '../../lib/time';

const { router, define } = createRouter('/analytics');

const pct = (curr: number, prev: number) => (prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 1000) / 10);
const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

async function periodMetrics(from: Date, to: Date) {
  const [payments, orders, reservations, reviews] = await Promise.all([
    prisma.payment.findMany({ where: { status: 'SUCCEEDED', paidAt: { gte: from, lt: to } } }),
    prisma.order.findMany({
      where: { createdAt: { gte: from, lt: to } },
      select: { id: true, status: true, total: true, createdAt: true, confirmedAt: true, readyAt: true, tableId: true },
    }),
    prisma.reservation.findMany({
      where: { startAt: { gte: from, lt: to } },
      select: { status: true, guests: true, source: true, checkedInAt: true, completedAt: true, tableId: true },
    }),
    prisma.review.aggregate({ where: { dishId: null, createdAt: { gte: from, lt: to } }, _avg: { rating: true }, _count: { _all: true } }),
  ]);
  const revenue = payments.reduce((s, p) => s + p.amount, 0);
  const tips = payments.reduce((s, p) => s + p.tip, 0);
  const validOrders = orders.filter((o) => o.status !== 'CANCELLED');
  const prepTimes = orders
    .filter((o) => o.confirmedAt && o.readyAt)
    .map((o) => (o.readyAt!.getTime() - o.confirmedAt!.getTime()) / 60000);
  const visits = reservations
    .filter((r) => r.checkedInAt && r.completedAt)
    .map((r) => (r.completedAt!.getTime() - r.checkedInAt!.getTime()) / 60000);
  const finished = reservations.filter((r) => ['COMPLETED', 'CHECKED_IN', 'NO_SHOW'].includes(r.status));
  const noShows = reservations.filter((r) => r.status === 'NO_SHOW').length;
  return {
    payments,
    orders,
    reservations,
    kpis: {
      revenue,
      tips,
      ordersCount: validOrders.length,
      paidOrders: payments.length,
      avgCheck: payments.length ? Math.round(revenue / payments.length) : 0,
      guests: reservations.filter((r) => ['CHECKED_IN', 'COMPLETED'].includes(r.status)).reduce((s, r) => s + r.guests, 0),
      reservationsCount: reservations.length,
      noShowRate: finished.length ? Math.round((noShows / finished.length) * 1000) / 10 : 0,
      cancellationRate: reservations.length
        ? Math.round((reservations.filter((r) => r.status === 'CANCELLED').length / reservations.length) * 1000) / 10
        : 0,
      avgRating: reviews._avg.rating ? Math.round(reviews._avg.rating * 10) / 10 : null,
      reviewsCount: reviews._count._all,
      avgPrepMin: Math.round(avg(prepTimes) * 10) / 10,
      avgVisitMin: Math.round(avg(visits)),
    },
  };
}

define({
  method: 'get',
  path: '/overview',
  summary: 'Аналітика за період: виручка, середній чек, топ страв, завантаженість, воронка бронювань',
  tags: ['Analytics'],
  roles: ['STAFF', 'ADMIN'],
  query: z.object({ days: z.coerce.number().int().min(1).max(90).default(7) }),
  handler: async ({ query }) => {
    const end = DateTime.fromJSDate(now(), { zone: TZ() }).endOf('day');
    const start = end.minus({ days: query.days }).plus({ milliseconds: 1 }).startOf('day');
    const prevStart = start.minus({ days: query.days });
    const [curr, prev] = await Promise.all([
      periodMetrics(start.toJSDate(), end.toJSDate()),
      periodMetrics(prevStart.toJSDate(), start.toJSDate()),
    ]);

    // Виручка по днях
    const byDay = new Map<string, { revenue: number; orders: number; guests: number }>();
    for (let d = start; d <= end; d = d.plus({ days: 1 })) byDay.set(d.toISODate()!, { revenue: 0, orders: 0, guests: 0 });
    for (const p of curr.payments) {
      const key = DateTime.fromJSDate(p.paidAt!, { zone: TZ() }).toISODate()!;
      const row = byDay.get(key);
      if (row) {
        row.revenue += p.amount;
        row.orders += 1;
      }
    }

    // Навантаження по годинах (кількість замовлень)
    const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0 }));
    for (const o of curr.orders) {
      if (o.status === 'CANCELLED') continue;
      byHour[DateTime.fromJSDate(o.createdAt, { zone: TZ() }).hour].orders += 1;
    }

    // Топ страв і частка категорій
    const items = await prisma.orderItem.findMany({
      where: { order: { status: 'PAID', paidAt: { gte: start.toJSDate(), lte: end.toJSDate() } } },
      include: { dish: { select: { id: true, name: true, imageUrl: true, category: { select: { name: true, emoji: true } } } } },
    });
    const dishAgg = new Map<number, { dishId: number; name: string; imageUrl: string | null; quantity: number; revenue: number }>();
    const catAgg = new Map<string, { category: string; emoji: string | null; revenue: number; quantity: number }>();
    for (const i of items) {
      const d = dishAgg.get(i.dishId) ?? { dishId: i.dishId, name: i.dish.name, imageUrl: i.dish.imageUrl, quantity: 0, revenue: 0 };
      d.quantity += i.quantity;
      d.revenue += i.quantity * i.unitPrice;
      dishAgg.set(i.dishId, d);
      const c = catAgg.get(i.dish.category.name) ?? { category: i.dish.category.name, emoji: i.dish.category.emoji, revenue: 0, quantity: 0 };
      c.revenue += i.quantity * i.unitPrice;
      c.quantity += i.quantity;
      catAgg.set(i.dish.category.name, c);
    }

    const statusCounts = new Map<string, number>();
    const sourceCounts = new Map<string, number>();
    for (const r of curr.reservations) {
      statusCounts.set(r.status, (statusCounts.get(r.status) ?? 0) + 1);
      sourceCounts.set(r.source, (sourceCounts.get(r.source) ?? 0) + 1);
    }

    // Завантаженість столиків: частка столиків, що мали хоча б один візит на день
    const tablesCount = await prisma.diningTable.count({ where: { isActive: true } });

    return {
      period: { from: start.toISODate(), to: end.toISODate(), days: query.days },
      kpis: curr.kpis,
      deltas: {
        revenue: pct(curr.kpis.revenue, prev.kpis.revenue),
        ordersCount: pct(curr.kpis.ordersCount, prev.kpis.ordersCount),
        avgCheck: pct(curr.kpis.avgCheck, prev.kpis.avgCheck),
        guests: pct(curr.kpis.guests, prev.kpis.guests),
        reservationsCount: pct(curr.kpis.reservationsCount, prev.kpis.reservationsCount),
      },
      revenueByDay: [...byDay.entries()].map(([date, v]) => ({ date, ...v })),
      ordersByHour: byHour.filter((h) => h.hour >= 8),
      topDishes: [...dishAgg.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 8),
      categories: [...catAgg.values()].sort((a, b) => b.revenue - a.revenue),
      reservationsByStatus: [...statusCounts.entries()].map(([status, count]) => ({ status, count })),
      reservationsBySource: [...sourceCounts.entries()].map(([source, count]) => ({ source, count })),
      tablesCount,
    };
  },
});

define({
  method: 'get',
  path: '/today',
  summary: 'Оперативна зведена інформація на сьогодні (для дашборду працівника)',
  tags: ['Analytics'],
  roles: ['STAFF', 'KITCHEN', 'ADMIN'],
  handler: async () => {
    const t = now();
    const day = DateTime.fromJSDate(t, { zone: TZ() }).startOf('day');
    const from = day.toJSDate();
    const to = day.plus({ days: 1 }).toJSDate();
    const [reservations, orders, payments, tables, seated] = await Promise.all([
      prisma.reservation.groupBy({ by: ['status'], where: { startAt: { gte: from, lt: to } }, _count: { _all: true }, _sum: { guests: true } }),
      prisma.order.groupBy({ by: ['status'], where: { createdAt: { gte: from, lt: to } }, _count: { _all: true } }),
      prisma.payment.aggregate({ where: { status: 'SUCCEEDED', paidAt: { gte: from, lt: to } }, _sum: { amount: true, tip: true }, _count: { _all: true } }),
      prisma.diningTable.count({ where: { isActive: true } }),
      prisma.reservation.findMany({ where: { status: 'CHECKED_IN' }, select: { guests: true, tableId: true } }),
    ]);
    const resBy = Object.fromEntries(reservations.map((r) => [r.status, r._count._all]));
    const ordBy = Object.fromEntries(orders.map((o) => [o.status, o._count._all]));
    const readyOrders = await prisma.order.findMany({
      where: { readyAt: { gte: from, lt: to }, confirmedAt: { not: null } },
      select: { confirmedAt: true, readyAt: true },
    });
    return {
      date: day.toISODate(),
      reservations: {
        total: reservations.reduce((s, r) => s + r._count._all, 0),
        byStatus: resBy,
        expectedGuests: reservations
          .filter((r) => ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'COMPLETED'].includes(r.status))
          .reduce((s, r) => s + (r._sum.guests ?? 0), 0),
        pending: resBy.PENDING ?? 0,
      },
      orders: {
        total: orders.reduce((s, o) => s + o._count._all, 0),
        byStatus: ordBy,
        active: (ordBy.NEW ?? 0) + (ordBy.CONFIRMED ?? 0) + (ordBy.PREPARING ?? 0) + (ordBy.READY ?? 0) + (ordBy.SERVED ?? 0),
      },
      revenue: payments._sum.amount ?? 0,
      tips: payments._sum.tip ?? 0,
      paymentsCount: payments._count._all,
      avgCheck: payments._count._all ? Math.round((payments._sum.amount ?? 0) / payments._count._all) : 0,
      avgPrepMin: readyOrders.length
        ? Math.round(avg(readyOrders.map((o) => (o.readyAt!.getTime() - o.confirmedAt!.getTime()) / 60000)))
        : null,
      tables: { total: tables, occupied: new Set(seated.map((s) => s.tableId)).size },
      guestsInHouse: seated.reduce((s, r) => s + r.guests, 0),
    };
  },
});

export default router;
