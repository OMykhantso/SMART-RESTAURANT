import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Info, Minus, Plus, Sparkles, Users, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card, Chip, Skeleton, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/Modal';
import { FloorPlan, LegendDot, type TableVisual } from '@/components/domain/FloorPlan';
import { api, toApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useBookingConfig } from '@/lib/queries';
import { addDays, cn, fmtFullDate, guestsLabel, isoDay, relativeDay } from '@/lib/format';
import { ZONES } from '@/lib/constants';
import type { Availability, Reservation, Slot, TableZone, TablesAvailability } from '@/lib/types';

const DRAFT_KEY = 'sr.booking-draft';

export default function Booking() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const config = useBookingConfig();
  const draft = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null') as { date: string; guests: number; zone: TableZone | null } | null;
    } catch {
      return null;
    }
  }, []);
  const [date, setDate] = useState(draft?.date ?? isoDay());
  const [guests, setGuests] = useState(draft?.guests ?? 2);
  const [zone, setZone] = useState<TableZone | null>(draft?.zone ?? null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [tableId, setTableId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [dayOffset, setDayOffset] = useState(0);
  const [created, setCreated] = useState<Reservation | null>(null);
  const [alternatives, setAlternatives] = useState<{ time: string; startAt: string }[]>([]);
  const maxParty = config.data?.maxPartySize ?? 12;

  const availability = useQuery({
    queryKey: ['availability', date, guests, zone],
    queryFn: () => api.get<Availability>('/booking/availability', { date, guests, zone: zone ?? undefined }),
  });
  const tables = useQuery({
    queryKey: ['booking-tables', slot?.startAt, guests, zone],
    queryFn: () => api.get<TablesAvailability>('/booking/tables', { startAt: slot!.startAt, guests, zone: zone ?? undefined }),
    enabled: Boolean(slot),
  });

  useEffect(() => {
    setSlot(null);
    setTableId(null);
    setAlternatives([]);
  }, [date, guests, zone]);
  useEffect(() => {
    if (tables.data) setTableId(tables.data.recommendedTableId);
  }, [tables.data]);

  const days = useMemo(() => Array.from({ length: 60 }, (_, i) => addDays(isoDay(), i)), []);
  const visibleDays = days.slice(dayOffset, dayOffset + 10);

  const groups = useMemo(() => {
    const slots = availability.data?.slots ?? [];
    return [
      { title: 'Сніданок і обід', slots: slots.filter((s) => Number(s.time.slice(0, 2)) < 17) },
      { title: 'Вечеря', slots: slots.filter((s) => Number(s.time.slice(0, 2)) >= 17) },
    ].filter((g) => g.slots.length);
  }, [availability.data]);

  const selectedTable = tables.data?.tables.find((t) => t.id === tableId);

  const book = useMutation({
    mutationFn: () =>
      api.post<Reservation>('/reservations', {
        startAt: slot!.startAt,
        guests,
        tableId: tableId ?? undefined,
        zone: zone ?? undefined,
        notes: notes || undefined,
        source: 'WEB',
      }),
    onSuccess: (r) => {
      sessionStorage.removeItem(DRAFT_KEY);
      setCreated(r);
      qc.invalidateQueries({ queryKey: ['availability'] });
      qc.invalidateQueries({ queryKey: ['my-reservations'] });
      qc.invalidateQueries({ queryKey: ['current-visit'] });
    },
    onError: (e) => {
      const err = toApiError(e);
      const alts = (err.details as { alternatives?: { time: string; startAt: string }[] } | undefined)?.alternatives;
      if (alts?.length) setAlternatives(alts);
      toast.error(err.message);
      qc.invalidateQueries({ queryKey: ['availability'] });
      qc.invalidateQueries({ queryKey: ['booking-tables'] });
    },
  });

  const submit = () => {
    if (!user) {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ date, guests, zone }));
      navigate('/login?next=/booking');
      return;
    }
    if (user.role !== 'CLIENT') {
      toast.info('Працівники створюють бронювання з панелі керування');
      navigate('/staff/reservations');
      return;
    }
    book.mutate();
  };

  const visual = (t: TablesAvailability['tables'][number]): TableVisual => {
    if (t.id === tableId) return { tone: 'selected', sublabel: `${t.seats} місць` };
    if (t.state === 'FREE') return { tone: t.recommended ? 'recommended' : 'free', sublabel: `${t.seats} місць`, badge: t.recommended ? <span className="gold-gradient grid size-5 place-items-center rounded-full text-[10px] text-ink-950">✦</span> : undefined };
    if (t.state === 'TOO_SMALL') return { tone: 'disabled', sublabel: `${t.seats} місць`, disabled: true };
    return { tone: 'busy', sublabel: 'зайнято', disabled: true };
  };

  return (
    <div className="mx-auto max-w-7xl px-4 pb-24 pt-32 sm:px-6">
      <div className="max-w-3xl">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-300">Booking engine</div>
        <h1 className="mt-3 font-display text-5xl tracking-tight text-cream md:text-6xl">Забронювати столик</h1>
        <p className="mt-3 text-ink-300">Оберіть дату, кількість гостей і час — алгоритм підбере найкращий столик. За бажанням оберіть інший прямо на плані залу.</p>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* Дата */}
          <Card className="p-5 sm:p-6">
            <StepTitle n={1} icon={<CalendarDays className="size-4" />} title="Дата" />
            <div className="mt-4 flex items-center gap-2">
              <button disabled={dayOffset === 0} onClick={() => setDayOffset((o) => Math.max(0, o - 5))} className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/5 text-ink-200 disabled:opacity-30" aria-label="Раніше">
                <ChevronLeft className="size-4" />
              </button>
              <div className="grid flex-1 grid-cols-5 gap-2 sm:grid-cols-10">
                {visibleDays.map((d, i) => {
                  const dt = new Date(`${d}T12:00:00Z`);
                  const active = d === date;
                  return (
                    <button
                      key={d}
                      onClick={() => setDate(d)}
                      className={cn(
                        'relative rounded-2xl border px-1 py-2.5 text-center transition-all',
                        i >= 5 && 'hidden sm:block',
                        active ? 'border-transparent text-ink-950' : 'border-white/8 bg-white/[0.02] text-ink-200 hover:border-white/20',
                      )}
                    >
                      {active && <motion.span layoutId="day-pill" className="gold-gradient absolute inset-0 rounded-2xl" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                      <span className="relative block text-[10px] uppercase tracking-wider opacity-70">
                        {d === isoDay() ? 'Сьог.' : new Intl.DateTimeFormat('uk-UA', { weekday: 'short', timeZone: 'UTC' }).format(dt)}
                      </span>
                      <span className="relative block font-display text-xl">{dt.getUTCDate()}</span>
                      <span className="relative block text-[10px] opacity-70">{new Intl.DateTimeFormat('uk-UA', { month: 'short', timeZone: 'UTC' }).format(dt)}</span>
                    </button>
                  );
                })}
              </div>
              <button disabled={dayOffset >= days.length - 10} onClick={() => setDayOffset((o) => o + 5)} className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/5 text-ink-200 disabled:opacity-30" aria-label="Пізніше">
                <ChevronRight className="size-4" />
              </button>
            </div>
          </Card>

          {/* Гості та зона */}
          <Card className="grid gap-6 p-5 sm:grid-cols-[auto_1fr] sm:p-6">
            <div>
              <StepTitle n={2} icon={<Users className="size-4" />} title="Гості" />
              <div className="mt-4 flex items-center gap-3">
                <button onClick={() => setGuests((g) => Math.max(1, g - 1))} disabled={guests <= 1} className="grid size-11 place-items-center rounded-2xl bg-white/5 text-cream transition hover:bg-white/10 disabled:opacity-30" aria-label="Менше гостей">
                  <Minus className="size-4" />
                </button>
                <div className="w-16 text-center">
                  <motion.div key={guests} initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="font-display text-4xl text-cream">
                    {guests}
                  </motion.div>
                </div>
                <button onClick={() => setGuests((g) => Math.min(maxParty, g + 1))} disabled={guests >= maxParty} className="grid size-11 place-items-center rounded-2xl bg-white/5 text-cream transition hover:bg-white/10 disabled:opacity-30" aria-label="Більше гостей">
                  <Plus className="size-4" />
                </button>
              </div>
              <div className="mt-2 text-xs text-ink-400">Тривалість візиту: {availability.data?.durationMin ?? '…'} хв</div>
            </div>
            <div>
              <StepTitle n={3} icon={<Sparkles className="size-4" />} title="Бажана зона" />
              <div className="mt-4 flex flex-wrap gap-2">
                <Chip active={zone === null} onClick={() => setZone(null)}>
                  Будь-яка
                </Chip>
                {(Object.keys(ZONES) as TableZone[]).map((z) => (
                  <Chip key={z} active={zone === z} onClick={() => setZone(z)}>
                    {ZONES[z].label}
                  </Chip>
                ))}
              </div>
            </div>
          </Card>

          {/* Слоти */}
          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <StepTitle n={4} icon={<Clock className="size-4" />} title={`Час · ${relativeDay(date)}`} />
              {availability.data && (
                <span className="text-xs text-ink-400">
                  {availability.data.opensAt}–{availability.data.closesAt} · вільних слотів: {availability.data.availableCount}
                </span>
              )}
            </div>
            {availability.isLoading ? (
              <div className="mt-5 grid grid-cols-4 gap-2 sm:grid-cols-6">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-2xl" />
                ))}
              </div>
            ) : availability.error ? (
              <div className="mt-5 rounded-2xl bg-rose-500/10 p-4 text-sm text-rose-200">{toApiError(availability.error).message}</div>
            ) : groups.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-ink-300">На цю дату вільних слотів не залишилось — спробуйте інший день.</div>
            ) : (
              <div className="mt-5 space-y-6">
                {groups.map((g) => (
                  <div key={g.title}>
                    <div className="mb-2.5 text-xs font-medium uppercase tracking-wider text-ink-400">{g.title}</div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-6">
                      {g.slots.map((s) => {
                        const active = slot?.startAt === s.startAt;
                        const hot = s.available && s.tablesLeft <= 2;
                        return (
                          <button
                            key={s.startAt}
                            disabled={!s.available}
                            onClick={() => setSlot(s)}
                            className={cn(
                              'group relative overflow-hidden rounded-2xl border px-2 py-3 text-center transition-all',
                              active
                                ? 'border-transparent text-ink-950 shadow-[0_8px_30px_-8px_rgb(220_171_74/0.7)]'
                                : s.available
                                  ? 'border-white/10 bg-white/[0.025] text-cream hover:-translate-y-0.5 hover:border-gold-300/50'
                                  : 'cursor-not-allowed border-white/5 text-ink-600',
                            )}
                          >
                            {active && <motion.span layoutId="slot-pill" className="gold-gradient absolute inset-0" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
                            <span className={cn('relative block font-display text-lg tabular-nums', !s.available && 'line-through')}>{s.time}</span>
                            <span className={cn('relative mt-0.5 block text-[10px]', active ? 'text-ink-900/70' : hot ? 'text-amber-300' : 'text-ink-400')}>
                              {!s.available ? 'зайнято' : hot ? `останні ${s.tablesLeft}` : `${s.tablesLeft} столиків`}
                            </span>
                            {s.available && !active && (
                              <span className="absolute inset-x-3 bottom-1 h-0.5 overflow-hidden rounded-full bg-white/5">
                                <span className={cn('block h-full rounded-full', s.load > 0.7 ? 'bg-amber-400/70' : 'bg-gold-400/50')} style={{ width: `${Math.max(8, s.load * 100)}%` }} />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {alternatives.length > 0 && (
              <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
                <div className="text-sm text-amber-100">Цей час щойно зайняли. Найближчі вільні варіанти:</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {alternatives.map((a) => (
                    <Chip
                      key={a.startAt}
                      onClick={() => {
                        const s = availability.data?.slots.find((x) => x.startAt === a.startAt);
                        if (s) setSlot(s);
                        setAlternatives([]);
                      }}
                    >
                      {a.time}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* План залу */}
          <AnimatePresence>
            {slot && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}>
                <Card className="p-5 sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <StepTitle n={5} icon={<Wand2 className="size-4" />} title="Столик на плані залу" />
                    <span className="text-xs text-ink-400">Натисніть на вільний столик, щоб обрати інший</span>
                  </div>
                  <div className="mt-5">
                    {tables.data ? (
                      <FloorPlan
                        tables={tables.data.tables}
                        visual={visual}
                        onSelect={(t) => t.state === 'FREE' && setTableId(t.id)}
                        legend={
                          <>
                            <LegendDot className="border-gold-300 bg-gold-400/30">Рекомендовано</LegendDot>
                            <LegendDot className="border-white/30 bg-ink-800">Вільно</LegendDot>
                            <LegendDot className="border-white/5 bg-ink-850">Зайнято</LegendDot>
                            <LegendDot className="border-white/5 bg-ink-900 opacity-50">Замалий</LegendDot>
                          </>
                        }
                      />
                    ) : (
                      <Skeleton className="aspect-[16/10] w-full rounded-3xl" />
                    )}
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Підсумок */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Card className="overflow-hidden">
            <div className="relative bg-gradient-to-br from-gold-400/15 via-transparent to-transparent p-6">
              <div className="text-xs font-semibold uppercase tracking-[0.25em] text-gold-300">Ваше бронювання</div>
              <div className="mt-3 font-display text-2xl text-cream">{fmtFullDate(`${date}T12:00:00Z`)}</div>
              <div className="mt-1 text-ink-300">
                {slot ? `${slot.time} – ${new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Kyiv' }).format(new Date(slot.endAt))}` : 'Оберіть час'} · {guestsLabel(guests)}
              </div>
            </div>
            <div className="space-y-4 p-6 pt-2">
              {selectedTable ? (
                <div className="rounded-2xl border border-gold-400/20 bg-gold-400/[0.05] p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-display text-xl text-cream">Столик №{selectedTable.number}</div>
                    <span className="text-xs text-gold-200">
                      {ZONES[selectedTable.zone].short} · {selectedTable.seats} місць
                    </span>
                  </div>
                  {selectedTable.reasons.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {(selectedTable.recommended ? selectedTable.reasons : ['Ваш вибір на плані залу']).map((r) => (
                        <li key={r} className="flex items-start gap-2 text-xs text-ink-200">
                          <Check className="mt-0.5 size-3.5 shrink-0 text-gold-300" /> {r}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-2xl bg-white/[0.03] p-4 text-sm text-ink-300">
                  <Info className="mt-0.5 size-4 shrink-0 text-gold-300" />
                  Після вибору часу ми покажемо рекомендований столик на плані залу.
                </div>
              )}
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Побажання: день народження, дитячий стілець, біля вікна…" maxLength={500} className="min-h-20" />
              <Button variant="gold" size="lg" className="w-full" disabled={!slot} loading={book.isPending} onClick={submit}>
                {user ? 'Підтвердити бронювання' : 'Увійти та забронювати'}
              </Button>
              <p className="text-center text-xs leading-relaxed text-ink-400">
                Безкоштовне скасування онлайн — до {config.data?.clientCancelDeadlineMin ?? 60} хв до візиту. Check-in доступний за {config.data?.checkInEarlyMin ?? 60} хв до початку.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <Modal open={Boolean(created)} onClose={() => navigate('/account')} size="sm" hideClose>
        {created && (
          <div className="text-center">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 15 }} className="gold-gradient mx-auto grid size-16 place-items-center rounded-full text-ink-950">
              <Check className="size-8" />
            </motion.div>
            <h3 className="mt-5 font-display text-3xl text-cream">Заявку прийнято!</h3>
            <p className="mt-2 text-sm text-ink-300">
              {relativeDay(isoDay(new Date(created.startAt)))} о {created.time} · столик №{created.table.number} · {guestsLabel(created.guests)}
            </p>
            <div className="mx-auto mt-6 w-fit rounded-3xl bg-cream p-4">
              <QRCodeSVG value={created.qrPayload ?? created.code} size={168} bgColor="#f5f0e8" fgColor="#0d0d11" />
            </div>
            <div className="mt-3 font-mono text-lg tracking-[0.3em] text-gold-200">{created.code}</div>
            <p className="mx-auto mt-4 max-w-xs text-xs text-ink-400">Хостес підтвердить бронювання найближчим часом — ви отримаєте сповіщення. Покажіть цей QR при вході.</p>
            <div className="mt-6 grid gap-2">
              <Button variant="gold" onClick={() => navigate(`/account/reservations/${created.id}`)}>
                Деталі бронювання
              </Button>
              <Link to="/menu" className="py-2 text-sm text-ink-300 hover:text-cream">
                Переглянути меню
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function StepTitle({ n, icon, title }: { n: number; icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-8 place-items-center rounded-xl bg-gold-400/10 text-gold-300 ring-1 ring-gold-400/20">{icon}</span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ink-500">Крок {n}</span>
      <span className="font-display text-xl text-cream">{title}</span>
    </div>
  );
}
