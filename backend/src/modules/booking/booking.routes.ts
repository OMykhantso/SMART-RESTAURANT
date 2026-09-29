import { z } from 'zod';
import { TableZone } from '@prisma/client';
import { createRouter } from '../../lib/router';
import { restaurant } from '../../config';
import { todayLocal, TZ } from '../../lib/time';
import { getAvailability, getTablesAvailability } from './booking.service';

const { router, define } = createRouter('/booking');

define({
  method: 'get',
  path: '/config',
  summary: 'Параметри бронювання: години роботи, крок слотів, обмеження',
  tags: ['Booking engine'],
  handler: () => ({
    restaurant: restaurant.name,
    timezone: TZ(),
    today: todayLocal().toISODate(),
    openingHours: restaurant.openingHours,
    slotStepMin: restaurant.slotStepMin,
    bufferMin: restaurant.bufferMin,
    minLeadMin: restaurant.minLeadMin,
    maxAdvanceDays: restaurant.maxAdvanceDays,
    maxPartySize: restaurant.maxPartySize,
    clientCancelDeadlineMin: restaurant.clientCancelDeadlineMin,
    checkInEarlyMin: restaurant.checkInEarlyMin,
    durations: [1, 2, 3, 4, 5, 6, 7, 8].map((g) => ({ guests: g, minutes: restaurant.durationForParty(g) })),
    zones: [
      { id: 'HALL', label: 'Головна зала' },
      { id: 'TERRACE', label: 'Тераса' },
      { id: 'VIP', label: 'VIP-зала' },
      { id: 'BAR', label: 'Барна зона' },
    ],
  }),
});

define({
  method: 'get',
  path: '/availability',
  summary: 'Доступні слоти на дату для N гостей (з рекомендованим столиком для кожного слоту)',
  tags: ['Booking engine'],
  auth: 'optional',
  query: z.object({
    date: z.iso.date(),
    guests: z.coerce.number().int().min(1).max(20),
    zone: z.enum(TableZone).optional(),
  }),
  handler: ({ query, user }) =>
    getAvailability({
      ...query,
      ignoreLeadTime: user?.role === 'STAFF' || user?.role === 'ADMIN',
    }),
});

define({
  method: 'get',
  path: '/tables',
  summary: 'План залу: стан кожного столика на обраний час (FREE / BUSY / TOO_SMALL) + рекомендація',
  tags: ['Booking engine'],
  query: z.object({
    startAt: z.iso.datetime({ offset: true }).transform((v) => new Date(v)),
    guests: z.coerce.number().int().min(1).max(20),
    zone: z.enum(TableZone).optional(),
    excludeReservationId: z.coerce.number().int().positive().optional(),
  }),
  handler: ({ query }) => getTablesAvailability(query),
});

export default router;
