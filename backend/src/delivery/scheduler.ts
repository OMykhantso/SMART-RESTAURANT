import { prisma } from '../lib/prisma';
import { delivery as rules } from '../config';
import { now } from '../lib/time';
import { transitionOrder } from '../modules/orders/orders.service';

/** Фонові задачі служби доставки (раз на хвилину): неоплачені онлайн-замовлення скасовуються. */
export async function runDeliveryMaintenance() {
  const cutoff = new Date(now().getTime() - rules.unpaidTimeoutMin * 60000);
  const unpaid = await prisma.order.findMany({
    where: { type: 'DELIVERY', status: 'NEW', createdAt: { lt: cutoff } },
    select: { id: true },
  });
  let cancelled = 0;
  for (const o of unpaid) {
    await transitionOrder('SYSTEM', o.id, 'CANCELLED', { reason: `Не оплачено протягом ${rules.unpaidTimeoutMin} хв` })
      .then(() => cancelled++)
      .catch(() => null);
  }
  return { cancelled };
}

export function startDeliveryScheduler() {
  const tick = () => runDeliveryMaintenance().catch((e) => console.error('[delivery-scheduler]', e));
  setTimeout(tick, 5_000);
  return setInterval(tick, 60_000);
}
