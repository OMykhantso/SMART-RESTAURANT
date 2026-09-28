import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Banknote, CalendarCheck2, ChefHat, Clock3, Receipt, Star, Users, UserX } from 'lucide-react';
import { Card, SectionTitle, Segmented, Skeleton, Stat } from '@/components/ui/primitives';
import { DishImage } from '@/components/domain/DishImage';
import { api } from '@/lib/api';
import { RESERVATION_STATUS, SOURCE_LABEL, TONE_CLASSES } from '@/lib/constants';
import { cn, fmtDateShort, money } from '@/lib/format';
import type { ReservationStatus } from '@/lib/types';

interface Overview {
  period: { from: string; to: string; days: number };
  kpis: {
    revenue: number;
    tips: number;
    ordersCount: number;
    paidOrders: number;
    avgCheck: number;
    guests: number;
    reservationsCount: number;
    noShowRate: number;
    cancellationRate: number;
    avgRating: number | null;
    reviewsCount: number;
    avgPrepMin: number;
    avgVisitMin: number;
  };
  deltas: Record<'revenue' | 'ordersCount' | 'avgCheck' | 'guests' | 'reservationsCount', number>;
  revenueByDay: { date: string; revenue: number; orders: number }[];
  ordersByHour: { hour: number; orders: number }[];
  topDishes: { dishId: number; name: string; imageUrl: string | null; quantity: number; revenue: number }[];
  categories: { category: string; emoji: string | null; revenue: number; quantity: number }[];
  reservationsByStatus: { status: ReservationStatus; count: number }[];
  reservationsBySource: { source: keyof typeof SOURCE_LABEL; count: number }[];
}

// Один відтінок (золото бренду) для всіх графіків величин: кожен графік — одна серія.
const GOLD = '#dcab4a';
const GRID = 'rgba(255,255,255,0.06)';
const AXIS = '#72727f';

type Period = '7' | '14' | '30' | '90';

