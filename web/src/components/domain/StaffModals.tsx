import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Chip, Field, Input, Select, Textarea } from '@/components/ui/primitives';
import { DishImage } from './DishImage';
import { api, errorMessage, toApiError } from '@/lib/api';
import { useCategories, useDishes } from '@/lib/queries';
import { addDays, cn, isoDay, money, relativeDay } from '@/lib/format';
import type { Availability, LiveTable, Order, Reservation, TablesAvailability } from '@/lib/types';

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => ['orders', 'reservations', 'tables-live', 'today', 'kitchen', 'reservation', 'order'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

/** POS: офіціант створює замовлення для столика (одразу потрапляє на кухню). */
export function NewOrderModal({ open, onClose, tableId, tables }: { open: boolean; onClose: () => void; tableId?: number | null; tables: LiveTable[] }) {
  const invalidate = useInvalidateAll();
  const occupied = tables.filter((t) => t.state === 'OCCUPIED');
  const [table, setTable] = useState<number | null>(tableId ?? null);
  const [cat, setCat] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<Record<number, number>>({});
  const [notes, setNotes] = useState('');
  const categories = useCategories();
  const dishes = useDishes({ category: cat ?? undefined, search: search || undefined });

  useEffect(() => {
    if (open) {
      setTable(tableId ?? occupied[0]?.id ?? null);
      setLines({});
      setNotes('');
    }
  }, [open, tableId]); // occupied навмисно не в залежностях: не скидаємо вибір при оновленні залу

  const all = dishes.data ?? [];
  const catalog = useDishes({});
  const byId = useMemo(() => new Map((catalog.data ?? []).map((d) => [d.id, d])), [catalog.data]);
  const count = Object.values(lines).reduce((a, b) => a + b, 0);
  const total = Object.entries(lines).reduce((s, [id, q]) => s + (byId.get(Number(id))?.price ?? 0) * q, 0);

  const create = useMutation({
    mutationFn: () =>
      api.post<Order>('/orders', {
        tableId: table,
        notes: notes || undefined,
        items: Object.entries(lines)
          .filter(([, q]) => q > 0)
          .map(([dishId, quantity]) => ({ dishId: Number(dishId), quantity })),
      }),
    onSuccess: (o) => {
      toast.success(`Замовлення #${o.id} передано на кухню`);
      invalidate();
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const set = (id: number, q: number) => setLines((l) => ({ ...l, [id]: Math.max(0, Math.min(50, q)) }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title="Нове замовлення (POS)"
      subtitle="Замовлення офіціанта одразу потрапляє на кухню"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-ink-300">
            {count} поз. · <span className="font-display text-xl text-gold-100">{money(total)}</span>
          </div>
          <Button variant="gold" disabled={!table || count === 0} loading={create.isPending} onClick={() => create.mutate()}>
            Передати на кухню
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
        <div className="space-y-3">
          <Field label="Столик">
            <Select value={table ?? ''} onChange={(e) => setTable(Number(e.target.value))}>
              {occupied.length === 0 && <option value="">Немає зайнятих столиків</option>}
              {occupied.map((t) => (
                <option key={t.id} value={t.id}>
                  №{t.number} · {t.current?.guestName ?? 'Гість'}
                </option>
              ))}
            </Select>
          </Field>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Коментар для кухні" className="min-h-20" />
          <div className="space-y-1.5">
            {Object.entries(lines)
              .filter(([, q]) => q > 0)
              .map(([id, q]) => (
                <div key={id} className="flex justify-between text-xs text-ink-200">
                  <span className="truncate">
                    {q}× {byId.get(Number(id))?.name}
                  </span>
                  <span>{money((byId.get(Number(id))?.price ?? 0) * q)}</span>
                </div>
              ))}
          </div>
        </div>
        <div>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Пошук страви" icon={<Search className="size-4" />} />
          <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
            <Chip active={cat === null} onClick={() => setCat(null)}>
              Усе
            </Chip>
            {categories.data?.map((c) => (
              <Chip key={c.id} active={cat === c.slug} onClick={() => setCat(c.slug)}>
                {c.emoji} {c.name}
              </Chip>
            ))}
          </div>
          <div className="mt-3 grid max-h-[46vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
            {all.map((d) => {
              const q = lines[d.id] ?? 0;
              return (
                <div key={d.id} className={cn('flex items-center gap-3 rounded-2xl border p-2 transition', q ? 'border-gold-400/40 bg-gold-400/[0.06]' : 'border-white/6 bg-white/[0.02]', !d.isAvailable && 'opacity-40')}>
                  <DishImage src={d.imageUrl} alt={d.name} category={d.category?.slug} className="size-12 shrink-0" rounded="rounded-xl" zoom={false} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-cream">{d.name}</div>
                    <div className="text-xs text-gold-200">{money(d.price)}</div>
                  </div>
                  {d.isAvailable && (
                    <div className="flex items-center gap-1">
                      {q > 0 && (
                        <>
                          <button onClick={() => set(d.id, q - 1)} className="grid size-7 place-items-center rounded-full bg-white/5 text-ink-200 hover:bg-white/10" aria-label="Менше">
                            <Minus className="size-3.5" />
                          </button>
                          <span className="w-5 text-center text-sm tabular-nums">{q}</span>
                        </>
                      )}
                      <button onClick={() => set(d.id, q + 1)} className="gold-gradient grid size-7 place-items-center rounded-full text-ink-950" aria-label="Додати">
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Посадити гостя без бронювання (walk-in). */
export function WalkInModal({ open, onClose, table }: { open: boolean; onClose: () => void; table: LiveTable | null }) {
  const invalidate = useInvalidateAll();
  const [guests, setGuests] = useState(2);
  const [name, setName] = useState('');
  useEffect(() => {
    if (open && table) setGuests(Math.min(2, table.seats));
  }, [open, table]);
  const seat = useMutation({
    mutationFn: () => api.post<Reservation>('/reservations/walk-in', { tableId: table!.id, guests, guestName: name || undefined }),
    onSuccess: (r) => {
      toast.success(`Гостей посаджено за столик №${r.table.number}`, { description: `Візит до ${r.endTime}` });
      invalidate();
      onClose();
      setName('');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!table) return null;
  return (
    <Modal open={open} onClose={onClose} size="sm" title={`Посадити за столик №${table.number}`} subtitle="Гість без бронювання (walk-in)">
      <div className="space-y-4">
        <Field label="Кількість гостей">
          <div className="flex items-center gap-3">
            <button onClick={() => setGuests((g) => Math.max(1, g - 1))} className="grid size-10 place-items-center rounded-xl bg-white/5">
              <Minus className="size-4" />
            </button>
            <span className="w-10 text-center font-display text-3xl">{guests}</span>
            <button onClick={() => setGuests((g) => Math.min(table.seats, g + 1))} className="grid size-10 place-items-center rounded-xl bg-white/5">
              <Plus className="size-4" />
            </button>
            <span className="text-xs text-ink-400">макс. {table.seats}</span>
          </div>
        </Field>
        <Field label="Імʼя гостя (необовʼязково)">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Гість без бронювання" />
        </Field>
        {table.next && <div className="rounded-xl bg-sky-400/10 p-3 text-xs text-sky-100">Наступне бронювання на цьому столику о {table.next.time} — візит буде обмежено.</div>}
        <Button variant="gold" className="w-full" loading={seat.isPending} onClick={() => seat.mutate()}>
          Посадити гостей
        </Button>
      </div>
    </Modal>
  );
}

/** Бронювання по телефону (працівник): одразу CONFIRMED. */
export function NewReservationModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const invalidate = useInvalidateAll();
  const [date, setDate] = useState(isoDay());
  const [guests, setGuests] = useState(2);
  const [startAt, setStartAt] = useState<string>('');
  const [tableId, setTableId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const availability = useQuery({
    queryKey: ['availability', 'staff', date, guests],
    queryFn: () => api.get<Availability>('/booking/availability', { date, guests }),
    enabled: open,
  });
  const tables = useQuery({
    queryKey: ['booking-tables', startAt, guests],
    queryFn: () => api.get<TablesAvailability>('/booking/tables', { startAt, guests }),
    enabled: open && Boolean(startAt),
  });
  useEffect(() => {
    setStartAt('');
  }, [date, guests]);
  useEffect(() => {
    setTableId(tables.data?.recommendedTableId ?? null);
  }, [tables.data]);
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(isoDay(), i)), []);

  const create = useMutation({
    mutationFn: () =>
      api.post<Reservation>('/reservations', {
        startAt,
        guests,
        tableId: tableId ?? undefined,
        guestName: name,
        guestPhone: phone || undefined,
        notes: notes || undefined,
        source: 'STAFF',
      }),
    onSuccess: (r) => {
      toast.success(`Бронювання ${r.code} створено`, { description: `Столик №${r.table.number}, ${r.time}` });
      invalidate();
      onClose();
      setName('');
      setPhone('');
      setNotes('');
    },
    onError: (e) => toast.error(toApiError(e).message),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Бронювання по телефону"
      subtitle="Створюється одразу підтвердженим"
      footer={
        <div className="flex justify-end">
          <Button variant="gold" disabled={!startAt || name.trim().length < 2} loading={create.isPending} onClick={() => create.mutate()}>
            Створити бронювання
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {days.map((d) => (
            <Chip key={d} active={d === date} onClick={() => setDate(d)}>
              {relativeDay(d)}
            </Chip>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Гостей">
            <Input type="number" min={1} max={12} value={guests} onChange={(e) => setGuests(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} />
          </Field>
          <Field label="Імʼя гостя" className="sm:col-span-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Пан Петро" />
          </Field>
          <Field label="Телефон">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+380…" />
          </Field>
          <Field label="Нотатки" className="sm:col-span-2">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Дитячий стілець, торт…" />
          </Field>
        </div>
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-300">Час</div>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
            {availability.data?.slots.map((s) => (
              <button
                key={s.startAt}
                disabled={!s.available}
                onClick={() => setStartAt(s.startAt)}
                className={cn('rounded-xl border py-2 text-sm tabular-nums transition', startAt === s.startAt ? 'gold-gradient border-transparent text-ink-950' : s.available ? 'border-white/10 hover:border-gold-300/50' : 'border-white/5 text-ink-600 line-through')}
              >
                {s.time}
              </button>
            ))}
          </div>
        </div>
        {tables.data && (
          <div>
            <div className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-300">Столик</div>
            <div className="flex flex-wrap gap-2">
              {tables.data.tables
                .filter((t) => t.state === 'FREE')
                .map((t) => (
                  <Chip key={t.id} active={tableId === t.id} onClick={() => setTableId(t.id)}>
                    №{t.number} · {t.seats} міс. {t.recommended && '✦'}
                  </Chip>
                ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Запит причини (скасування / відхилення). */
export function ReasonModal({ open, onClose, title, onSubmit, loading, presets }: { open: boolean; onClose: () => void; title: string; onSubmit: (reason: string) => void; loading?: boolean; presets: string[] }) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (open) setReason(presets[0] ?? '');
  }, [open, presets]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Назад
          </Button>
          <Button variant="danger" disabled={reason.trim().length < 3} loading={loading} onClick={() => onSubmit(reason.trim())}>
            Підтвердити
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <Chip key={p} active={reason === p} onClick={() => setReason(p)}>
            {p}
          </Chip>
        ))}
      </div>
      <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-4" placeholder="Причина" maxLength={255} />
    </Modal>
  );
}
