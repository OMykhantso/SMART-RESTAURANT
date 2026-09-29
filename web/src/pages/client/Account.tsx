import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import { CalendarPlus, ChevronRight, ClipboardList, Clock, History, QrCode, Receipt, Save, Smartphone, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/Button';
import { Avatar, Card, EmptyState, Field, Input, Segmented, Skeleton } from '@/components/ui/primitives';
import { OrderBadge, ReservationBadge } from '@/components/domain/StatusBadge';
import { DishImage } from '@/components/domain/DishImage';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCurrentVisit, useMyOrders } from '@/lib/queries';
import { fmtDateShort, fmtDayNum, fmtFullDate, fmtMonthShort, guestsLabel, money } from '@/lib/format';
import { ZONES } from '@/lib/constants';
import type { Reservation } from '@/lib/types';

type Tab = 'visits' | 'orders' | 'profile';

export default function Account() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('visits');
  const visit = useCurrentVisit();
  const reservations = useQuery({ queryKey: ['my-reservations'], queryFn: () => api.get<Reservation[]>('/reservations/my', { scope: 'all' }) });
  const orders = useMyOrders();

  const upcoming = (reservations.data ?? []).filter((r) => ['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(r.status));
  const past = (reservations.data ?? []).filter((r) => !['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(r.status));
  const spent = (orders.data ?? []).filter((o) => o.status === 'PAID').reduce((s, o) => s + o.total, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-24 pt-32 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          <Avatar name={user?.name} className="size-16 text-lg" />
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-300">Особистий кабінет</div>
            <h1 className="mt-1 font-display text-4xl text-cream">Вітаємо, {user?.name.split(' ')[0]}!</h1>
          </div>
        </div>
        <Button variant="gold" icon={<CalendarPlus className="size-4" />} onClick={() => navigate('/booking')}>
          Нове бронювання
        </Button>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <MiniStat label="Візитів" value={past.filter((r) => r.status === 'COMPLETED').length} icon={<History className="size-4" />} />
        <MiniStat label="Замовлень" value={orders.data?.length ?? 0} icon={<ClipboardList className="size-4" />} />
        <MiniStat label="Витрачено" value={money(spent)} icon={<Receipt className="size-4" />} />
      </div>

      {visit.data?.active && <ActiveVisit reservation={visit.data.active} />}

      <div className="mt-10">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'visits', label: 'Бронювання', count: upcoming.length || undefined },
            { value: 'orders', label: 'Замовлення' },
            { value: 'profile', label: 'Профіль' },
          ]}
        />
      </div>

      <div className="mt-6">
        {tab === 'visits' && (
          <div className="space-y-10">
            <section>
              <h2 className="mb-4 font-display text-2xl text-cream">Майбутні</h2>
              {reservations.isLoading ? (
                <Skeleton className="h-32" />
              ) : upcoming.length === 0 ? (
                <EmptyState icon={<CalendarPlus className="size-7" />} title="Немає активних бронювань" text="Оберіть зручний час — ми підберемо найкращий столик." action={<Link to="/booking"><Button variant="gold">Забронювати</Button></Link>} />
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {upcoming.map((r) => (
                    <ReservationCard key={r.id} r={r} />
                  ))}
                </div>
              )}
            </section>
            {past.length > 0 && (
              <section>
                <h2 className="mb-4 font-display text-2xl text-cream">Історія візитів</h2>
                <div className="grid gap-3">
                  {past.map((r) => (
                    <Link key={r.id} to={`/account/reservations/${r.id}`} className="glass flex items-center gap-4 rounded-2xl p-4 transition hover:border-white/15">
                      <div className="w-16 text-center">
                        <div className="font-display text-2xl text-cream">{fmtDayNum(r.startAt)}</div>
                        <div className="text-[10px] uppercase text-ink-400">{fmtMonthShort(r.startAt)}</div>
                      </div>
                      <div className="flex-1">
                        <div className="text-sm text-cream">
                          {r.time} · столик №{r.table.number} · {guestsLabel(r.guests)}
                        </div>
                        <div className="text-xs text-ink-400">{r.ordersTotal > 0 ? `Рахунок ${money(r.ordersTotal)}` : r.code}</div>
                      </div>
                      <ReservationBadge status={r.status} />
                      <ChevronRight className="size-4 text-ink-500" />
                    </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        {tab === 'orders' &&
          (orders.isLoading ? (
            <Skeleton className="h-40" />
          ) : !orders.data?.length ? (
            <EmptyState icon={<UtensilsCrossed className="size-7" />} title="Замовлень ще немає" text="Після check-in за столиком ви зможете замовляти прямо зі смартфона." />
          ) : (
            <div className="grid gap-3">
              {orders.data.map((o) => (
                <Link key={o.id} to={`/account/orders/${o.id}`} className="glass flex items-center gap-4 rounded-2xl p-3 pr-4 transition hover:border-white/15">
                  <div className="flex -space-x-3">
                    {o.items.slice(0, 3).map((i) => (
                      <DishImage key={i.id} src={i.imageUrl} alt={i.name} category={i.category.slug} className="size-12 ring-2 ring-ink-900" rounded="rounded-full" zoom={false} />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-cream">
                      #{o.id} · {o.items.map((i) => i.name).join(', ')}
                    </div>
                    <div className="text-xs text-ink-400">
                      {fmtDateShort(o.createdAt)} · столик №{o.table.number} · {o.itemsCount} поз.
                    </div>
                  </div>
                  <div className="hidden text-right sm:block">
                    <div className="text-sm font-semibold text-gold-100">{money(o.total)}</div>
                  </div>
                  <OrderBadge status={o.status} />
                </Link>
              ))}
            </div>
          ))}

        {tab === 'profile' && <Profile />}
      </div>
    </div>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <div className="grid size-11 place-items-center rounded-2xl bg-gold-400/10 text-gold-300 ring-1 ring-gold-400/20">{icon}</div>
      <div>
        <div className="text-xs uppercase tracking-wider text-ink-400">{label}</div>
        <div className="font-display text-2xl text-cream">{value}</div>
      </div>
    </Card>
  );
}

function ActiveVisit({ reservation }: { reservation: Reservation }) {
  const navigate = useNavigate();
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="relative mt-8 overflow-hidden p-6 ring-1 ring-emerald-400/20">
        <div className="pointer-events-none absolute -right-16 -top-16 size-64 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
              <span className="size-2 animate-pulse rounded-full bg-emerald-400" /> Ви зараз у ресторані
            </div>
            <div className="mt-2 font-display text-3xl text-cream">Столик №{reservation.table.number}</div>
            <div className="mt-1 text-sm text-ink-300">
              {ZONES[reservation.table.zone].label} · до {reservation.endTime} · замовлень: {reservation.ordersCount}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="glass" onClick={() => navigate(`/account/reservations/${reservation.id}`)}>
              Рахунок
            </Button>
            <Button variant="gold" icon={<UtensilsCrossed className="size-4" />} onClick={() => navigate('/order')}>
              Замовити
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function ReservationCard({ r }: { r: Reservation }) {
  return (
    <Link to={`/account/reservations/${r.id}`} className="group">
      <Card className="flex h-full gap-5 p-5 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:border-gold-400/25">
        <div className="shrink-0 rounded-2xl bg-cream p-2">{r.qrPayload ? <QRCodeSVG value={r.qrPayload} size={84} bgColor="#f5f0e8" fgColor="#0d0d11" /> : <QrCode className="size-20 text-ink-900" />}</div>
        <div className="min-w-0 flex-1">
          <ReservationBadge status={r.status} />
          <div className="mt-3 font-display text-2xl text-cream">{fmtFullDate(r.startAt)}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-300">
            <span className="flex items-center gap-1">
              <Clock className="size-3.5" /> {r.time}–{r.endTime}
            </span>
            <span>столик №{r.table.number}</span>
            <span>{guestsLabel(r.guests)}</span>
          </div>
          <div className="mt-3 font-mono text-xs tracking-[0.25em] text-gold-300">{r.code}</div>
        </div>
      </Card>
    </Link>
  );
}

function Profile() {
  const { user, refreshUser } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [pw, setPw] = useState({ current: '', next: '' });
  const save = useMutation({
    mutationFn: () => api.patch('/auth/me', { name, phone: phone || null }),
    onSuccess: async () => {
      await refreshUser();
      qc.invalidateQueries();
      toast.success('Профіль оновлено');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const changePw = useMutation({
    mutationFn: () => api.post('/auth/change-password', { currentPassword: pw.current, newPassword: pw.next }),
    onSuccess: () => {
      toast.success('Пароль змінено. Інші сесії завершено.');
      setPw({ current: '', next: '' });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="space-y-4 p-6">
        <h3 className="font-display text-xl text-cream">Особисті дані</h3>
        <Field label="Імʼя">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Телефон">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+380…" />
        </Field>
        <Field label="Email" hint="Email змінити не можна">
          <Input value={user?.email ?? ''} disabled />
        </Field>
        <Button variant="gold" loading={save.isPending} onClick={() => save.mutate()} icon={<Save className="size-4" />}>
          Зберегти
        </Button>
      </Card>
      <div className="space-y-6">
        <Card className="space-y-4 p-6">
          <h3 className="font-display text-xl text-cream">Безпека</h3>
          <Field label="Поточний пароль">
            <Input type="password" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} />
          </Field>
          <Field label="Новий пароль" hint="Мінімум 8 символів, літера і цифра">
            <Input type="password" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} />
          </Field>
          <Button variant="outline" disabled={!pw.current || !pw.next} loading={changePw.isPending} onClick={() => changePw.mutate()}>
            Змінити пароль
          </Button>
        </Card>
        <Card className="flex items-center gap-4 p-6">
          <div className="grid size-12 place-items-center rounded-2xl bg-gold-400/10 text-gold-300">
            <Smartphone className="size-6" />
          </div>
          <div className="text-sm text-ink-300">
            <div className="font-medium text-cream">Мобільний застосунок</div>
            Увійдіть тим самим акаунтом — бронювання й замовлення синхронізуються миттєво.
          </div>
        </Card>
      </div>
    </div>
  );
}
