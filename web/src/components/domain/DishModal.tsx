import { useQuery } from '@tanstack/react-query';
import { Clock, Flame, Leaf, Scale, Sparkles, Star, Zap } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/primitives';
import { DishImage } from './DishImage';
import { api } from '@/lib/api';
import { useCart } from '@/lib/cart';
import { useRecommendations } from '@/lib/queries';
import { fmtDateShort, money } from '@/lib/format';
import type { Dish } from '@/lib/types';

export function DishModal({ dishId, onClose, onOpenDish }: { dishId: number | null; onClose: () => void; onOpenDish?: (id: number) => void }) {
  const cart = useCart();
  const { data: dish } = useQuery({ queryKey: ['dish', dishId], queryFn: () => api.get<Dish>(`/dishes/${dishId}`), enabled: dishId !== null });
  const recs = useRecommendations(dishId ? [dishId] : [], 3);

  return (
    <Modal open={dishId !== null} onClose={onClose} size="lg" hideClose={false}>
      {!dish ? (
        <div className="space-y-4">
          <Skeleton className="aspect-[16/9] w-full" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : (
        <div>
          <DishImage src={dish.imageUrl} alt={dish.name} category={dish.category?.slug} className="aspect-[16/9] w-full" rounded="rounded-3xl" zoom={false} />
          <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-300">
                {dish.category?.emoji} {dish.category?.name}
              </div>
              <h2 className="mt-2 font-display text-3xl text-cream">{dish.name}</h2>
            </div>
            <div className="text-right">
              <div className="font-display text-3xl text-gold-100">{money(dish.price)}</div>
              {dish.avgRating != null && (
                <div className="mt-1 flex items-center justify-end gap-1 text-sm text-gold-200">
                  <Star className="size-4 fill-current" /> {dish.avgRating.toFixed(1)} <span className="text-ink-400">· {dish.reviewsCount} оцінок</span>
                </div>
              )}
            </div>
          </div>
          <p className="mt-4 leading-relaxed text-ink-200">{dish.description}</p>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {dish.weightGrams && <Info icon={<Scale className="size-4" />} label="Вага" value={`${dish.weightGrams} г`} />}
            {dish.calories && <Info icon={<Zap className="size-4" />} label="Калорії" value={`${dish.calories} ккал`} />}
            <Info icon={<Clock className="size-4" />} label="Готується" value={`~${dish.prepTimeMin} хв`} />
            {dish.isVegetarian ? <Info icon={<Leaf className="size-4" />} label="Меню" value="Вегетаріанське" /> : dish.isSpicy ? <Info icon={<Flame className="size-4" />} label="Смак" value="Гостре" /> : null}
          </div>
          {dish.allergens.length > 0 && (
            <div className="mt-5 text-sm text-ink-300">
              <span className="text-ink-400">Алергени: </span>
              {dish.allergens.join(', ')}
            </div>
          )}

          {recs.data && recs.data.length > 0 && (
            <div className="mt-7">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gold-300">
                <Sparkles className="size-3.5" /> До цієї страви пасує
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {recs.data.map((r) => (
                  <button key={r.dish.id} onClick={() => onOpenDish?.(r.dish.id)} className="flex items-center gap-3 rounded-2xl border border-white/6 bg-white/[0.02] p-2 text-left transition hover:border-gold-400/30">
                    <DishImage src={r.dish.imageUrl} alt={r.dish.name} category={r.dish.category?.slug} className="size-12 shrink-0" rounded="rounded-xl" />
                    <div className="min-w-0">
                      <div className="truncate text-sm text-cream">{r.dish.name}</div>
                      <div className="truncate text-[11px] text-gold-300/80">{r.reasons[0] ?? money(r.dish.price)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {dish.reviews && dish.reviews.length > 0 && (
            <div className="mt-7">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-300">Оцінки гостей</div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {dish.reviews.map((r) => (
                  <div key={r.id} className="w-48 shrink-0 rounded-2xl border border-white/6 bg-white/[0.02] p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-cream">{r.author}</span>
                      <span className="flex items-center gap-0.5 text-xs text-gold-200">
                        <Star className="size-3 fill-current" /> {r.rating}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-ink-400">{fmtDateShort(r.createdAt)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            variant="gold"
            size="lg"
            className="mt-8 w-full"
            disabled={!dish.isAvailable}
            onClick={() => {
              cart.add(dish);
              onClose();
            }}
          >
            {dish.isAvailable ? `Додати в кошик · ${money(dish.price)}` : 'Тимчасово недоступно'}
          </Button>
        </div>
      )}
    </Modal>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/6 bg-white/[0.025] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-ink-400">
        <span className="text-gold-300">{icon}</span> {label}
      </div>
      <div className="mt-0.5 text-sm text-cream">{value}</div>
    </div>
  );
}
