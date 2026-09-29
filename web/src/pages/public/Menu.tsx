import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Flame, Leaf, Search, SearchX, ShoppingBag, Sparkles, Star, UtensilsCrossed } from 'lucide-react';
import { motion } from 'motion/react';
import { Chip, EmptyState, Input, Select, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { DishCard } from '@/components/domain/DishCard';
import { DishModal } from '@/components/domain/DishModal';
import { useCategories, useCurrentVisit, useDishes, useRecommendations } from '@/lib/queries';
import { useCart } from '@/lib/cart';
import { useAuth } from '@/lib/auth';
import { cn, money } from '@/lib/format';

type Sort = 'menu' | 'popular' | 'rating' | 'price_asc' | 'price_desc';

export default function MenuPage() {
  const [search, setSearch] = useState('');
  const deferred = useDeferredValue(search);
  const [veg, setVeg] = useState(false);
  const [spicy, setSpicy] = useState(false);
  const [chef, setChef] = useState(false);
  const [sort, setSort] = useState<Sort>('menu');
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [openDish, setOpenDish] = useState<number | null>(null);
  const cart = useCart();
  const { user } = useAuth();
  const visit = useCurrentVisit();
  const categories = useCategories();
  const dishes = useDishes({
    search: deferred || undefined,
    vegetarian: veg || undefined,
    spicy: spicy || undefined,
    chefChoice: chef || undefined,
    sort,
  });
  const recs = useRecommendations([], 4);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const grouped = useMemo(() => {
    const map = new Map<string, NonNullable<typeof dishes.data>>();
    for (const d of dishes.data ?? []) {
      const key = d.category?.slug ?? 'other';
      map.set(key, [...(map.get(key) ?? []), d]);
    }
    return map;
  }, [dishes.data]);
  const flat = sort !== 'menu' || Boolean(deferred);

  useEffect(() => {
    if (flat) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActiveCat(visible.target.getAttribute('data-cat'));
      },
      { rootMargin: '-140px 0px -60% 0px' },
    );
    Object.values(sectionRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [grouped, flat]);

  const scrollTo = (slug: string) => {
    const el = sectionRefs.current[slug];
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 150, behavior: 'smooth' });
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-32 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-300">Сезон осінь 2026</div>
          <h1 className="mt-3 font-display text-5xl tracking-tight text-cream md:text-6xl">Меню</h1>
          <p className="mt-3 max-w-xl text-ink-300">Українська душа, італійська техніка і трохи магії від шефа Марка. Ціни в гривнях, вага — готової страви.</p>
        </div>
        {visit.data?.active ? (
          <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3 ring-1 ring-emerald-400/20">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
            </span>
            <div className="text-sm">
              <div className="text-cream">Ви за столиком №{visit.data.active.table.number}</div>
              <div className="text-xs text-ink-400">Додавайте страви й надсилайте на кухню</div>
            </div>
          </div>
        ) : (
          !user && (
            <Link to="/booking" className="text-sm text-gold-200 hover:text-gold-100">
              Замовлення доступне після check-in за столиком →
            </Link>
          )
        )}
      </div>

      {/* Панель фільтрів */}
      <div className="sticky top-[76px] z-20 -mx-4 mt-10 px-4 py-3 sm:-mx-6 sm:px-6">
        <div className="glass-strong rounded-3xl p-3 shadow-2xl shadow-black/30">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-56 flex-1">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук страви, інгредієнта…" icon={<Search className="size-4" />} />
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip active={veg} onClick={() => setVeg((v) => !v)} icon={<Leaf className="size-3.5" />}>
                Вегетаріанське
              </Chip>
              <Chip active={spicy} onClick={() => setSpicy((v) => !v)} icon={<Flame className="size-3.5" />}>
                Гостре
              </Chip>
              <Chip active={chef} onClick={() => setChef((v) => !v)} icon={<Star className="size-3.5" />}>
                Від шефа
              </Chip>
            </div>
            <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-48">
              <option value="menu">За розділами</option>
              <option value="popular">Популярні</option>
              <option value="rating">За рейтингом</option>
              <option value="price_asc">Спершу дешевші</option>
              <option value="price_desc">Спершу дорожчі</option>
            </Select>
          </div>
          {!flat && (
            <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 scrollbar-none">
              {(categories.data ?? []).map((c) =>
                grouped.has(c.slug) ? (
                  <Chip key={c.id} active={activeCat === c.slug} onClick={() => scrollTo(c.slug)}>
                    <span>{c.emoji}</span> {c.name}
                  </Chip>
                ) : null,
              )}
            </div>
          )}
        </div>
      </div>

      {/* Рекомендації */}
      {!flat && !veg && !spicy && !chef && recs.data && recs.data.length > 0 && (
        <section className="mt-10">
          <div className="mb-5 flex items-center gap-2">
            <Sparkles className="size-4 text-gold-300" />
            <h2 className="font-display text-2xl text-cream">{user ? 'Підібрано для вас' : 'Зараз найчастіше замовляють'}</h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {recs.data.map((r) => (
              <DishCard key={r.dish.id} dish={r.dish} reason={r.reasons[0]} onOpen={() => setOpenDish(r.dish.id)} />
            ))}
          </div>
        </section>
      )}

      {dishes.isLoading ? (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-96 rounded-3xl" />
          ))}
        </div>
      ) : dishes.data?.length === 0 ? (
        <EmptyState className="mt-10" icon={<SearchX className="size-7" />} title="Нічого не знайшли" text="Спробуйте змінити запит або фільтри." />
      ) : flat ? (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {dishes.data?.map((d) => <DishCard key={d.id} dish={d} onOpen={() => setOpenDish(d.id)} />)}
        </div>
      ) : (
        (categories.data ?? []).map((c) => {
          const list = grouped.get(c.slug);
          if (!list?.length) return null;
          return (
            <section key={c.id} data-cat={c.slug} ref={(el) => void (sectionRefs.current[c.slug] = el)} className="mt-16 scroll-mt-40">
              <motion.div initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="mb-6 flex items-end justify-between gap-4 border-b border-white/5 pb-4">
                <div className="flex items-center gap-4">
                  <span className="grid size-14 place-items-center rounded-2xl bg-white/[0.04] text-3xl ring-1 ring-white/8">{c.emoji}</span>
                  <div>
                    <h2 className="font-display text-3xl text-cream">{c.name}</h2>
                    {c.description && <p className="text-sm text-ink-400">{c.description}</p>}
                  </div>
                </div>
                <span className="text-sm text-ink-500">{list.length} позицій</span>
              </motion.div>
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {list.map((d) => (
                  <DishCard key={d.id} dish={d} onOpen={() => setOpenDish(d.id)} />
                ))}
              </div>
            </section>
          );
        })
      )}

      {cart.count > 0 && (
        <motion.div initial={{ y: 100 }} animate={{ y: 0 }} className={cn('fixed inset-x-0 z-30 flex justify-center px-4', visit.data?.active ? 'bottom-24' : 'bottom-6')}>
          <Button variant="gold" size="xl" className="shadow-2xl shadow-black/60" onClick={() => cart.setOpen(true)} icon={<ShoppingBag className="size-5" />}>
            Кошик · {cart.count} · {money(cart.total)}
          </Button>
        </motion.div>
      )}
      {!dishes.isLoading && dishes.data && dishes.data.length > 0 && (
        <div className="mt-20 text-center text-sm text-ink-500">
          <UtensilsCrossed className="mx-auto mb-3 size-5 text-gold-400/50" />
          Якщо у вас алергія — повідомте офіціанта або залиште коментар до замовлення.
        </div>
      )}
      <DishModal dishId={openDish} onClose={() => setOpenDish(null)} onOpenDish={setOpenDish} />
    </div>
  );
}
