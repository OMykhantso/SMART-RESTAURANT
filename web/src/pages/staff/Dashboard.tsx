import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowRight, Banknote, CalendarCheck2, ChefHat, ClipboardList, Timer, Users, UtensilsCrossed } from 'lucide-react';
import { Card, EmptyState, SectionTitle, Skeleton, Stat } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { FloorPlan, type TableVisual } from '@/components/domain/FloorPlan';
import { OrderCard, ReservationRow, useTick } from '@/components/domain/StaffCards';
import { useLiveTables, useStaffOrders, useStaffReservations, useToday } from '@/lib/staff';
import { useAuth } from '@/lib/auth';
import { isoDay, money } from '@/lib/format';
import type { LiveTable } from '@/lib/types';

export function liveVisual(t: LiveTable): TableVisual {
  const signal = t.signals.readyToServe
    ? <span className="grid size-5 place-items-center rounded-full bg-emerald-400 text-[10px] font-bold text-ink-950">🔔</span>
    : t.signals.newOrders
      ? <span className="grid size-5 place-items-center rounded-full bg-amber-400 text-[10px] font-bold text-ink-950">{t.signals.newOrders}</span>
      : t.signals.awaitingPayment
        ? <span className="grid size-5 place-items-center rounded-full bg-violet-400 text-[10px] font-bold text-ink-950">₴</span>
        : undefined;
  if (t.state === 'OCCUPIED') return { tone: 'occupied', sublabel: `до ${t.current?.untilTime}`, badge: signal };
  if (t.state === 'RESERVED_SOON') return { tone: 'soon', sublabel: t.next?.time };
  if (t.state === 'LATE') return { tone: 'late', sublabel: t.next?.time };
  return { tone: 'free', sublabel: `${t.seats} міс.` };
}

export default function StaffDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const now = useTick();
  const today = useToday();
  const tables = useLiveTables();
  const orders = useStaffOrders({ status: 'NEW,CONFIRMED,PREPARING,READY,SERVED' });
  const reservations = useStaffReservations({ date: isoDay(), status: 'PENDING,CONFIRMED' });

  const attention = useMemo(() => (orders.data ?? []).filter((o) => ['NEW', 'READY', 'SERVED'].includes(o.status)), [orders.data]);
  const upcoming = (reservations.data ?? []).filter((r) => new Date(r.endAt).getTime() > now).slice(0, 6);
  const t = today.data;

  return (
    <div className="space-y-8">
      <SectionTitle eyebrow="Зміна" title={`Добрий день, ${user?.name.split(' ')[0]}`} subtitle="Усе, що відбувається в ресторані просто зараз — оновлюється в реальному часі." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {t ? (
          <>
            <Stat label="Виручка сьогодні" value={money(t.revenue)} icon={<Banknote className="size-4" />} hint={`${t.paymentsCount} оплат · чек ${money(t.avgCheck)}`} />
            <Stat label="Гості в залі" value={t.guestsInHouse} icon={<Users className="size-4" />} hint={`${t.tables.occupied}/${t.tables.total} столиків зайнято`} />
            <Stat label="Бронювання" value={t.reservations.total} icon={<CalendarCheck2 className="size-4" />} hint={t.reservations.pending ? `${t.reservations.pending} очікують підтвердження` : `${t.reservations.expectedGuests} гостей за день`} />
            <Stat label="Активні замовлення" value={t.orders.active} icon={<ChefHat className="size-4" />} hint={t.avgPrepMin ? `сер. приготування ${t.avgPrepMin} хв` : 'кухня готова'} />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36" />)
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-xl text-cream">План залу</h3>
            <Link to="/staff/floor" className="flex items-center gap-1 text-sm text-gold-200 hover:text-gold-100">
              Керувати <ArrowRight className="size-4" />
            </Link>
          </div>
          {tables.data ? <FloorPlan tables={tables.data} visual={liveVisual} onSelect={() => navigate('/staff/floor')} /> : <Skeleton className="aspect-[16/10]" />}
        </Card>
        <Card className="flex flex-col p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-display text-xl text-cream">Потребує уваги</h3>
            <Link to="/staff/orders" className="flex items-center gap-1 text-sm text-gold-200 hover:text-gold-100">
              Усі замовлення <ArrowRight className="size-4" />
            </Link>
          </div>
          {orders.isLoading ? (
            <Skeleton className="h-40" />
          ) : attention.length === 0 ? (
            <EmptyState className="flex-1 py-10" icon={<ClipboardList className="size-6" />} title="Все під контролем" text="Нові, готові та неоплачені замовлення з’являться тут." />
          ) : (
            <div className="grid max-h-[520px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              {attention.map((o) => (
                <OrderCard key={o.id} o={o} now={now} />
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Timer className="size-5 text-gold-300" />
            <h3 className="font-display text-xl text-cream">Найближчі бронювання</h3>
          </div>
          <Button size="sm" variant="glass" onClick={() => navigate('/staff/reservations')} iconRight={<ArrowRight className="size-4" />}>
            Усі бронювання
          </Button>
        </div>
        {reservations.isLoading ? (
          <Skeleton className="h-24" />
        ) : upcoming.length === 0 ? (
          <EmptyState className="py-10" icon={<UtensilsCrossed className="size-6" />} title="Сьогодні більше немає бронювань" />
        ) : (
          <div className="space-y-2">
            {upcoming.map((r) => (
              <ReservationRow key={r.id} r={r} compact />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
