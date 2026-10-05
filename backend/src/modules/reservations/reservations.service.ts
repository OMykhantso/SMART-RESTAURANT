import type { Prisma, Reservation, ReservationSource, ReservationStatus, TableZone } from '@prisma/client';
import { prisma, type Tx } from '../../lib/prisma';
import { restaurant } from '../../config';
import { AppError, conflict, forbidden, notFound, unprocessable } from '../../lib/errors';
import { randomCode, randomToken } from '../../lib/http';
import { emit } from '../../lib/realtime';
import { formatHm, now, openingWindow, toLocal } from '../../lib/time';
import {
  actorsFor,
  assertTransition,
  canTransition,
  RESERVATION_FLOW,
  RESERVATION_LABELS,
} from '../../lib/stateMachine';
import type { AuthUser } from '../../middleware/auth';
import {
  ACTIVE_RESERVATION_STATUSES,
  assertGuests,
  pickTable,
  suggestAlternatives,
  validateReservationWindow,
  loadBusy,
} from '../booking/booking.service';
import { isTableFree } from '../booking/engine';

/** Номер для advisory lock — критична секція створення/зміни бронювань */
const BOOKING_LOCK_KEY = 72_001;

export const reservationInclude = {
  table: { select: { id: true, number: true, seats: true, zone: true } },
  user: { select: { id: true, name: true, email: true, phone: true } },
  orders: { select: { id: true, status: true, total: true } },
} satisfies Prisma.ReservationInclude;

type ReservationFull = Prisma.ReservationGetPayload<{ include: typeof reservationInclude }>;

export function reservationQrPayload(r: Pick<Reservation, 'code' | 'checkinToken'>) {
  return `smartrest://reservation/${r.code}?t=${r.checkinToken}`;
}

export function serializeReservation(r: ReservationFull, viewer?: AuthUser | 'SYSTEM') {
  const isStaff = viewer !== 'SYSTEM' && viewer && (viewer.role === 'STAFF' || viewer.role === 'ADMIN');
  const isOwner = viewer !== 'SYSTEM' && viewer && r.userId === viewer.id;
  const actors = viewer && viewer !== 'SYSTEM' ? actorsFor(viewer, r.userId) : [];
  const nowMs = now().getTime();
  const unpaid = r.orders.filter((o) => o.status !== 'PAID' && o.status !== 'CANCELLED');
  return {
    id: r.id,
    code: r.code,
    status: r.status,
    statusLabel: RESERVATION_LABELS[r.status],
    source: r.source,
    guests: r.guests,
    startAt: r.startAt,
    endAt: r.endAt,
    time: formatHm(r.startAt),
    endTime: formatHm(r.endAt),
    table: r.table,
    guestName: r.user?.name ?? r.guestName,
    guestPhone: isStaff || isOwner ? (r.user?.phone ?? r.guestPhone) : undefined,
    user: isStaff && r.user ? r.user : undefined,
    notes: r.notes,
    cancelReason: r.cancelReason,
    confirmedAt: r.confirmedAt,
    checkedInAt: r.checkedInAt,
    completedAt: r.completedAt,
    cancelledAt: r.cancelledAt,
    createdAt: r.createdAt,
    ordersCount: r.orders.length,
    unpaidOrdersCount: unpaid.length,
    ordersTotal: r.orders.filter((o) => o.status !== 'CANCELLED').reduce((sum, o) => sum + o.total, 0),
    qrPayload: isStaff || isOwner ? reservationQrPayload(r) : undefined,
    actions: {
      canCancel:
        canTransition(RESERVATION_FLOW, r.status, 'CANCELLED', actors) &&
        (isStaff || r.startAt.getTime() - nowMs >= restaurant.clientCancelDeadlineMin * 60000),
      canConfirm: canTransition(RESERVATION_FLOW, r.status, 'CONFIRMED', actors),
      canReject: canTransition(RESERVATION_FLOW, r.status, 'REJECTED', actors),
      canCheckIn:
        canTransition(RESERVATION_FLOW, r.status, 'CHECKED_IN', actors) &&
        nowMs >= r.startAt.getTime() - restaurant.checkInEarlyMin * 60000 &&
        nowMs < r.endAt.getTime(),
      canComplete: canTransition(RESERVATION_FLOW, r.status, 'COMPLETED', actors) && unpaid.length === 0,
      canMarkNoShow:
        canTransition(RESERVATION_FLOW, r.status, 'NO_SHOW', actors) &&
        nowMs >= r.startAt.getTime() + restaurant.noShowGraceMin * 60000,
      canOrder: r.status === 'CHECKED_IN' && (isOwner || Boolean(isStaff)),
    },
  };
}