export default function Analytics() {
  const [days, setDays] = useState<Period>('30');
  const { data, isFetching } = useQuery({ queryKey: ['analytics', days], queryFn: () => api.get<Overview>('/analytics/overview', { days }), placeholderData: (prev) => prev });

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="Аналітика" title="Показники ресторану" subtitle={data ? `${fmtDateShort(`${data.period.from}T12:00:00Z`)} — ${fmtDateShort(`${data.period.to}T12:00:00Z`)} · порівняння з попереднім періодом` : ' '} />

      {/* Фільтр — один рядок над усіма графіками */}
      <Segmented
        value={days}
        onChange={setDays}
        options={[
          { value: '7', label: '7 днів' },
          { value: '14', label: '14 днів' },
          { value: '30', label: '30 днів' },
          { value: '90', label: '90 днів' },
        ]}
      />

      {!data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : (
        <div className={cn('space-y-6 transition-opacity', isFetching && 'opacity-60')}>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Stat label="Виручка" value={money(data.kpis.revenue)} delta={data.deltas.revenue} icon={<Banknote className="size-4" />} hint={`+ ${money(data.kpis.tips)} чайових`} />
            <Stat label="Оплачені замовлення" value={data.kpis.paidOrders.toLocaleString('uk-UA')} delta={data.deltas.ordersCount} icon={<Receipt className="size-4" />} />
            <Stat label="Середній чек" value={money(data.kpis.avgCheck)} delta={data.deltas.avgCheck} icon={<Banknote className="size-4" />} />
            <Stat label="Гостей обслуговано" value={data.kpis.guests.toLocaleString('uk-UA')} delta={data.deltas.guests} icon={<Users className="size-4" />} />
            <Stat label="Бронювань" value={data.kpis.reservationsCount} delta={data.deltas.reservationsCount} icon={<CalendarCheck2 className="size-4" />} hint={`скасовано ${data.kpis.cancellationRate}%`} />
            <Stat label="No-show" value={`${data.kpis.noShowRate}%`} icon={<UserX className="size-4" />} hint="частка гостей, що не прийшли" />
            <Stat label="Середня оцінка" value={data.kpis.avgRating ? `${data.kpis.avgRating} ★` : '—'} icon={<Star className="size-4" />} hint={`${data.kpis.reviewsCount} відгуків`} />
            <Stat label="Приготування" value={`${data.kpis.avgPrepMin} хв`} icon={<ChefHat className="size-4" />} hint={`візит у середньому ${data.kpis.avgVisitMin} хв`} />
          </div>

          <Card className="p-5">
            <ChartTitle title="Виручка по днях" subtitle="Сума успішних оплат, ₴" />
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.revenueByDay.map((d) => ({ ...d, uah: d.revenue / 100 }))} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={GOLD} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={GOLD} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d) => fmtDateShort(`${d}T12:00:00Z`)} stroke={AXIS} tickLine={false} axisLine={false} fontSize={11} minTickGap={24} />
                  <YAxis stroke={AXIS} tickLine={false} axisLine={false} fontSize={11} width={56} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}K` : String(v))} />
                  <Tooltip cursor={{ stroke: 'rgba(255,255,255,0.25)', strokeWidth: 1 }} content={<ChartTip format={(p) => [money(p.revenue), `${p.orders} оплат`]} label={(p) => fmtDateShort(`${p.date}T12:00:00Z`)} />} />
                  <Area type="monotone" dataKey="uah" stroke={GOLD} strokeWidth={2} fill="url(#rev)" activeDot={{ r: 5, stroke: '#121217', strokeWidth: 2, fill: GOLD }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <div className="grid gap-6 xl:grid-cols-2">
            <Card className="p-5">
              <ChartTitle title="Навантаження по годинах" subtitle="Кількість замовлень за годиною створення" />
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.ordersByHour} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} stroke={AXIS} tickLine={false} axisLine={false} fontSize={11} interval={1} />
                    <YAxis stroke={AXIS} tickLine={false} axisLine={false} fontSize={11} width={40} allowDecimals={false} />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} content={<ChartTip format={(p) => [`${p.orders} замовлень`]} label={(p) => `${p.hour}:00–${p.hour + 1}:00`} />} />
                    <Bar dataKey="orders" fill={GOLD} radius={[4, 4, 0, 0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-5">
              <ChartTitle title="Топ страв" subtitle="За кількістю проданих порцій" />
              <HBars
                rows={data.topDishes.map((d) => ({
                  key: d.dishId,
                  label: d.name,
                  value: d.quantity,
                  display: `${d.quantity} шт`,
                  hint: money(d.revenue),
                  icon: <DishImage src={d.imageUrl} alt={d.name} className="size-8 shrink-0" rounded="rounded-lg" zoom={false} />,
                }))}
              />
            </Card>

            <Card className="p-5">
              <ChartTitle title="Виручка за категоріями" subtitle="Оплачені страви, ₴" />
              <HBars rows={data.categories.map((c) => ({ key: c.category, label: `${c.emoji ?? ''} ${c.category}`, value: c.revenue, display: money(c.revenue), hint: `${c.quantity} порцій` }))} />
            </Card>

            <Card className="p-5">
              <ChartTitle title="Бронювання" subtitle="Статуси та канали надходження" />
              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2.5">
                  {data.reservationsByStatus
                    .sort((a, b) => b.count - a.count)
                    .map((s) => {
                      const meta = RESERVATION_STATUS[s.status];
                      return (
                        <div key={s.status} className="flex items-center justify-between gap-3 text-sm">
                          <span className="flex items-center gap-2 text-ink-200">
                            <span className={cn('size-2 rounded-full', TONE_CLASSES[meta.tone].dot)} /> {meta.label}
                          </span>
                          <span className="font-semibold tabular-nums text-cream">{s.count}</span>
                        </div>
                      );
                    })}
                </div>
                <HBars rows={data.reservationsBySource.map((s) => ({ key: s.source, label: SOURCE_LABEL[s.source], value: s.count, display: String(s.count) }))} compact />
              </div>
            </Card>
          </div>
          <p className="flex items-center gap-2 text-xs text-ink-500">
            <Clock3 className="size-3.5" /> Дані агрегуються з БД у момент запиту: оплати, замовлення, бронювання, відгуки.
          </p>
        </div>
      )}
    </div>
  );
}

function ChartTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-4">
      <h3 className="font-display text-xl text-cream">{title}</h3>
      <p className="text-xs text-ink-400">{subtitle}</p>
    </div>
  );
}


function ChartTip({ active, payload, format, label }: { active?: boolean; payload?: any[]; format: (p: any) => string[]; label: (p: any) => string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const [main, ...rest] = format(p);
  return (
    <div className="glass-strong rounded-xl px-3 py-2 shadow-xl">
      <div className="text-sm font-semibold text-cream">{main}</div>
      {rest.map((r) => (
        <div key={r} className="text-xs text-ink-300">
          {r}
        </div>
      ))}
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-ink-400">
        <span className="h-0.5 w-3 rounded-full" style={{ background: GOLD }} /> {label(p)}
      </div>
    </div>
  );
}

/** Горизонтальні смуги (HTML): значення на кінці смуги, підказка при наведенні. */
function HBars({ rows, compact }: { rows: { key: string | number; label: string; value: number; display: string; hint?: string; icon?: React.ReactNode }[]; compact?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <div className="py-8 text-center text-sm text-ink-500">Немає даних за період</div>;
  return (
    <ul className={cn(compact ? 'space-y-2.5' : 'space-y-3')}>
      {rows.map((r) => (
        <li key={r.key} className="group flex items-center gap-3" title={r.hint ? `${r.label}: ${r.display} · ${r.hint}` : `${r.label}: ${r.display}`}>
          {r.icon}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate text-ink-200">{r.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-cream">
                {r.display}
                {r.hint && <span className="ml-2 text-xs font-normal text-ink-500">{r.hint}</span>}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.04]">
              <div className="h-full rounded-r-[4px] transition-all duration-700 group-hover:brightness-125" style={{ width: `${(r.value / max) * 100}%`, background: GOLD }} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
