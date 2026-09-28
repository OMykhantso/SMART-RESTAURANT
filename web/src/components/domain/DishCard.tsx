import { motion } from 'motion/react';
import { Clock, Flame, Leaf, Minus, Plus, Star } from 'lucide-react';
import { DishImage } from './DishImage';
import { useCart } from '@/lib/cart';
import { cn, money } from '@/lib/format';
import type { Dish } from '@/lib/types';

export function DishCard({ dish, onOpen, reason }: { dish: Dish; onOpen?: () => void; reason?: string }) {
  const cart = useCart();
  const inCart = cart.lines.find((l) => l.dishId === dish.id)?.quantity ?? 0;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'group relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/6 bg-white/[0.025] p-2 transition-all duration-500 hover:border-gold-400/25 hover:bg-white/[0.04]',
        !dish.isAvailable && 'opacity-70',
      )}
    >
      <button type="button" onClick={onOpen} className="relative block text-left" aria-label={`Деталі: ${dish.name}`}>
        <DishImage src={dish.imageUrl} alt={dish.name} category={dish.category?.slug} emoji={dish.category?.emoji} className="aspect-[4/3] w-full" rounded="rounded-[1.25rem]" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {dish.isChefChoice && <span className="gold-gradient rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-ink-950">Шеф радить</span>}
          {dish.isHit && <span className="rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-gold-100 backdrop-blur">Хіт</span>}
        </div>
        {!dish.isAvailable && (
          <div className="absolute inset-0 grid place-items-center rounded-[1.25rem] bg-ink-950/70 backdrop-blur-[2px]">
            <span className="rounded-full border border-white/15 bg-black/50 px-4 py-1.5 text-xs font-medium text-ink-100">Тимчасово немає</span>
          </div>
        )}
      </button>
      <div className="flex flex-1 flex-col px-3 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <button type="button" onClick={onOpen} className="text-left font-display text-[1.15rem] leading-snug text-cream transition-colors hover:text-gold-100">
            {dish.name}
          </button>
          {dish.avgRating !== null && (
            <span className="mt-1 flex shrink-0 items-center gap-1 text-xs text-gold-200">
              <Star className="size-3.5 fill-current" /> {dish.avgRating.toFixed(1)}
            </span>
          )}
        </div>
        {reason ? (
          <p className="mt-1.5 text-xs font-medium text-gold-300/90">✦ {reason}</p>
        ) : (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-ink-300">{dish.description}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-400">
          {dish.weightGrams && <span>{dish.weightGrams} г</span>}
          <span className="flex items-center gap-1">
            <Clock className="size-3" /> {dish.prepTimeMin} хв
          </span>
          {dish.isVegetarian && (
            <span className="flex items-center gap-1 text-emerald-300/90">
              <Leaf className="size-3" /> veg
            </span>
          )}
          {dish.isSpicy && (
            <span className="flex items-center gap-1 text-rose-300/90">
              <Flame className="size-3" /> гостре
            </span>
          )}
        </div>
        <div className="mt-auto flex items-center justify-between pt-4">
          <span className="text-lg font-semibold tracking-tight text-gold-100">{money(dish.price)}</span>
          {inCart > 0 ? (
            <div className="flex items-center gap-1 rounded-full bg-gold-400/15 p-1 ring-1 ring-gold-400/30">
              <button onClick={() => cart.setQty(dish.id, inCart - 1)} className="grid size-8 place-items-center rounded-full text-gold-100 hover:bg-white/10" aria-label="Менше">
                <Minus className="size-4" />
              </button>
              <span className="w-5 text-center text-sm font-semibold tabular-nums text-gold-50">{inCart}</span>
              <button onClick={() => cart.add(dish)} className="grid size-8 place-items-center rounded-full text-gold-100 hover:bg-white/10" aria-label="Більше">
                <Plus className="size-4" />
              </button>
            </div>
          ) : (
            <button
              disabled={!dish.isAvailable}
              onClick={() => cart.add(dish)}
              className="gold-gradient grid size-10 place-items-center rounded-full text-ink-950 shadow-[0_6px_20px_-6px_rgb(220_171_74/0.7)] transition-transform hover:scale-110 active:scale-95 disabled:opacity-30 disabled:grayscale"
              aria-label="Додати в кошик"
            >
              <Plus className="size-5" />
            </button>
          )}
        </div>
      </div>
    </motion.article>
  );
}
