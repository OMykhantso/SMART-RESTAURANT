import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, CalendarX2, Clock, DoorOpen, MapPin, StickyNote, Users, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card, Skeleton } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { ReservationBadge, OrderBadge } from '@/components/domain/StatusBadge';
import { Timeline } from '@/components/domain/Timeline';
import { api, errorMessage } from '@/lib/api';
import { useMyOrders } from '@/lib/queries';
import { fmtFullDate, guestsLabel, money } from '@/lib/format';
import { RESERVATION_FLOW, ZONES } from '@/lib/constants';
import { cn } from '@/lib/format';
import type { Reservation } from '@/lib/types';

export default function ReservationDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const { data: r, isLoading } = useQuery({ queryKey: ['reservation', Number(id)], queryFn: () => api.get<Reservation>(`/reservations/${id}`) });
  const orders = useMyOrders();
  const visitOrders = (orders.data ?? []).filter((o) => o.reservationId === Number(id));

  const transition = useMutation({
    mutationFn: (status: string) => api.patch<Reservation>(`/reservations/${id}/status`, { status, reason: status === 'CANCELLED' ? 'Скасовано гостем онлайн' : undefined }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['reservation'] });
      qc.invalidateQueries({ queryKey: ['my-reservations'] });
      qc.invalidateQueries({ queryKey: ['current-visit'] });
      setConfirmCancel(false);
      toast.success(res.status === 'COMPLETED' ? 'Дякуємо за візит! Чекаємо на вас знову' : 'Бронювання скасовано');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading || !r) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 pt-32">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  const step = RESERVATION_FLOW.indexOf(r.status);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-32 sm:px-6">
      <Link to="/account" className="inline-flex items-center gap-2 text-sm text-ink-300 hover:text-cream">
        <ArrowLeft className="size-4" /> Мої візити
      </Link>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card className="p-6 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <ReservationBadge status={r.status} />
                <h1 className="mt-4 font-display text-4xl text-cream">{fmtFullDate(r.startAt)}</h1>
                <div className="mt-2 font-mono text-sm tracking-[0.3em] text-gold-300">{r.code}</div>
              </div>
            </div>
            {step >= 0 && (
              <div className="mt-8 grid grid-cols-4 gap-2">
                {['Заявка', 'Підтверджено', 'Check-in', 'Завершено'].map((l, i) => (
                  <div key={l}>
                    <div className={cn('h-1.5 rounded-full transition-colors', i <= step ? 'gold-gradient' : 'bg-white/8')} />
                    <div className={cn('mt-2 text-xs', i <= step ? 'text-gold-100' : 'text-ink-500')}>{l}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <Info icon={<Clock className="size-4" />} label="Час" value={`${r.time} – ${r.endTime}`} />
              <Info icon={<Users className="size-4" />} label="Гості" value={guestsLabel(r.guests)} />
              <Info icon={<MapPin className="size-4" />} label="Столик" value={`№${r.table.number} · ${ZONES[r.table.zone].label}`} />
              {r.notes && <Info icon={<StickyNote className="size-4" />} label="Побажання" value={r.notes} />}
            </div>
            {r.cancelReason && <div className="mt-5 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-200">Причина: {r.cancelReason}</div>}
            <div className="mt-8 flex flex-wrap gap-2">
              {r.status === 'CHECKED_IN' && (
                <Button variant="gold" icon={<UtensilsCrossed className="size-4" />} onClick={() => navigate('/order')}>
                  Замовити страви
                </Button>
              )}
              {r.actions.canComplete && (
                <Button variant="success" icon={<DoorOpen className="size-4" />} loading={transition.isPending} onClick={() => transition.mutate('COMPLETED')}>
                  Завершити візит
                </Button>
              )}
              {r.status === 'CHECKED_IN' && r.unpaidOrdersCount > 0 && (
                <span className="self-center text-xs text-ink-400">Щоб завершити візит, оплатіть замовлення ({r.unpaidOrdersCount})</span>
              )}
              {['PENDING', 'CONFIRMED'].includes(r.status) &&
                (r.actions.canCancel ? (
                  <Button variant="danger" icon={<CalendarX2 className="size-4" />} onClick={() => setConfirmCancel(true)}>
                    Скасувати бронювання
                  </Button>
                ) : (
                  <span className="self-center text-xs text-ink-400">Онлайн-скасування недоступне менш ніж за годину до візиту — зателефонуйте нам.</span>
                ))}
            </div>
          </Card>

          {visitOrders.length > 0 && (
            <Card className="p-6">
              <h3 className="font-display text-xl text-cream">Замовлення візиту</h3>
              <div className="mt-4 divide-y divide-white/5">
                {visitOrders.map((o) => (
                  <Link key={o.id} to={`/account/orders/${o.id}`} className="flex items-center justify-between gap-4 py-3 hover:opacity-80">
                    <div className="min-w-0">
                      <div className="text-sm text-cream">#{o.id}</div>
                      <div className="truncate text-xs text-ink-400">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ')}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-gold-100">{money(o.total)}</span>
                      <OrderBadge status={o.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          )}

          {r.history && r.history.length > 0 && (
            <Card className="p-6">
              <h3 className="mb-5 font-display text-xl text-cream">Історія змін</h3>
              <Timeline history={r.history} kind="reservation" />
            </Card>
          )}
        </div>

        <div className="lg:sticky lg:top-28 lg:self-start">
          <Card className="p-6 text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-300">QR для check-in</div>
            <div className="mx-auto mt-5 w-fit rounded-3xl bg-cream p-5 shadow-[var(--shadow-glow)]">
              <QRCodeSVG value={r.qrPayload ?? r.code} size={200} bgColor="#f5f0e8" fgColor="#0d0d11" />
            </div>
            <p className="mt-5 text-sm leading-relaxed text-ink-300">
              Покажіть код хостес при вході або відскануйте QR на своєму столику в мобільному застосунку.
            </p>
          </Card>
        </div>
      </div>

      <Modal
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        size="sm"
        title="Скасувати бронювання?"
        subtitle="Столик звільниться для інших гостей."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              Ні
            </Button>
            <Button variant="danger" loading={transition.isPending} onClick={() => transition.mutate('CANCELLED')}>
              Так, скасувати
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-300">
          {fmtFullDate(r.startAt)}, {r.time} · столик №{r.table.number}
        </p>
      </Modal>
    </div>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-white/[0.03] p-4">
      <span className="mt-0.5 text-gold-300">{icon}</span>
      <div>
        <div className="text-xs text-ink-400">{label}</div>
        <div className="text-sm text-cream">{value}</div>
      </div>
    </div>
  );
}
