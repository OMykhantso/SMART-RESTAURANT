import type { ReservationStatus, TableZone } from '@prisma/client';
import { DateTime } from 'luxon';
import { prisma, type Tx } from '../../lib/prisma';
import { restaurant } from '../../config';
import { badRequest, unprocessable } from '../../lib/errors';
import { formatHm, localDay, now, openingWindow, todayLocal, toLocal, TZ } from '../../lib/time';
import {
  computeSlots,
  nearestAlternatives,
  rankTables,
  type BusyInterval,
  type EngineSettings,
  type EngineTable,
  type ScoredTable,
  type Slot,
} from './engine';

/** Статуси, за яких бронювання блокує столик */
export const ACTIVE_RESERVATION_STATUSES: ReservationStatus[] = ['PENDING', 'CONFIRMED', 'CHECKED_IN'];

export const engineSettings = (): EngineSettings => ({
  bufferMin: restaurant.bufferMin,
  minUsefulGapMin: restaurant.durationForParty(2),
});

export async function loadTables(db: Tx = prisma): Promise<EngineTable[]> {
  return db.diningTable.findMany({
    where: { isActive: true },
    select: { id: true, number: true, seats: true, zone: true, shape: true, posX: true, posY: true },
    orderBy: { number: 'asc' },
  });
}

export async function loadBusy(from: Date, to: Date, db: Tx = prisma): Promise<BusyInterval[]> {
  const pad = restaurant.bufferMin * 60000;
  const rows = await db.reservation.findMany({
    where: {
      status: { in: ACTIVE_RESERVATION_STATUSES },
      startAt: { lt: new Date(to.getTime() + pad) },
      endAt: { gt: new Date(from.getTime() - pad) },
    },
    select: { id: true, tableId: true, startAt: true, endAt: true },
  });
  return rows.map((r) => ({ reservationId: r.id, tableId: r.tableId, startAt: r.startAt, endAt: r.endAt }));
}

export function serializeScored(s: ScoredTable | null) {
  if (!s) return null;
  return {
    id: s.table.id,
    number: s.table.number,
    seats: s.table.seats,
    zone: s.table.zone,
    score: s.score,
    reasons: s.reasons,
  };
}

function serializeSlot(slot: Slot) {
  return {
    time: formatHm(slot.startAt),
    startAt: slot.startAt.toISOString(),
    endAt: slot.endAt.toISOString(),
    available: slot.available,
    tablesLeft: slot.tablesLeft,
    load: slot.load,
    inPreferredZone: slot.inPreferredZone,
    bestTable: serializeScored(slot.bestTable),
  };
}

export function assertGuests(guests: number) {
  if (guests < 1 || guests > restaurant.maxPartySize) {
    throw badRequest(`Кількість гостей: від 1 до ${restaurant.maxPartySize}. Для банкетів зателефонуйте нам.`, 'INVALID_GUESTS');
  }
}

function assertDateInRange(day: DateTime) {
  const today = todayLocal();
  if (day < today) throw unprocessable('Не можна бронювати на минулу дату', 'DATE_IN_PAST');
  if (day > today.plus({ days: restaurant.maxAdvanceDays })) {
    throw unprocessable(`Бронювання доступне не більше ніж на ${restaurant.maxAdvanceDays} днів уперед`, 'DATE_TOO_FAR');
  }
}

/** Доступність слотів на день. */
export async function getAvailability(params: {
  date: string;
  guests: number;
  zone?: TableZone;
  durationMin?: number;
  ignoreLeadTime?: boolean;
}) {
  assertGuests(params.guests);
  let day: DateTime;
  try {
    day = localDay(params.date);
  } catch {
    throw badRequest('Некоректна дата (очікується YYYY-MM-DD)', 'INVALID_DATE');
  }
  assertDateInRange(day);

  const { open, close } = openingWindow(day);
  const durationMin = params.durationMin ?? restaurant.durationForParty(params.guests);
  const earliest = new Date(now().getTime() + (params.ignoreLeadTime ? 0 : restaurant.minLeadMin) * 60000);

  const [tables, busy] = await Promise.all([loadTables(), loadBusy(open.toJSDate(), close.toJSDate())]);
  const slots = computeSlots({
    dayOpen: open.toJSDate(),
    dayClose: close.toJSDate(),
    durationMin,
    stepMin: restaurant.slotStepMin,
    earliestStart: earliest,
    guests: params.guests,
    tables,
    busy,
    settings: engineSettings(),
    prefs: { zone: params.zone },
  });

  return {
    date: day.toISODate(),
    timezone: TZ(),
    guests: params.guests,
    durationMin,
    opensAt: formatHm(open),
    closesAt: close.hour === 0 ? '24:00' : formatHm(close),
    isClosedForToday: slots.length === 0,
    availableCount: slots.filter((s) => s.available).length,
    slots: slots.map(serializeSlot),
  };
}

