import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Minus, Plus, QrCode, Sparkles, Trash2, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { EmptyState, Textarea } from '@/components/ui/primitives';
import { DishImage } from './DishImage';
import { useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import { useCurrentVisit, useRecommendations } from '@/lib/queries';
import { api, errorMessage } from '@/lib/api';
import { money } from '@/lib/format';
import type { Order } from '@/lib/types';

export function CartDrawer() {
  const cart = useCart();
  const { user } = useAuth();
  const visit = useCurrentVisit();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [notes, setNotes] = useState('');
  const active = visit.data?.active;
  const recs = useRecommendations(
    cart.lines.map((l) => l.dishId),
    4,
  );

  const place = useMutation({
    mutationFn: () =>
      api.post<Order>('/orders', {
        reservationId: active?.id,
        notes: notes || undefined,
        items: cart.lines.map((l) => ({ dishId: l.dishId, quantity: l.quantity, notes: l.notes || undefined })),
      }),
    onSuccess: (order) => {
      cart.clear();
      cart.setOpen(false);
      setNotes('');
      qc.invalidateQueries({ queryKey: ['my-orders'] });
      toast.success(`Замовлення #${order.id} надіслано!`, { description: 'Офіціант підтвердить його за хвилину' });
      navigate(`/account/orders/${order.id}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal open={cart.open} onClose={() => cart.setOpen(false)} side title="Ваше замовлення" subtitle={active ? `Столик №${active.table.number} · ${active.code}` : 'Кошик'}>
      {cart.lines.length === 0 ? (
        <EmptyState icon={<UtensilsCrossed className="size-7" />} title="Кошик порожній" text="Додайте страви з меню — ми підкажемо, що до них пасує." />
      ) : (
        <div className="space-y-5">
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {cart.lines.map((l) => (
                <motion.li key={l.dishId} layout initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20, height: 0 }} className="flex gap-3 rounded-2xl border border-white/6 bg-white/[0.02] p-2.5">
                  <DishImage src={l.imageUrl} alt={l.name} category={l.category} className="size-16 shrink-0" rounded="rounded-xl" zoom={false} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="truncate text-sm font-medium text-cream">{l.name}</div>
                      <button onClick={() => cart.remove(l.dishId)} className="text-ink-500 transition hover:text-rose-300" aria-label="Видалити">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                    <input
                      value={l.notes ?? ''}
                      onChange={(e) => cart.setNotes(l.dishId, e.target.value)}
                      placeholder="Побажання (без цибулі…)"
                      className="mt-1 w-full bg-transparent text-xs text-ink-300 outline-none placeholder:text-ink-500"
                      maxLength={255}
                    />
                    <div className="mt-2 flex items-center justify-between">
                      <div className="flex items-center gap-1 rounded-full bg-white/5 p-0.5">
                        <button onClick={() => cart.setQty(l.dishId, l.quantity - 1)} className="grid size-7 place-items-center rounded-full text-ink-200 hover:bg-white/10" aria-label="Менше">
                          <Minus className="size-3.5" />
                        </button>
                        <span className="w-6 text-center text-sm tabular-nums">{l.quantity}</span>
                        <button onClick={() => cart.setQty(l.dishId, l.quantity + 1)} className="grid size-7 place-items-center rounded-full text-ink-200 hover:bg-white/10" aria-label="Більше">
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      <div className="text-sm font-semibold text-gold-200">{money(l.price * l.quantity)}</div>
                    </div>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          {recs.data && recs.data.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gold-300">
                <Sparkles className="size-3.5" /> Пасує до вашого замовлення
              </div>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
                {recs.data.map((r) => (
                  <button key={r.dish.id} disabled={!r.dish.isAvailable} onClick={() => cart.add(r.dish)} className="group w-36 shrink-0 rounded-2xl border border-white/6 bg-white/[0.02] p-2 text-left transition hover:border-gold-400/30">
                    <DishImage src={r.dish.imageUrl} alt={r.dish.name} category={r.dish.category?.slug} className="h-20 w-full" rounded="rounded-xl" />
                    <div className="mt-2 line-clamp-1 text-xs font-medium text-cream">{r.dish.name}</div>
                    <div className="line-clamp-1 text-[10px] text-gold-300/80">{r.reasons[0] ?? 'Рекомендуємо'}</div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-ink-200">{money(r.dish.price)}</span>
                      <Plus className="size-4 text-gold-300 transition group-hover:scale-125" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Коментар до замовлення (алергії, подача…)" maxLength={500} className="min-h-20" />

          <div className="rounded-2xl border border-gold-400/15 bg-gold-400/[0.04] p-4">
            <div className="flex items-center justify-between text-sm text-ink-300">
              <span>Страв</span>
              <span>{cart.count}</span>
            </div>
            <div className="mt-2 flex items-end justify-between">
              <span className="text-ink-200">До сплати</span>
              <span className="font-display text-3xl text-gold-100">{money(cart.total)}</span>
            </div>
          </div>

          {user?.role === 'CLIENT' && active ? (
            <Button variant="gold" size="lg" className="w-full" loading={place.isPending} onClick={() => place.mutate()}>
              Надіслати на кухню · {money(cart.total)}
            </Button>
          ) : (
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 text-sm text-ink-300">
              <div className="mb-1 flex items-center gap-2 font-medium text-cream">
                <QrCode className="size-4 text-gold-300" /> Замовлення — за столиком
              </div>
              {user ? (
                <>Відскануйте QR-код на столику в мобільному застосунку або попросіть офіціанта зробити check-in — і кошик одразу можна буде надіслати на кухню.</>
              ) : (
                <>Увійдіть, забронюйте столик і після check-in замовляйте прямо зі смартфона.</>
              )}
              <div className="mt-3 flex gap-2">
                {!user && (
                  <Button size="sm" variant="outline" onClick={() => navigate('/login')}>
                    Увійти
                  </Button>
                )}
                <Button size="sm" variant="glass" onClick={() => navigate('/booking')}>
                  Забронювати столик
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
