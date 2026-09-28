import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, Ban, Check, ChefHat, Flame, Maximize2, Play, StickyNote, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Switch } from '@/components/ui/primitives';
import { LogoMark } from '@/components/domain/Logo';
import { useTick } from '@/components/domain/StaffCards';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useRealtime } from '@/lib/realtime';
import { useDishes } from '@/lib/queries';
import { chime } from '@/lib/sound';
import { cn, minutesSince } from '@/lib/format';
import type { Order, OrderItemStatus } from '@/lib/types';

/** Kitchen Display System: черга кухні з таймерами, відмітками страв і стоп-листом. */
export default function Kitchen() {
  const { user } = useAuth();
  const { connected } = useRealtime();
  const now = useTick(5_000);
  const qc = useQueryClient();
  const [stopList, setStopList] = useState(false);
  const { data } = useQuery({ queryKey: ['kitchen'], queryFn: () => api.get<Order[]>('/kitchen/orders'), refetchInterval: 30_000 });
  const canCook = user?.role === 'KITCHEN' || user?.role === 'ADMIN';

  const invalidate = () => ['kitchen', 'orders', 'order', 'tables-live'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: 'PREPARING' | 'READY' | 'CANCELLED'; reason?: string }) => api.patch<Order>(`/orders/${id}/status`, { status, reason: status === 'CANCELLED' ? 'Страва закінчилась (кухня)' : undefined }),
    onSuccess: (o) => {
      if (o.status === 'READY') chime('ready');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const setItem = useMutation({
    mutationFn: ({ orderId, itemId, status }: { orderId: number; itemId: number; status: OrderItemStatus }) => api.patch<Order>(`/kitchen/orders/${orderId}/items/${itemId}`, { status }),
    onSuccess: (o) => {
      if (o.status === 'READY') {
        chime('ready');
        toast.success(`Замовлення #${o.id} готове — стіл №${o.table.number}`);
      }
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const columns = useMemo(
    () => [
      { key: 'CONFIRMED', title: 'Нові', accent: 'text-sky-300', list: (data ?? []).filter((o) => o.status === 'CONFIRMED') },
      { key: 'PREPARING', title: 'Готуються', accent: 'text-orange-300', list: (data ?? []).filter((o) => o.status === 'PREPARING') },
      { key: 'READY', title: 'Готові до видачі', accent: 'text-emerald-300', list: (data ?? []).filter((o) => o.status === 'READY').reverse() },
    ],
    [data],
  );

  return (
    <div className="min-h-dvh bg-ink-950 text-cream">
      <header className="sticky top-0 z-20 flex flex-wrap items-center justify-between gap-4 border-b border-white/5 bg-ink-950/90 px-5 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-4">
          {user?.role !== 'KITCHEN' && (
            <Link to="/staff" className="grid size-10 place-items-center rounded-xl text-ink-300 hover:bg-white/5" aria-label="Назад">
              <ArrowLeft className="size-5" />
            </Link>
          )}
          <LogoMark />
          <div>
            <div className="font-display text-xl">Kitchen Display</div>
            <div className="flex items-center gap-2 text-xs text-ink-400">
              <span className={cn('size-1.5 rounded-full', connected ? 'bg-emerald-400' : 'bg-rose-400')} />
              {connected ? 'Онлайн · нові замовлення з’являються миттєво' : 'Немає зʼєднання'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {columns.map((c) => (
            <div key={c.key} className="hidden rounded-xl bg-white/[0.04] px-3 py-1.5 text-center sm:block">
              <div className={cn('font-display text-xl leading-none', c.accent)}>{c.list.length}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-wider text-ink-400">{c.title}</div>
            </div>
          ))}
          <Button variant="glass" size="sm" icon={<Ban className="size-4" />} onClick={() => setStopList(true)}>
            Стоп-лист
          </Button>
          <Button variant="ghost" size="icon" onClick={() => chime('new')} aria-label="Перевірити звук">
            <Volume2 className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => document.documentElement.requestFullscreen?.()} aria-label="На весь екран">
            <Maximize2 className="size-4" />
          </Button>
          <div className="ml-2 font-display text-3xl tabular-nums text-gold-200">
            {new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv' }).format(now)}
          </div>
        </div>
      </header>

      <main className="grid gap-4 p-4 lg:grid-cols-3">
        {columns.map((col) => (
          <section key={col.key} className="min-h-[70vh] rounded-3xl border border-white/5 bg-white/[0.015] p-3">
            <div className="mb-3 flex items-center justify-between px-2">
              <h2 className={cn('font-display text-2xl', col.accent)}>{col.title}</h2>
              <span className="text-sm text-ink-400">{col.list.length}</span>
            </div>
            <div className="grid gap-3">
              <AnimatePresence initial={false}>
                {col.list.map((o) => (
                  <Ticket
                    key={o.id}
                    o={o}
                    now={now}
                    canCook={canCook}
                    onStart={() => setStatus.mutate({ id: o.id, status: 'PREPARING' })}
                    onReady={() => setStatus.mutate({ id: o.id, status: 'READY' })}
                    onToggle={(itemId, status) => setItem.mutate({ orderId: o.id, itemId, status })}
                  />
                ))}
              </AnimatePresence>
              {col.list.length === 0 && (
                <div className="grid place-items-center rounded-2xl border border-dashed border-white/6 py-16 text-center text-sm text-ink-500">
                  <ChefHat className="mb-2 size-6 text-ink-600" />
                  {col.key === 'CONFIRMED' ? 'Чекаємо на нові замовлення' : 'Порожньо'}
                </div>
              )}
            </div>
          </section>
        ))}
      </main>
      <StopListModal open={stopList} onClose={() => setStopList(false)} />
    </div>
  );
}

function Ticket({ o, now, canCook, onStart, onReady, onToggle }: { o: Order; now: number; canCook: boolean; onStart: () => void; onReady: () => void; onToggle: (itemId: number, status: OrderItemStatus) => void }) {
  const maxPrep = Math.max(...o.items.map((i) => i.prepTimeMin), 1);
  const since = o.status === 'READY' ? o.readyAt : o.status === 'PREPARING' ? o.preparingAt : o.confirmedAt;
  const elapsed = minutesSince(since, now);
  const total = minutesSince(o.confirmedAt, now);
  const ratio = o.status === 'PREPARING' ? elapsed / maxPrep : o.status === 'CONFIRMED' ? elapsed / 5 : 0;
  const urgency = o.status === 'READY' ? 'ready' : ratio >= 1 ? 'late' : ratio >= 0.7 ? 'warn' : 'ok';
  const ring = { ok: 'border-white/8', warn: 'border-amber-400/50', late: 'border-rose-400/70 shadow-[0_0_30px_-8px_rgb(251_113_133/0.7)]', ready: 'border-emerald-400/50' }[urgency];
  const readyCount = o.items.filter((i) => i.status === 'READY').length;

  return (
    <motion.article layout initial={{ opacity: 0, y: -12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className={cn('overflow-hidden rounded-2xl border bg-ink-850', ring)}>
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-4xl leading-none text-cream">№{o.table.number}</span>
            <span className="text-sm text-ink-400">#{o.id}</span>
          </div>
          <div className="mt-1 text-xs text-ink-400">
            {o.reservation.guests} гост. · {o.createdBy.role === 'CLIENT' ? 'через застосунок' : `офіціант ${o.createdBy.name.split(' ')[0]}`}
          </div>
        </div>
        <div className="text-right">
          <div className={cn('font-display text-3xl tabular-nums leading-none', urgency === 'late' ? 'text-rose-300' : urgency === 'warn' ? 'text-amber-300' : urgency === 'ready' ? 'text-emerald-300' : 'text-cream')}>{o.status === 'READY' ? `${elapsed}′` : `${total}′`}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-ink-500">{o.status === 'READY' ? 'чекає видачі' : o.status === 'CONFIRMED' ? 'не розпочато' : `норма ${maxPrep}′`}</div>
        </div>
      </div>
      {o.status === 'PREPARING' && (
        <div className="mx-4 h-1 overflow-hidden rounded-full bg-white/5">
          <div className={cn('h-full rounded-full transition-all', urgency === 'late' ? 'bg-rose-400' : urgency === 'warn' ? 'bg-amber-400' : 'bg-emerald-400')} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
        </div>
      )}
      <ul className="space-y-1 p-3">
        {o.items.map((i) => {
          const ready = i.status === 'READY';
          return (
            <li key={i.id}>
              <button
                disabled={!canCook || o.status === 'READY'}
                onClick={() => onToggle(i.id, ready ? 'COOKING' : 'READY')}
                className={cn('flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left transition', ready ? 'bg-emerald-400/10' : 'hover:bg-white/[0.04]', 'disabled:cursor-default')}
              >
                <span className={cn('mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg border', ready ? 'border-emerald-400 bg-emerald-400 text-ink-950' : 'border-white/20')}>{ready && <Check className="size-4" strokeWidth={3} />}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn('block text-lg leading-tight', ready ? 'text-ink-400 line-through' : 'text-cream')}>
                    <span className="font-semibold text-gold-200">{i.quantity}×</span> {i.name}
                  </span>
                  {i.notes && <span className="mt-0.5 block text-sm font-medium text-amber-300">⚠ {i.notes}</span>}
                </span>
                <span className="text-xs text-ink-500">{i.prepTimeMin}′</span>
              </button>
            </li>
          );
        })}
      </ul>
      {o.notes && (
        <div className="mx-3 mb-3 flex items-start gap-2 rounded-xl bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
          <StickyNote className="mt-0.5 size-4 shrink-0" /> {o.notes}
        </div>
      )}
      {canCook && o.status !== 'READY' && (
        <div className="flex gap-2 border-t border-white/5 p-3">
          {o.status === 'CONFIRMED' ? (
            <Button variant="gold" className="flex-1" icon={<Play className="size-4" />} onClick={onStart}>
              Почати готувати
            </Button>
          ) : (
            <Button variant="success" className="flex-1" icon={<Flame className="size-4" />} onClick={onReady}>
              Усе готово · {readyCount}/{o.items.length}
            </Button>
          )}
        </div>
      )}
    </motion.article>
  );
}

function StopListModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dishes = useDishes({});
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: ({ id, isAvailable }: { id: number; isAvailable: boolean }) => api.patch(`/dishes/${id}/availability`, { isAvailable }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dishes'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const off = (dishes.data ?? []).filter((d) => !d.isAvailable).length;
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Стоп-лист" subtitle={`Вимкнені страви зникають із замовлення в застосунку миттєво · зараз у стоп-листі: ${off}`}>
      <div className="grid gap-2 sm:grid-cols-2">
        {dishes.data?.map((d) => (
          <div key={d.id} className={cn('flex items-center justify-between gap-3 rounded-2xl border px-3 py-2.5', d.isAvailable ? 'border-white/6' : 'border-rose-400/30 bg-rose-500/[0.06]')}>
            <div className="min-w-0">
              <div className="truncate text-sm text-cream">{d.name}</div>
              <div className="text-[11px] text-ink-400">{d.category?.name}</div>
            </div>
            <Switch checked={d.isAvailable} onChange={(v) => toggle.mutate({ id: d.id, isAvailable: v })} />
          </div>
        ))}
      </div>
    </Modal>
  );
}
