import { useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, Search, CalendarX2 } from 'lucide-react';
import { Card, EmptyState, Input, SectionTitle, Segmented, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { ReservationRow } from '@/components/domain/StaffCards';
import { NewReservationModal } from '@/components/domain/StaffModals';
import { useStaffReservations } from '@/lib/staff';
import { addDays, fmtFullDate, isoDay } from '@/lib/format';
import type { ReservationStatus } from '@/lib/types';

type Filter = 'all' | 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'DONE';

export default function StaffReservations() {
  const [date, setDate] = useState(isoDay());
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useStaffReservations({ date, search: search || undefined });

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of data ?? []) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [data]);
  const done: ReservationStatus[] = ['COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW'];
  const list = (data ?? []).filter((r) => (filter === 'all' ? true : filter === 'DONE' ? done.includes(r.status) : r.status === filter));
  const guests = (data ?? []).filter((r) => !['CANCELLED', 'REJECTED', 'NO_SHOW'].includes(r.status)).reduce((s, r) => s + r.guests, 0);

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Бронювання"
        title={<span>{fmtFullDate(`${date}T12:00:00Z`)}</span>}
        subtitle={`${data?.length ?? 0} бронювань · очікується ${guests} гостей`}
        action={
          <Button variant="gold" icon={<CalendarPlus className="size-4" />} onClick={() => setCreating(true)}>
            Бронювання по телефону
          </Button>
        }
      />
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={() => setDate((d) => addDays(d, -1))} aria-label="Попередній день">
            <ChevronLeft className="size-4" />
          </Button>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-10 rounded-xl border border-white/8 bg-white/[0.03] px-3 text-sm text-cream outline-none" />
          <Button size="icon" variant="ghost" onClick={() => setDate((d) => addDays(d, 1))} aria-label="Наступний день">
            <ChevronRight className="size-4" />
          </Button>
          {date !== isoDay() && (
            <Button size="sm" variant="ghost" onClick={() => setDate(isoDay())}>
              Сьогодні
            </Button>
          )}
        </div>
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Усі', count: data?.length },
            { value: 'PENDING', label: 'Нові', count: counts.PENDING ?? 0 },
            { value: 'CONFIRMED', label: 'Підтверджені', count: counts.CONFIRMED ?? 0 },
            { value: 'CHECKED_IN', label: 'У залі', count: counts.CHECKED_IN ?? 0 },
            { value: 'DONE', label: 'Архів' },
          ]}
        />
        <div className="min-w-52 flex-1">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Імʼя, телефон або код R-…" icon={<Search className="size-4" />} />
        </div>
      </Card>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState icon={<CalendarX2 className="size-7" />} title="Бронювань немає" text="Змініть дату або фільтр." />
      ) : (
        <div className="space-y-2">
          {list.map((r) => (
            <ReservationRow key={r.id} r={r} />
          ))}
        </div>
      )}
      <NewReservationModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}
