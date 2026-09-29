import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/primitives';
import { DishImage } from './DishImage';
import { api, errorMessage } from '@/lib/api';
import { cn } from '@/lib/format';
import type { Order } from '@/lib/types';

const LABELS = ['', 'Погано', 'Так собі', 'Добре', 'Дуже добре', 'Неймовірно!'];

function Stars({ value, onChange, size = 'lg' }: { value: number; onChange: (v: number) => void; size?: 'lg' | 'sm' }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" onMouseEnter={() => setHover(i)} onClick={() => onChange(i)} aria-label={`${i} зірок`}>
          <Star className={cn('transition-all', size === 'lg' ? 'size-9' : 'size-5', i <= (hover || value) ? 'scale-110 fill-gold-300 text-gold-300' : 'text-ink-600')} />
        </button>
      ))}
    </div>
  );
}

export function ReviewModal({ order, open, onClose }: { order: Order; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const uniqueDishes = [...new Map(order.items.map((i) => [i.dishId, i])).values()];
  const [dishRatings, setDishRatings] = useState<Record<number, number>>({});

  const submit = useMutation({
    mutationFn: () =>
      api.post(`/orders/${order.id}/review`, {
        rating,
        comment: comment || undefined,
        dishes: Object.entries(dishRatings).map(([dishId, r]) => ({ dishId: Number(dishId), rating: r })),
      }),
    onSuccess: () => {
      toast.success('Дякуємо за відгук! ❤️');
      qc.invalidateQueries({ queryKey: ['order', order.id] });
      qc.invalidateQueries({ queryKey: ['my-orders'] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Modal open={open} onClose={onClose} title="Як вам візит?" subtitle="Ваша оцінка допомагає нам ставати кращими">
      <div className="flex flex-col items-center py-2">
        <Stars value={rating} onChange={setRating} />
        <div className="mt-2 font-display text-lg text-gold-200">{LABELS[rating]}</div>
      </div>
      <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Що сподобалось найбільше?" className="mt-4" maxLength={1000} />
      <div className="mt-6 text-xs font-medium uppercase tracking-wider text-ink-300">Оцініть страви</div>
      <ul className="mt-3 space-y-2">
        {uniqueDishes.map((i) => (
          <li key={i.dishId} className="flex items-center gap-3 rounded-2xl bg-white/[0.03] p-2 pr-3">
            <DishImage src={i.imageUrl} alt={i.name} category={i.category.slug} className="size-11 shrink-0" rounded="rounded-xl" />
            <span className="flex-1 truncate text-sm text-cream">{i.name}</span>
            <Stars size="sm" value={dishRatings[i.dishId] ?? 0} onChange={(v) => setDishRatings((d) => ({ ...d, [i.dishId]: v }))} />
          </li>
        ))}
      </ul>
      <Button variant="gold" size="lg" className="mt-6 w-full" loading={submit.isPending} onClick={() => submit.mutate()}>
        Надіслати відгук
      </Button>
    </Modal>
  );
}
