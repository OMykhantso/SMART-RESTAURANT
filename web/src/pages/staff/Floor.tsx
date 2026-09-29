import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarClock, DoorOpen, LogIn, MousePointerClick, Plus, UserPlus } from 'lucide-react';
import { Card, EmptyState, SectionTitle, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { FloorPlan, LegendDot } from '@/components/domain/FloorPlan';
import { MiniOrder } from '@/components/domain/StaffCards';
import { NewOrderModal, WalkInModal } from '@/components/domain/StaffModals';
import { useLiveTables, useReservationAction, useStaffOrders } from '@/lib/staff';
import { fmtTime, guestsLabel, money } from '@/lib/format';
import { ZONES } from '@/lib/constants';
import { liveVisual } from './Dashboard';

export default function Floor() {
  const tables = useLiveTables();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [walkIn, setWalkIn] = useState(false);
  const [pos, setPos] = useState(false);
  const selected = tables.data?.find((t) => t.id === selectedId) ?? null;
  const orders = useStaffOrders({ reservationId: selected?.current?.reservationId }, Boolean(selected?.current));
  const action = useReservationAction();
  const counts = {
    free: tables.data?.filter((t) => t.state === 'FREE').length ?? 0,
    occupied: tables.data?.filter((t) => t.state === 'OCCUPIED').length ?? 0,
    soon: tables.data?.filter((t) => t.state === 'RESERVED_SOON' || t.state === 'LATE').length ?? 0,
  };

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Live"
        title="План залу"
        subtitle={`Вільно ${counts.free} · зайнято ${counts.occupied} · найближчим часом бронь ${counts.soon}`}
        action={
          <Button variant="gold" icon={<Plus className="size-4" />} onClick={() => setPos(true)}>
            Нове замовлення
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Card className="p-4 sm:p-5">
          {tables.data ? (
            <FloorPlan
              tables={tables.data}
              visual={(t) => {
                const v = liveVisual(t);
                return t.id === selectedId ? { ...v, tone: 'selected' } : v;
              }}
              onSelect={(t) => setSelectedId(t.id)}
              legend={
                <>
                  <LegendDot className="border-white/30 bg-ink-800">Вільний</LegendDot>
                  <LegendDot className="border-gold-300/60 bg-gold-500/40">Гості за столом</LegendDot>
                  <LegendDot className="border-sky-300/50 bg-sky-400/20">Бронь протягом години</LegendDot>
                  <LegendDot className="border-rose-300/60 bg-rose-500/20">Гості запізнюються</LegendDot>
                  <span className="text-ink-500">🔔 — страви готові · ₴ — очікує оплати</span>
                </>
              }
            />
          ) : (
            <Skeleton className="aspect-[16/10]" />
          )}
        </Card>

        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div key={selected.id} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
              <Card className="space-y-5 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-ink-400">
                      {ZONES[selected.zone].label} · {selected.seats} місць
                    </div>
                    <h3 className="mt-1 font-display text-3xl text-cream">Столик №{selected.number}</h3>
                  </div>
                </div>

                {selected.current ? (
                  <div className="rounded-2xl border border-gold-400/25 bg-gold-400/[0.06] p-4">
                    <div className="text-sm font-medium text-cream">{selected.current.guestName ?? 'Гість'}</div>
                    <div className="mt-1 text-xs text-ink-300">
                      {guestsLabel(selected.current.guests)} · з {fmtTime(selected.current.since)} до {selected.current.untilTime}
                    </div>
                    <div className="mt-3 flex items-end justify-between">
                      <span className="text-xs text-ink-400">Рахунок столу</span>
                      <span className="font-display text-2xl text-gold-100">{money(selected.current.ordersTotal)}</span>
                    </div>
                    <div className="mt-4 space-y-2">{orders.data?.map((o) => <MiniOrder key={o.id} o={o} />)}</div>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <Button size="sm" variant="gold" icon={<Plus className="size-4" />} onClick={() => setPos(true)}>
                        Замовлення
                      </Button>
                      <Button
                        size="sm"
                        variant="glass"
                        disabled={selected.current.activeOrders > 0}
                        title={selected.current.activeOrders > 0 ? 'Є неоплачені замовлення' : undefined}
                        loading={action.isPending}
                        icon={<DoorOpen className="size-4" />}
                        onClick={() => action.mutate({ id: selected.current!.reservationId, status: 'COMPLETED' })}
                      >
                        Звільнити
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
                    <div className="text-sm text-ink-200">Столик вільний</div>
                    <Button size="sm" variant="gold" className="mt-3 w-full" icon={<UserPlus className="size-4" />} onClick={() => setWalkIn(true)}>
                      Посадити гостей без бронювання
                    </Button>
                  </div>
                )}

                {selected.next && (
                  <div className="rounded-2xl border border-sky-400/20 bg-sky-400/[0.05] p-4">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-sky-200">
                      <CalendarClock className="size-3.5" /> Наступне бронювання
                    </div>
                    <div className="mt-2 text-sm text-cream">
                      {selected.next.time} · {selected.next.guestName ?? 'Гість'} · {guestsLabel(selected.next.guests)}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-400">
                      {selected.next.code} · {selected.next.minutesToStart >= 0 ? `через ${selected.next.minutesToStart} хв` : `запізнюється на ${-selected.next.minutesToStart} хв`}
                    </div>
                    {!selected.current && selected.next.minutesToStart <= 60 && (
                      <Button size="sm" variant="success" className="mt-3 w-full" loading={action.isPending} icon={<LogIn className="size-4" />} onClick={() => action.mutate({ id: selected.next!.reservationId, status: 'CHECKED_IN' })}>
                        Гості прийшли — check-in
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <EmptyState icon={<MousePointerClick className="size-7" />} title="Оберіть столик" text="Натисніть на столик на плані, щоб побачити гостей, замовлення та швидкі дії." />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <WalkInModal open={walkIn} onClose={() => setWalkIn(false)} table={selected} />
      <NewOrderModal open={pos} onClose={() => setPos(false)} tableId={selected?.state === 'OCCUPIED' ? selected.id : null} tables={tables.data ?? []} />
    </div>
  );
}
