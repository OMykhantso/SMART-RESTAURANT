import { useEffect, useState } from 'react';
import { Banknote, Bell, Bike, Check, CircleX, Clock, DoorOpen, HandPlatter, LogIn, Phone, StickyNote, UserX } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { OrderBadge, ReservationBadge } from './StatusBadge';
import { ReasonModal } from './StaffModals';
import { useCashPayment, useOrderAction, useReservationAction } from '@/lib/staff';
import { cn, guestsLabel, minutesSince, money } from '@/lib/format';
import { SOURCE_LABEL, ZONES } from '@/lib/constants';
import type { Order, Reservation } from '@/lib/types';

export function useTick(ms = 30_000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function ReservationRow({ r, compact }: { r: Reservation; compact?: boolean }) {
  const action = useReservationAction();
  const [reason, setReason] = useState<'REJECTED' | 'CANCELLED' | null>(null);
  const busy = action.isPending;
  return (
    <div className={cn('glass flex flex-wrap items-center gap-4 rounded-2xl p-4 transition hover:border-white/12', r.status === 'PENDING' && 'ring-1 ring-amber-400/20')}>
      <div className="w-16 text-center">
        <div className="font-display text-2xl tabular-nums text-cream">{r.time}</div>
        <div className="text-[10px] text-ink-500">до {r.endTime}</div>
      </div>
      <div className="min-w-44 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-cream">{r.guestName ?? 'Гість'}</span>
          <ReservationBadge status={r.status} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-400">
          <span>
            №{r.table.number} · {ZONES[r.table.zone].short}
          </span>
          <span>{guestsLabel(r.guests)}</span>
          <span className="font-mono tracking-wider text-gold-300/80">{r.code}</span>
          {!compact && <span>{SOURCE_LABEL[r.source]}</span>}
          {!compact && r.guestPhone && (
            <span className="flex items-center gap-1">
              <Phone className="size-3" /> {r.guestPhone}
            </span>
          )}
        </div>
        {r.notes && (
          <div className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-100/80">
            <StickyNote className="mt-0.5 size-3 shrink-0" /> {r.notes}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {r.actions.canConfirm && (
          <Button size="sm" variant="gold" loading={busy} icon={<Check className="size-4" />} onClick={() => action.mutate({ id: r.id, status: 'CONFIRMED' })}>
            Підтвердити
          </Button>
        )}
        {r.actions.canCheckIn && (
          <Button size="sm" variant="success" loading={busy} icon={<LogIn className="size-4" />} onClick={() => action.mutate({ id: r.id, status: 'CHECKED_IN' })}>
            Check-in
          </Button>
        )}
        {r.status === 'CHECKED_IN' && (
          <Button
            size="sm"
            variant="glass"
            disabled={!r.actions.canComplete}
            title={r.actions.canComplete ? undefined : 'Є неоплачені замовлення'}
            loading={busy}
            icon={<DoorOpen className="size-4" />}
            onClick={() => action.mutate({ id: r.id, status: 'COMPLETED' })}
          >
            Завершити{r.unpaidOrdersCount ? ` (${r.unpaidOrdersCount} неопл.)` : ''}
          </Button>
        )}
        {r.actions.canMarkNoShow && (
          <Button size="sm" variant="ghost" icon={<UserX className="size-4" />} onClick={() => action.mutate({ id: r.id, status: 'NO_SHOW' })}>
            Не прийшов
          </Button>
        )}
        {r.actions.canReject && (
          <Button size="sm" variant="ghost" icon={<CircleX className="size-4" />} onClick={() => setReason('REJECTED')}>
            Відхилити
          </Button>
        )}
        {r.status === 'CONFIRMED' && r.actions.canCancel && (
          <Button size="sm" variant="ghost" icon={<CircleX className="size-4" />} onClick={() => setReason('CANCELLED')}>
            Скасувати
          </Button>
        )}
      </div>
      <ReasonModal
        open={reason !== null}
        onClose={() => setReason(null)}
        title={reason === 'REJECTED' ? 'Відхилити бронювання' : 'Скасувати бронювання'}
        presets={reason === 'REJECTED' ? ['Немає вільних столиків', 'Приватний захід у ресторані', 'Технічні роботи'] : ['Гість зателефонував і скасував', 'Перенесено на інший день']}
        loading={busy}
        onSubmit={(text) => action.mutate({ id: r.id, status: reason!, reason: text }, { onSuccess: () => setReason(null) })}
      />
    </div>
  );
}

export function OrderCard({ o, now }: { o: Order; now: number }) {
  const action = useOrderAction();
  const cash = useCashPayment();
  const [cancelOpen, setCancelOpen] = useState(false);
  const since = o.status === 'NEW' ? o.createdAt : o.status === 'READY' ? o.readyAt : o.status === 'SERVED' ? o.servedAt : o.confirmedAt;
  const age = minutesSince(since, now);
  const late = (o.status === 'NEW' && age >= 3) || (o.status === 'READY' && age >= 4);
  return (
    <div className={cn('rounded-2xl border bg-ink-850/80 p-3.5 transition', late ? 'border-rose-400/40 shadow-[0_0_24px_-8px_rgb(251_113_133/0.6)]' : 'border-white/6')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-baseline gap-2 whitespace-nowrap">
            {o.table ? (
              <span className="font-display text-lg text-cream">№{o.table.number}</span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-sky-400/12 px-2 py-0.5 text-xs font-medium text-sky-200">
                <Bike className="size-3.5" /> Доставка
              </span>
            )}
            <span className="text-xs text-ink-500">#{o.id}</span>
          </div>
          <div className="text-xs text-ink-400">
            {o.user?.name ?? o.createdBy.name}
            {o.delivery && ` · ${o.delivery.zone.name}`}
          </div>
        </div>
        <span className={cn('flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] tabular-nums', late ? 'bg-rose-500/15 text-rose-200' : 'bg-white/5 text-ink-300')}>
          <Clock className="size-3" /> {age} хв
        </span>
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {o.items.map((i) => (
          <li key={i.id} className="flex justify-between gap-2 text-ink-200">
            <span className="truncate">
              <span className="text-gold-200">{i.quantity}×</span> {i.name}
            </span>
            {i.status === 'READY' && o.status === 'PREPARING' && <Check className="size-3.5 shrink-0 text-emerald-300" />}
          </li>
        ))}
      </ul>
      {o.notes && <div className="mt-2 rounded-lg bg-amber-400/10 px-2 py-1 text-xs text-amber-100">{o.notes}</div>}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-gold-100">{money(o.total)}</span>
        {o.status === 'PREPARING' && o.etaMinutes != null && <span className="text-[11px] text-orange-200">готово за ~{o.etaMinutes} хв</span>}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {o.actions.canConfirm && (
          <Button size="xs" variant="gold" loading={action.isPending} icon={<Check className="size-3.5" />} onClick={() => action.mutate({ id: o.id, status: 'CONFIRMED' })}>
            Прийняти
          </Button>
        )}
        {o.actions.canServe && (
          <Button size="xs" variant="success" loading={action.isPending} icon={<HandPlatter className="size-3.5" />} onClick={() => action.mutate({ id: o.id, status: 'SERVED' })}>
            Подано
          </Button>
        )}
        {o.status === 'SERVED' && (
          <Button size="xs" variant="glass" loading={cash.isPending} icon={<Banknote className="size-3.5" />} onClick={() => cash.mutate({ orderId: o.id, tip: 0 })}>
            Оплата готівкою
          </Button>
        )}
        {o.actions.canCancel && (
          <Button size="xs" variant="ghost" onClick={() => setCancelOpen(true)}>
            Скасувати
          </Button>
        )}
        {o.status === 'READY' && !o.delivery && (
          <span className="flex items-center gap-1 text-xs text-emerald-300">
            <Bell className="size-3.5 animate-bounce" /> Забрати з кухні
          </span>
        )}
        {o.status === 'READY' && o.delivery && (
          <span className="flex items-center gap-1 text-xs text-sky-200">
            <Bike className="size-3.5" /> {o.delivery.courier ? `Курʼєр ${o.delivery.courier.name.split(' ')[0]} забере` : 'Чекає курʼєра'}
          </span>
        )}
      </div>
      <ReasonModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`Скасувати замовлення #${o.id}`}
        presets={['Гість передумав', 'Страва закінчилась', 'Помилка введення']}
        loading={action.isPending}
        onSubmit={(reason) => action.mutate({ id: o.id, status: 'CANCELLED', reason }, { onSuccess: () => setCancelOpen(false) })}
      />
    </div>
  );
}

export function MiniOrder({ o }: { o: Order }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-2">
      <div className="min-w-0">
        <div className="text-sm text-cream">
          #{o.id} · {money(o.total)}
        </div>
        <div className="truncate text-xs text-ink-400">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</div>
      </div>
      <OrderBadge status={o.status} />
    </div>
  );
}