/**
 * Перевіряє коректність часу бронювання відносно годин роботи та правил.
 * Повертає межі робочого дня для подальшого підбору столика.
 */
export function validateReservationWindow(
  startAt: Date,
  durationMin: number,
  opts: { enforceLeadTime: boolean; alignmentMin: number },
) {
  const local = toLocal(startAt);
  if (local.second !== 0 || local.millisecond !== 0 || local.minute % opts.alignmentMin !== 0) {
    throw unprocessable(`Час має бути кратним ${opts.alignmentMin} хв`, 'INVALID_SLOT');
  }
  const day = local.startOf('day');
  assertDateInRange(day);
  const { open, close } = openingWindow(day);
  const endAt = new Date(startAt.getTime() + durationMin * 60000);
  if (local < open || endAt > close.toJSDate()) {
    throw unprocessable(
      `Ресторан працює ${formatHm(open)}–${close.hour === 0 ? '24:00' : formatHm(close)}; візит має вкладатися в години роботи`,
      'OUTSIDE_OPENING_HOURS',
    );
  }
  const minStart = now().getTime() + (opts.enforceLeadTime ? restaurant.minLeadMin : -15) * 60000;
  if (startAt.getTime() < minStart) {
    throw unprocessable(
      opts.enforceLeadTime
        ? `Бронювати можна щонайменше за ${restaurant.minLeadMin} хв до візиту`
        : 'Не можна створити бронювання в минулому',
      'TOO_LATE_TO_BOOK',
    );
  }
  return { endAt, dayOpen: open.toJSDate(), dayClose: close.toJSDate() };
}

/** Стан кожного столика на конкретний час — для вибору столика на плані залу. */
export async function getTablesAvailability(params: {
  startAt: Date;
  guests: number;
  zone?: TableZone;
  durationMin?: number;
  excludeReservationId?: number;
}) {
  assertGuests(params.guests);
  const durationMin = params.durationMin ?? restaurant.durationForParty(params.guests);
  const endAt = new Date(params.startAt.getTime() + durationMin * 60000);
  const day = toLocal(params.startAt).startOf('day');
  const { open, close } = openingWindow(day);
  const [allTables, busy] = await Promise.all([loadTables(), loadBusy(open.toJSDate(), close.toJSDate())]);
  const ranked = rankTables(
    allTables,
    busy,
    params.guests,
    params.startAt,
    endAt,
    open.toJSDate(),
    close.toJSDate(),
    engineSettings(),
    { zone: params.zone },
    params.excludeReservationId,
  );
  const rankMap = new Map(ranked.map((r, i) => [r.table.id, { ...r, rank: i }]));
  return {
    startAt: params.startAt.toISOString(),
    endAt: endAt.toISOString(),
    durationMin,
    recommendedTableId: ranked[0]?.table.id ?? null,
    tables: allTables.map((t) => {
      const r = rankMap.get(t.id);
      const state = r ? 'FREE' : t.seats < params.guests ? 'TOO_SMALL' : 'BUSY';
      return {
        ...t,
        state,
        recommended: ranked[0]?.table.id === t.id,
        score: r?.score ?? null,
        reasons: r?.reasons ?? [],
      };
    }),
  };
}

export async function pickTable(
  db: Tx,
  params: { startAt: Date; endAt: Date; guests: number; zone?: TableZone; dayOpen: Date; dayClose: Date; excludeReservationId?: number },
) {
  const [tables, busy] = await Promise.all([loadTables(db), loadBusy(params.dayOpen, params.dayClose, db)]);
  return rankTables(
    tables,
    busy,
    params.guests,
    params.startAt,
    params.endAt,
    params.dayOpen,
    params.dayClose,
    engineSettings(),
    { zone: params.zone },
    params.excludeReservationId,
  );
}

export async function suggestAlternatives(date: Date, guests: number, zone?: TableZone) {
  const day = toLocal(date).toISODate()!;
  try {
    const availability = await getAvailability({ date: day, guests, zone });
    const slots: Slot[] = availability.slots.map((s) => ({
      startAt: new Date(s.startAt),
      endAt: new Date(s.endAt),
      available: s.available,
      tablesLeft: s.tablesLeft,
      load: s.load,
      bestTable: null,
      inPreferredZone: s.inPreferredZone,
    }));
    return nearestAlternatives(slots, date).map((s) => ({ time: formatHm(s.startAt), startAt: s.startAt.toISOString() }));
  } catch {
    return [];
  }
}