async function lockBooking(tx: Tx) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(${BOOKING_LOCK_KEY})`;
}

export async function logStatus(
  db: Tx,
  target: { reservationId?: number; orderId?: number },
  from: string | null,
  to: string,
  actorId: number | null,
  note?: string,
) {
  await db.statusChange.create({
    // час — з годинника застосунку (той самий, що в бізнес-правилах), а не з БД
    data: { ...target, fromStatus: from, toStatus: to, actorId, note: note?.slice(0, 255), createdAt: now() },
  });
}

function broadcast(r: ReservationFull, event: 'reservation:created' | 'reservation:updated') {
  const payload = { id: r.id, code: r.code, status: r.status, tableId: r.tableId, userId: r.userId };
  emit(event, payload, { userId: r.userId, staff: true });
  emit('tables:changed', { tableId: r.tableId }, { staff: true });
}

// ─────────────────────────────── Створення ───────────────────────────────

export interface CreateReservationInput {
  startAt: Date;
  guests: number;
  tableId?: number;
  zone?: TableZone;
  notes?: string;
  guestName?: string;
  guestPhone?: string;
  source?: ReservationSource;
}

export async function createReservation(actor: AuthUser, input: CreateReservationInput) {
  assertGuests(input.guests);
  const isStaff = actor.role === 'STAFF' || actor.role === 'ADMIN';
  if (!isStaff && actor.role !== 'CLIENT') throw forbidden('Ця роль не може створювати бронювання');
  if (isStaff && !input.guestName) {
    throw unprocessable("Вкажіть ім'я гостя для бронювання", 'GUEST_NAME_REQUIRED');
  }

  const durationMin = restaurant.durationForParty(input.guests);
  const { endAt, dayOpen, dayClose } = validateReservationWindow(input.startAt, durationMin, {
    enforceLeadTime: !isStaff,
    alignmentMin: isStaff ? 15 : restaurant.slotStepMin,
  });

  const created = await prisma.$transaction(async (tx) => {
    await lockBooking(tx);

    if (!isStaff) {
      const activeCount = await tx.reservation.count({
        where: { userId: actor.id, status: { in: ['PENDING', 'CONFIRMED'] }, startAt: { gt: now() } },
      });
      if (activeCount >= restaurant.maxActiveReservationsPerClient) {
        throw conflict(
          `Можна мати не більше ${restaurant.maxActiveReservationsPerClient} активних бронювань одночасно`,
          'TOO_MANY_RESERVATIONS',
        );
      }
      const ownOverlap = await tx.reservation.findFirst({
        where: {
          userId: actor.id,
          status: { in: ACTIVE_RESERVATION_STATUSES },
          startAt: { lt: endAt },
          endAt: { gt: input.startAt },
        },
      });
      if (ownOverlap) {
        throw conflict(`У вас вже є бронювання на цей час (${ownOverlap.code})`, 'OVERLAPPING_OWN_RESERVATION');
      }
    }

    let tableId: number;
    if (input.tableId) {
      const table = await tx.diningTable.findUnique({ where: { id: input.tableId } });
      if (!table || !table.isActive) throw notFound('Столик не знайдено');
      if (table.seats < input.guests) {
        throw unprocessable(`Столик №${table.number} розрахований на ${table.seats} гостей`, 'TABLE_TOO_SMALL');
      }
      const busy = await loadBusy(dayOpen, dayClose, tx);
      if (!isTableFree(busy, table.id, input.startAt, endAt, restaurant.bufferMin)) {
        throw conflict(`Столик №${table.number} вже зайнятий на цей час`, 'TABLE_ALREADY_BOOKED', {
          alternatives: await suggestAlternatives(input.startAt, input.guests, input.zone),
        });
      }
      tableId = table.id;
    } else {
      const ranked = await pickTable(tx, {
        startAt: input.startAt,
        endAt,
        guests: input.guests,
        zone: input.zone,
        dayOpen,
        dayClose,
      });
      if (ranked.length === 0) {
        throw conflict('На жаль, на цей час вільних столиків немає', 'NO_TABLES_AVAILABLE', {
          alternatives: await suggestAlternatives(input.startAt, input.guests, input.zone),
        });
      }
      tableId = ranked[0].table.id;
    }

    const status: ReservationStatus = isStaff ? 'CONFIRMED' : 'PENDING';
    const reservation = await tx.reservation.create({
      data: {
        createdAt: now(),
        code: `R-${randomCode(6)}`,
        checkinToken: randomToken(18),
        userId: isStaff ? null : actor.id,
        createdById: actor.id,
        tableId,
        guests: input.guests,
        startAt: input.startAt,
        endAt,
        status,
        source: input.source ?? (isStaff ? 'STAFF' : 'APP'),
        guestName: isStaff ? input.guestName : null,
        guestPhone: isStaff ? input.guestPhone : null,
        notes: input.notes,
        confirmedAt: isStaff ? now() : null,
      },
      include: reservationInclude,
    });
    await logStatus(tx, { reservationId: reservation.id }, null, status, actor.id);
    return reservation;
  });

  broadcast(created, 'reservation:created');
  return serializeReservation(created, actor);
}

// ─────────────────────────────── Переходи станів ───────────────────────────────

async function loadReservation(id: number, db: Tx = prisma) {
  const r = await db.reservation.findUnique({ where: { id }, include: reservationInclude });
  if (!r) throw notFound('Бронювання не знайдено');
  return r;
}

export async function getReservation(actor: AuthUser, id: number) {
  const r = await loadReservation(id);
  const isStaff = actor.role === 'STAFF' || actor.role === 'ADMIN';
  if (!isStaff && r.userId !== actor.id) throw forbidden('Це не ваше бронювання');
  const history = await prisma.statusChange.findMany({
    where: { reservationId: id },
    orderBy: { createdAt: 'asc' },
    include: { actor: { select: { name: true, role: true } } },
  });
  return {
    ...serializeReservation(r, actor),
    history: history.map((h) => ({
      from: h.fromStatus,
      to: h.toStatus,
      at: h.createdAt,
      note: h.note,
      actor: h.actor ? { name: h.actor.name, role: h.actor.role } : { name: 'Система', role: 'SYSTEM' },
    })),
  };
}

export async function transitionReservation(
  actor: AuthUser | 'SYSTEM',
  id: number,
  to: ReservationStatus,
  opts: { reason?: string; tableQrToken?: string } = {},
) {
  const updated = await prisma.$transaction(async (tx) => {
    await lockBooking(tx);
    const r = await loadReservation(id, tx);
    const actors = actorsFor(actor, r.userId);
    assertTransition(RESERVATION_FLOW, RESERVATION_LABELS, r.status, to, actors);

    const t = now();
    const isStaff = actors.includes('STAFF') || actors.includes('ADMIN');
    const data: Prisma.ReservationUpdateInput = { status: to };

    switch (to) {
      case 'CONFIRMED':
        data.confirmedAt = t;
        break;
      case 'REJECTED':
        data.cancelReason = opts.reason ?? 'Відхилено рестораном';
        data.cancelledAt = t;
        break;
      case 'CANCELLED':
        if (!isStaff && actor !== 'SYSTEM') {
          const minutesLeft = (r.startAt.getTime() - t.getTime()) / 60000;
          if (minutesLeft < restaurant.clientCancelDeadlineMin) {
            throw conflict(
              `Онлайн-скасування можливе не пізніше ніж за ${restaurant.clientCancelDeadlineMin} хв до візиту. Зателефонуйте, будь ласка, в ресторан.`,
              'CANCEL_DEADLINE_PASSED',
            );
          }
        }
        data.cancelReason = opts.reason ?? (actor === 'SYSTEM' ? 'Не підтверджено вчасно' : null);
        data.cancelledAt = t;
        break;
      case 'CHECKED_IN': {
        const earliest = r.startAt.getTime() - restaurant.checkInEarlyMin * 60000;
        if (t.getTime() < earliest) {
          throw conflict(`Check-in буде доступний з ${formatHm(new Date(earliest))}`, 'CHECKIN_TOO_EARLY');
        }
        if (t.getTime() >= r.endAt.getTime()) throw conflict('Час бронювання вже минув', 'CHECKIN_TOO_LATE');
        if (!isStaff && opts.tableQrToken === undefined) {
          // клієнт підтверджує фізичну присутність лише скануванням QR-коду на столику
          throw forbidden('Для check-in відскануйте QR-код на вашому столику');
        }
        if (opts.tableQrToken !== undefined) {
          const table = await tx.diningTable.findUnique({ where: { qrToken: opts.tableQrToken } });
          if (!table) throw notFound('Невідомий QR-код столика', 'INVALID_TABLE_QR');
          if (table.id !== r.tableId) {
            throw conflict(`Ваш столик — №${r.table.number}. Ви відсканували QR столика №${table.number}.`, 'WRONG_TABLE');
          }
        }
        const occupied = await tx.reservation.findFirst({
          where: { tableId: r.tableId, status: 'CHECKED_IN', id: { not: r.id } },
        });
        if (occupied) {
          throw conflict('За цим столиком ще сидять попередні гості — зверніться до хостес', 'TABLE_STILL_OCCUPIED');
        }
        if (t < r.startAt) {
          // Гість прийшов раніше: садимо лише якщо до його бронювання столик ніхто не займає,
          // і зсуваємо початок візиту, щоб розклад столика відповідав реальності.
          const before = await tx.reservation.findFirst({
            where: {
              tableId: r.tableId,
              id: { not: r.id },
              status: { in: ACTIVE_RESERVATION_STATUSES },
              startAt: { lt: r.startAt },
              endAt: { gt: new Date(t.getTime() - restaurant.bufferMin * 60000) },
            },
          });
          if (before) {
            throw conflict(
              `Столик №${r.table.number} ще заброньований до ${formatHm(before.endAt)} — зачекайте, будь ласка`,
              'TABLE_NOT_READY',
            );
          }
          data.startAt = new Date(Math.floor(t.getTime() / 60000) * 60000);
        }
        data.checkedInAt = t;
        if (!r.confirmedAt) data.confirmedAt = t;
        break;
      }
      case 'COMPLETED': {
        const unpaid = r.orders.filter((o) => o.status !== 'PAID' && o.status !== 'CANCELLED');
        if (unpaid.length > 0) {
          throw conflict(
            `Не можна завершити візит: ${unpaid.length} замовлення(нь) ще не оплачено`,
            'UNPAID_ORDERS',
            { orderIds: unpaid.map((o) => o.id) },
          );
        }
        data.completedAt = t;
        break;
      }
      case 'NO_SHOW':
        if (t.getTime() < r.startAt.getTime() + restaurant.noShowGraceMin * 60000) {
          throw conflict(`Позначити «не прийшов» можна через ${restaurant.noShowGraceMin} хв після початку`, 'TOO_EARLY_FOR_NO_SHOW');
        }
        break;
    }

    const result = await tx.reservation.update({ where: { id }, data, include: reservationInclude });
    await logStatus(tx, { reservationId: id }, r.status, to, actor === 'SYSTEM' ? null : actor.id, opts.reason);
    return result;
  });

  broadcast(updated, 'reservation:updated');
  return serializeReservation(updated, actor);
}

/** Check-in працівником за QR-кодом бронювання (або кодом, продиктованим гостем). */
export async function checkInByCode(actor: AuthUser, code: string, token?: string) {
  const r = await prisma.reservation.findUnique({ where: { code: code.toUpperCase() } });
  if (!r) throw notFound(`Бронювання ${code} не знайдено`, 'RESERVATION_NOT_FOUND');
  if (token !== undefined && token !== r.checkinToken) {
    throw new AppError(400, 'INVALID_QR', 'QR-код недійсний або підроблений');
  }
  if (r.status === 'CHECKED_IN') throw conflict('Гість вже зареєстрований (check-in виконано)', 'ALREADY_CHECKED_IN');
  return transitionReservation(actor, r.id, 'CHECKED_IN');
}

/** Парсинг QR-рядка бронювання: smartrest://reservation/R-XXXXXX?t=token */
export function parseReservationQr(payload: string): { code: string; token?: string } | null {
  const m = payload.trim().match(/^smartrest:\/\/reservation\/(R-[A-Z0-9]{6})(?:\?t=([\w-]+))?$/i);
  if (m) return { code: m[1].toUpperCase(), token: m[2] };
  const plain = payload.trim().match(/^(R-[A-Z0-9]{6})$/i);
  return plain ? { code: plain[1].toUpperCase() } : null;
}

export function parseTableQr(payload: string): string | null {
  const m = payload.trim().match(/^smartrest:\/\/table\/([\w-]+)$/);
  return m ? m[1] : null;
}

// ─────────────────────────────── QR столика (клієнт) ───────────────────────────────

/**
 * Клієнт сканує QR на столику:
 *  - є підтверджене бронювання саме на цей столик → автоматичний check-in;
 *  - гість вже за цим столиком → повертаємо поточний візит;
 *  - бронювання немає → пропонуємо walk-in (якщо столик вільний).
 */
export async function scanTable(actor: AuthUser, qrToken: string) {
  const table = await prisma.diningTable.findUnique({ where: { qrToken } });
  if (!table || !table.isActive) throw notFound('Невідомий або неактивний QR-код столика', 'INVALID_TABLE_QR');
  const t = now();

  const current = await prisma.reservation.findFirst({
    where: { userId: actor.id, status: 'CHECKED_IN' },
    include: reservationInclude,
  });
  if (current) {
    if (current.tableId === table.id) {
      return { action: 'ALREADY_CHECKED_IN' as const, table: tableBrief(table), reservation: serializeReservation(current, actor) };
    }
    throw conflict(`Ви вже за столиком №${current.table.number}. Завершіть поточний візит.`, 'ALREADY_SEATED');
  }

  const windowStart = new Date(t.getTime() + restaurant.checkInEarlyMin * 60000);
  const upcoming = await prisma.reservation.findFirst({
    where: {
      userId: actor.id,
      status: { in: ['PENDING', 'CONFIRMED'] },
      startAt: { lte: windowStart },
      endAt: { gt: t },
    },
    include: reservationInclude,
    orderBy: { startAt: 'asc' },
  });
  if (upcoming) {
    if (upcoming.tableId !== table.id) {
      throw conflict(`Ваш столик — №${upcoming.table.number}. Ви відсканували QR столика №${table.number}.`, 'WRONG_TABLE');
    }
    if (upcoming.status === 'PENDING') {
      throw conflict('Бронювання ще не підтверджене — зверніться, будь ласка, до хостес', 'NOT_CONFIRMED');
    }
    const reservation = await transitionReservation(actor, upcoming.id, 'CHECKED_IN', { tableQrToken: qrToken });
    return { action: 'CHECKED_IN' as const, table: tableBrief(table), reservation };
  }

  const offer = await walkInWindow(table.id, t);
  return {
    action: offer.available ? ('WALK_IN_AVAILABLE' as const) : ('TABLE_UNAVAILABLE' as const),
    table: tableBrief(table),
    walkIn: offer,
  };
}

function tableBrief(t: { id: number; number: number; seats: number; zone: TableZone }) {
  return { id: t.id, number: t.number, seats: t.seats, zone: t.zone };
}

/** Наскільки довго столик вільний «прямо зараз» для гостя без бронювання. */
export async function walkInWindow(tableId: number, t: Date, db: Tx = prisma) {
  const day = toLocal(t).startOf('day');
  const { open, close } = openingWindow(day);
  if (t < open.toJSDate() || t.getTime() > close.toJSDate().getTime() - restaurant.minWalkInMin * 60000) {
    return { available: false, reason: 'Ресторан зараз не приймає гостей (поза годинами роботи)', untilAt: null, maxDurationMin: 0 };
  }
  const seated = await db.reservation.findFirst({ where: { tableId, status: 'CHECKED_IN' } });
  if (seated) return { available: false, reason: 'Столик зайнятий іншими гостями', untilAt: null, maxDurationMin: 0 };

  const next = await db.reservation.findFirst({
    where: { tableId, status: { in: ['PENDING', 'CONFIRMED'] }, endAt: { gt: t } },
    orderBy: { startAt: 'asc' },
  });
  let limit = close.toJSDate().getTime();
  if (next) {
    limit = Math.min(limit, next.startAt.getTime() - restaurant.bufferMin * 60000);
  }
  const maxDurationMin = Math.floor((limit - t.getTime()) / 60000);
  if (maxDurationMin < restaurant.minWalkInMin) {
    return {
      available: false,
      reason: next ? `Столик заброньовано з ${formatHm(next.startAt)}` : 'Ресторан скоро зачиняється',
      untilAt: null,
      maxDurationMin: 0,
    };
  }
  return {
    available: true,
    reason: next ? `Столик вільний до ${formatHm(new Date(limit))} (далі — бронювання)` : null,
    untilAt: new Date(limit).toISOString(),
    maxDurationMin,
  };
}

/** Walk-in: гість без бронювання сідає за вільний столик (через QR або хостес). */
export async function createWalkIn(
  actor: AuthUser,
  input: { qrToken?: string; tableId?: number; guests: number; guestName?: string },
) {
  assertGuests(input.guests);
  const isStaff = actor.role === 'STAFF' || actor.role === 'ADMIN';
  if (!isStaff && actor.role !== 'CLIENT') throw forbidden();

  const created = await prisma.$transaction(async (tx) => {
    await lockBooking(tx);
    const table = input.qrToken
      ? await tx.diningTable.findUnique({ where: { qrToken: input.qrToken } })
      : input.tableId
        ? await tx.diningTable.findUnique({ where: { id: input.tableId } })
        : null;
    if (!table || !table.isActive) throw notFound('Столик не знайдено', 'INVALID_TABLE_QR');
    if (table.seats < input.guests) {
      throw unprocessable(`Столик №${table.number} розрахований на ${table.seats} гостей`, 'TABLE_TOO_SMALL');
    }
    if (!isStaff) {
      const seated = await tx.reservation.findFirst({ where: { userId: actor.id, status: 'CHECKED_IN' } });
      if (seated) throw conflict('У вас вже є активний візит', 'ALREADY_SEATED');
    }
    const t = now();
    const offer = await walkInWindow(table.id, t, tx);
    if (!offer.available) throw conflict(offer.reason ?? 'Столик недоступний', 'TABLE_UNAVAILABLE');

    const startAt = new Date(Math.floor(t.getTime() / 60000) * 60000);
    const desired = restaurant.durationForParty(input.guests);
    const endAt = new Date(startAt.getTime() + Math.min(desired, offer.maxDurationMin) * 60000);

    const r = await tx.reservation.create({
      data: {
        createdAt: now(),
        code: `R-${randomCode(6)}`,
        checkinToken: randomToken(18),
        userId: isStaff ? null : actor.id,
        createdById: actor.id,
        tableId: table.id,
        guests: input.guests,
        startAt,
        endAt,
        status: 'CHECKED_IN',
        source: 'WALK_IN',
        guestName: isStaff ? (input.guestName ?? 'Гість без бронювання') : null,
        confirmedAt: t,
        checkedInAt: t,
      },
      include: reservationInclude,
    });
    await logStatus(tx, { reservationId: r.id }, null, 'CHECKED_IN', actor.id, 'Walk-in');
    return r;
  });

  broadcast(created, 'reservation:created');
  return serializeReservation(created, actor);
}

/** Працівник змінює столик / кількість гостей / нотатки (з перевіркою доступності). */
export async function updateReservation(
  actor: AuthUser,
  id: number,
  input: { tableId?: number; guests?: number; notes?: string | null },
) {
  const updated = await prisma.$transaction(async (tx) => {
    await lockBooking(tx);
    const r = await loadReservation(id, tx);
    if (!ACTIVE_RESERVATION_STATUSES.includes(r.status)) {
      throw conflict('Змінювати можна лише активні бронювання', 'RESERVATION_NOT_ACTIVE');
    }
    const guests = input.guests ?? r.guests;
    assertGuests(guests);
    const tableId = input.tableId ?? r.tableId;
    if (input.tableId !== undefined || input.guests !== undefined) {
      const table = await tx.diningTable.findUnique({ where: { id: tableId } });
      if (!table || !table.isActive) throw notFound('Столик не знайдено');
      if (table.seats < guests) {
        throw unprocessable(`Столик №${table.number} розрахований на ${table.seats} гостей`, 'TABLE_TOO_SMALL');
      }
      const busy = await loadBusy(r.startAt, r.endAt, tx);
      if (!isTableFree(busy, tableId, r.startAt, r.endAt, restaurant.bufferMin, r.id)) {
        throw conflict(`Столик №${table.number} зайнятий на цей час`, 'TABLE_ALREADY_BOOKED');
      }
    }
    const result = await tx.reservation.update({
      where: { id },
      data: { tableId, guests, ...(input.notes !== undefined ? { notes: input.notes } : {}) },
      include: reservationInclude,
    });
    if (tableId !== r.tableId) {
      // замовлення візиту «переїжджають» разом з гостями
      await tx.order.updateMany({ where: { reservationId: id }, data: { tableId } });
      await logStatus(tx, { reservationId: id }, r.status, r.status, actor.id, `Пересаджено: №${r.table.number} → №${result.table.number}`);
    }
    return result;
  });
  broadcast(updated, 'reservation:updated');
  emit('tables:changed', { tableId: updated.tableId }, { staff: true });
  return serializeReservation(updated, actor);
}
