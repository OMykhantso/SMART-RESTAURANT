import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { ArrowLeft, CreditCard, MessageSquareHeart, Timer, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card, Skeleton } from '@/components/ui/primitives';
import { OrderBadge } from '@/components/domain/StatusBadge';
import { OrderTracker } from '@/components/domain/OrderTracker';
import { PaymentModal } from '@/components/domain/PaymentModal';
import { ReviewModal } from '@/components/domain/ReviewModal';
import { DishImage } from '@/components/domain/DishImage';
import { Timeline } from '@/components/domain/Timeline';
import { api, errorMessage } from '@/lib/api';
import { fmtDateTime, fmtTime, money } from '@/lib/format';
import { ORDER_STATUS, orderPlace } from '@/lib/constants';
import type { Order } from '@/lib/types';

export default function OrderDetails() {
  const { id } = useParams();
  const qc = useQueryClient();
  const [payOpen, setPayOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const { data: o, isLoading } = useQuery({
    queryKey: ['order', Number(id)],
    queryFn: () => api.get<Order>(`/orders/${id}`),
    refetchInterval: 30_000,
  });
  const cancel = useMutation({
    mutationFn: () => api.patch(`/orders/${id}/status`, { status: 'CANCELLED' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order'] });
      toast.success('Замовлення скасовано');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (isLoading || !o) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 pt-32">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const meta = ORDER_STATUS[o.status];

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-32 sm:px-6">
      <Link to="/account" className="inline-flex items-center gap-2 text-sm text-ink-300 hover:text-cream">
        <ArrowLeft className="size-4" /> Мої замовлення
      </Link>

      <Card className="relative mt-6 overflow-hidden p-6 sm:p-8">
        <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-gold-400/10 blur-3xl" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm text-ink-400">
              Замовлення #{o.id} · {orderPlace(o)} · {fmtDateTime(o.createdAt)}
            </div>
            <motion.h1 key={o.status} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-2 font-display text-4xl text-cream">
              {meta.label}
            </motion.h1>
            <p className="mt-1 text-ink-300">{meta.hint}</p>
          </div>
          {o.etaMinutes != null && (
            <div className="glass flex items-center gap-3 rounded-2xl px-5 py-3">
              <Timer className="size-6 text-gold-300" />
              <div>
                <div className="text-3xl font-semibold tabular-nums text-gold-100">~{o.etaMinutes} хв</div>
                <div className="text-xs text-ink-400">прогноз готовності{o.estimatedReadyAt ? ` · ${fmtTime(o.estimatedReadyAt)}` : ''}</div>
              </div>
            </div>
          )}
        </div>
        <div className="mt-10">
          <OrderTracker order={o} />
        </div>
        <div className="mt-8 flex flex-wrap gap-2">
          {o.actions.canPay && (
            <Button variant="gold" size="lg" icon={<CreditCard className="size-5" />} onClick={() => setPayOpen(true)}>
              Оплатити {money(o.total)}
            </Button>
          )}
          {o.actions.canReview && (
            <Button variant="outline" size="lg" icon={<MessageSquareHeart className="size-5" />} onClick={() => setReviewOpen(true)}>
              Залишити відгук
            </Button>
          )}
          {o.actions.canCancel && (
            <Button variant="danger" icon={<XCircle className="size-4" />} loading={cancel.isPending} onClick={() => cancel.mutate()}>
              Скасувати
            </Button>
          )}
          {o.status === 'PAID' && o.hasReview && <span className="self-center text-sm text-gold-200">Дякуємо за відгук ❤️</span>}
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card className="p-6">
          <h3 className="font-display text-xl text-cream">Страви</h3>
          <ul className="mt-4 divide-y divide-white/5">
            {o.items.map((i) => (
              <li key={i.id} className="flex items-center gap-4 py-3">
                <DishImage src={i.imageUrl} alt={i.name} category={i.category.slug} className="size-14 shrink-0" rounded="rounded-2xl" zoom={false} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-cream">
                    {i.quantity} × {i.name}
                  </div>
                  {i.notes && <div className="text-xs italic text-ink-400">«{i.notes}»</div>}
                  <div className="mt-0.5 text-[11px] text-ink-500">
                    {i.status === 'READY' ? '✓ готово' : i.status === 'COOKING' ? '● готується' : '○ у черзі'}
                  </div>
                </div>
                <div className="text-sm text-ink-200">{money(i.lineTotal)}</div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-end justify-between border-t border-white/8 pt-4">
            <span className="text-ink-300">Разом</span>
            <span className="font-display text-3xl text-gold-100">{money(o.total)}</span>
          </div>
          {o.payment && (
            <div className="mt-4 rounded-2xl bg-emerald-400/[0.06] p-4 text-sm ring-1 ring-emerald-400/20">
              <div className="flex justify-between text-emerald-100">
                <span>Оплачено {o.payment.method === 'CARD' ? `карткою ${o.payment.cardBrand} •• ${o.payment.cardLast4}` : 'готівкою'}</span>
                <span>{money(o.payment.amount + o.payment.tip)}</span>
              </div>
              {o.payment.tip > 0 && <div className="mt-1 text-xs text-emerald-200/70">у т.ч. чайові {money(o.payment.tip)}</div>}
            </div>
          )}
        </Card>
        {o.history && (
          <Card className="p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-display text-xl text-cream">Хронологія</h3>
              <OrderBadge status={o.status} />
            </div>
            <Timeline history={o.history} kind="order" />
          </Card>
        )}
      </div>

      <PaymentModal order={o} open={payOpen} onClose={() => setPayOpen(false)} />
      {o.actions.canReview && <ReviewModal order={o} open={reviewOpen} onClose={() => setReviewOpen(false)} />}
    </div>
  );
}
