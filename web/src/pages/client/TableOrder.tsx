import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { QrCode, ShoppingBag, Smartphone, UtensilsCrossed } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, Chip, EmptyState, Skeleton } from '@/components/ui/primitives';
import { DishCard } from '@/components/domain/DishCard';
import { DishModal } from '@/components/domain/DishModal';
import { OrderBadge } from '@/components/domain/StatusBadge';
import { useCategories, useCurrentVisit, useDishes, useMyOrders } from '@/lib/queries';
import { useCart } from '@/lib/cart';
import { fmtTime, money } from '@/lib/format';
import { ZONES } from '@/lib/constants';

export default function TableOrder() {
  const visit = useCurrentVisit();
  const cart = useCart();
  const categories = useCategories();
  const [cat, setCat] = useState<string | null>(null);
  const [openDish, setOpenDish] = useState<number | null>(null);
  const dishes = useDishes(cat ? { category: cat, sort: 'popular' } : { sort: 'popular' });
  const orders = useMyOrders();
  const active = visit.data?.active;
  const visitOrders = useMemo(() => (orders.data ?? []).filter((o) => o.reservationId === active?.id), [orders.data, active?.id]);
  const bill = visitOrders.filter((o) => o.status !== 'CANCELLED').reduce((s, o) => s + o.total, 0);

  if (visit.isLoading) return <div className="mx-auto max-w-6xl px-4 pt-32"><Skeleton className="h-64" /></div>;

  if (!active) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-24 pt-36">
        <EmptyState
          icon={<QrCode className="size-7" />}
          title="Спершу — check-in за столиком"
          text={
            <>
              Відскануйте QR-код на своєму столику в мобільному застосунку Smart Restaurant або покажіть QR бронювання хостес. Після check-in тут зʼявиться меню для замовлення.
            </>
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link to="/booking"><Button variant="gold">Забронювати столик</Button></Link>
              <Link to="/account"><Button variant="glass" icon={<Smartphone className="size-4" />}>Мої бронювання</Button></Link>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 pb-32 pt-32 sm:px-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div>
          <Card className="relative overflow-hidden p-6">
            <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full bg-emerald-400/10 blur-3xl" />
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
              <span className="size-2 animate-pulse rounded-full bg-emerald-400" /> Ви за столиком
            </div>
            <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
              <h1 className="font-display text-4xl text-cream">Столик №{active.table.number}</h1>
              <div className="text-sm text-ink-300">
                {ZONES[active.table.zone].label} · з {active.checkedInAt ? fmtTime(active.checkedInAt) : active.time} до {active.endTime}
              </div>
            </div>
          </Card>

          <div className="-mx-1 mt-6 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
            <Chip active={cat === null} onClick={() => setCat(null)}>
              ⭐ Популярне
            </Chip>
            {categories.data?.map((c) => (
              <Chip key={c.id} active={cat === c.slug} onClick={() => setCat(c.slug)}>
                {c.emoji} {c.name}
              </Chip>
            ))}
          </div>
          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {dishes.isLoading
              ? Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-96 rounded-3xl" />)
              : dishes.data?.map((d) => <DishCard key={d.id} dish={d} onOpen={() => setOpenDish(d.id)} />)}
          </div>
        </div>

        <div className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xl text-cream">Ваш рахунок</h3>
              <span className="font-display text-2xl text-gold-100">{money(bill)}</span>
            </div>
            {visitOrders.length === 0 ? (
              <p className="mt-3 text-sm text-ink-400">Ще немає замовлень. Оберіть страви в меню ліворуч.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {visitOrders.map((o) => (
                  <li key={o.id}>
                    <Link to={`/account/orders/${o.id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.03] p-3 transition hover:bg-white/[0.06]">
                      <div className="min-w-0">
                        <div className="text-sm text-cream">#{o.id} · {money(o.total)}</div>
                        <div className="truncate text-xs text-ink-400">{o.items.map((i) => i.name).join(', ')}</div>
                      </div>
                      <OrderBadge status={o.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Button variant="gold" size="lg" className="w-full" disabled={cart.count === 0} onClick={() => cart.setOpen(true)} icon={<ShoppingBag className="size-5" />}>
            {cart.count ? `Кошик · ${cart.count} · ${money(cart.total)}` : 'Кошик порожній'}
          </Button>
          <p className="flex items-start gap-2 px-1 text-xs text-ink-400">
            <UtensilsCrossed className="mt-0.5 size-3.5 shrink-0 text-gold-300" /> Статуси оновлюються в реальному часі — сторінку перезавантажувати не потрібно.
          </p>
        </div>
      </div>
      <DishModal dishId={openDish} onClose={() => setOpenDish(null)} onOpenDish={setOpenDish} />
    </div>
  );
}
