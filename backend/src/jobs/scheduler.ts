import { prisma } from '../lib/prisma';
import { restaurant } from '../config';
import { now } from '../lib/time';
import { transitionReservation } from '../modules/reservations/reservations.service';

/**
 * Фонові задачі бізнес-процесу (раз на хвилину):
 *  1. PENDING-бронювання, які ніхто не підтвердив до початку → CANCELLED;
 *  2. CONFIRMED, але гість не прийшов протягом noShowGraceMin → NO_SHOW (столик звільняється);
 *  3. CHECKED_IN, що перевищили час на 60 хв і не мають неоплачених замовлень → COMPLETED.
 */
export async function runMaintenance() {
  const t = now();
  const results = { cancelled: 0, noShow: 0, completed: 0 };

  const stalePending = await prisma.reservation.findMany({
    where: { status: 'PENDING', startAt: { lt: t } },
    select: { id: true },
  });
  for (const r of stalePending) {
    await transitionReservation('SYSTEM', r.id, 'CANCELLED', { reason: 'Не підтверджено до початку візиту' }).catch(() => null);
    results.cancelled++;
  }

  const noShows = await prisma.reservation.findMany({
    where: { status: 'CONFIRMED', startAt: { lt: new Date(t.getTime() - restaurant.noShowGraceMin * 60000) } },
    select: { id: true },
  });
  for (const r of noShows) {
    await transitionReservation('SYSTEM', r.id, 'NO_SHOW', { reason: 'Автоматично: гість не прийшов' }).catch(() => null);
    results.noShow++;
  }

  const overdue = await prisma.reservation.findMany({
    where: {
      status: 'CHECKED_IN',
      endAt: { lt: new Date(t.getTime() - 60 * 60000) },
      orders: { none: { status: { notIn: ['PAID', 'CANCELLED'] } } },
    },
    select: { id: true },
  });
  for (const r of overdue) {
    await transitionReservation('SYSTEM', r.id, 'COMPLETED', { reason: 'Автоматичне завершення візиту' }).catch(() => null);
    results.completed++;
  }
  return results;
}

export function startScheduler() {
  const tick = () => runMaintenance().catch((e) => console.error('[scheduler]', e));
  setTimeout(tick, 5_000);
  return setInterval(tick, 60_000);
}
