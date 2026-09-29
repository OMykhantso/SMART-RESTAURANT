import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Plus } from 'lucide-react';
import { SectionTitle, Skeleton } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { OrderCard, useTick } from '@/components/domain/StaffCards';
import { NewOrderModal } from '@/components/domain/StaffModals';
import { useLiveTables, useStaffOrders } from '@/lib/staff';
import { ORDER_STATUS, TONE_CLASSES } from '@/lib/constants';
import { cn, money } from '@/lib/format';
import type { OrderStatus } from '@/lib/types';

const COLUMNS: { status: OrderStatus; title: string }[] = [
  { status: 'NEW', title: 'Нові' },
  { status: 'CONFIRMED', title: 'На кухні' },
  { status: 'PREPARING', title: 'Готуються' },
  { status: 'READY', title: 'Готові до подачі' },
  { status: 'SERVED', title: 'Очікують оплату' },
];

export default function StaffOrders() {
  const now = useTick(20_000);
  const { data, isLoading } = useStaffOrders({});
  const tables = useLiveTables();
  const [pos, setPos] = useState(false);
  const paid = (data ?? []).filter((o) => o.status === 'PAID');

  return (
    <div className="space-y-6">
      <SectionTitle
        eyebrow="Kanban"
        title="Замовлення"
        subtitle={`Сьогодні оплачено ${paid.length} замовлень на ${money(paid.reduce((s, o) => s + o.total, 0))}`}
        action={
          <Button variant="gold" icon={<Plus className="size-4" />} onClick={() => setPos(true)}>
            Нове замовлення
          </Button>
        }
      />
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-8 sm:px-8">
        <div className="grid min-w-[1100px] grid-cols-5 gap-4">
          {COLUMNS.map((col) => {
            const list = (data ?? []).filter((o) => o.status === col.status);
            const tone = TONE_CLASSES[ORDER_STATUS[col.status].tone];
            return (
              <div key={col.status} className="flex flex-col rounded-3xl border border-white/5 bg-white/[0.015] p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className={cn('size-2 rounded-full', tone.dot)} />
                    <span className="text-sm font-medium text-cream">{col.title}</span>
                  </div>
                  <span className={cn('rounded-full px-2 text-xs leading-5 ring-1 ring-inset', tone.badge)}>{list.length}</span>
                </div>
                <div className="flex min-h-40 flex-col gap-3">
                  {isLoading ? (
                    <Skeleton className="h-40" />
                  ) : (
                    <AnimatePresence initial={false}>
                      {list.map((o) => (
                        <motion.div key={o.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                          <OrderCard o={o} now={now} />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  )}
                  {!isLoading && list.length === 0 && <div className="grid flex-1 place-items-center rounded-2xl border border-dashed border-white/6 py-10 text-xs text-ink-500">порожньо</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <NewOrderModal open={pos} onClose={() => setPos(false)} tables={tables.data ?? []} />
    </div>
  );
}
