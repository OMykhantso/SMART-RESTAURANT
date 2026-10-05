import { motion } from 'motion/react';
import { Bell, Bike, Check, ChefHat, ClipboardCheck, CreditCard, HandPlatter, House, Send } from 'lucide-react';
import { DELIVERY_FLOW, ORDER_FLOW, ORDER_STATUS } from '@/lib/constants';
import { cn, fmtTime } from '@/lib/format';
import type { Order } from '@/lib/types';

const ICONS = {
  NEW: <Send className="size-4" />,
  CONFIRMED: <ClipboardCheck className="size-4" />,
  PREPARING: <ChefHat className="size-4" />,
  READY: <Bell className="size-4" />,
  SERVED: <HandPlatter className="size-4" />,
  PAID: <CreditCard className="size-4" />,
  DELIVERING: <Bike className="size-4" />,
  DELIVERED: <House className="size-4" />,
} as const;

/** Візуальний трекер статусу замовлення (горизонтальний на desktop, вертикальний на mobile). */
export function OrderTracker({ order }: { order: Order }) {
  if (order.status === 'CANCELLED') {
    return <div className="rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-200 ring-1 ring-rose-400/20">Замовлення скасовано{order.cancelReason ? `: ${order.cancelReason}` : ''}</div>;
  }
  const flow = order.type === 'DELIVERY' ? DELIVERY_FLOW : ORDER_FLOW;
  const current = flow.indexOf(order.status);
  const times: Record<string, string | null> = {
    NEW: order.createdAt,
    CONFIRMED: order.confirmedAt,
    PREPARING: order.preparingAt,
    READY: order.readyAt,
    SERVED: order.servedAt,
    PAID: order.paidAt,
    DELIVERING: order.delivery?.pickedUpAt ?? null,
    DELIVERED: order.delivery?.deliveredAt ?? null,
  };
  return (
    <div className="relative">
      <div className="absolute left-5 right-5 top-5 hidden h-0.5 rounded-full bg-white/8 sm:block">
        <motion.div className="gold-gradient h-full rounded-full" initial={{ width: 0 }} animate={{ width: `${(Math.max(0, current) / (flow.length - 1)) * 100}%` }} transition={{ type: 'spring', stiffness: 80, damping: 20 }} />
      </div>
      <ol className="relative grid gap-4 sm:grid-cols-6 sm:gap-2">
        {flow.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s} className="flex items-center gap-3 sm:flex-col sm:text-center">
              <span
                className={cn(
                  'relative grid size-10 shrink-0 place-items-center rounded-full border transition-all duration-500',
                  done && 'gold-gradient border-transparent text-ink-950',
                  active && 'border-gold-300 bg-ink-900 text-gold-200 shadow-[0_0_30px_-4px_rgb(220_171_74/0.8)]',
                  !done && !active && 'border-white/10 bg-ink-900 text-ink-500',
                )}
              >
                {active && <span className="absolute inset-0 animate-pulse-ring rounded-full border border-gold-300/60" />}
                {done ? <Check className="size-4" /> : ICONS[s as keyof typeof ICONS]}
              </span>
              <span>
                <span className={cn('block text-sm', active ? 'font-semibold text-gold-100' : done ? 'text-cream' : 'text-ink-500')}>{ORDER_STATUS[s].label}</span>
                <span className="block text-[11px] tabular-nums text-ink-400">{times[s] ? fmtTime(times[s]!) : '—'}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
