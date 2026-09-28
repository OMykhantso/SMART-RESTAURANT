import { ORDER_STATUS, RESERVATION_STATUS, ROLE_LABEL } from '@/lib/constants';
import { TONE_CLASSES } from '@/lib/constants';
import { cn, fmtDateTime } from '@/lib/format';
import type { HistoryEntry, OrderStatus, ReservationStatus, Role } from '@/lib/types';

/** Журнал змін статусу (аудит бізнес-процесу) */
export function Timeline({ history, kind }: { history: HistoryEntry[]; kind: 'order' | 'reservation' }) {
  const meta = (s: string) => (kind === 'order' ? ORDER_STATUS[s as OrderStatus] : RESERVATION_STATUS[s as ReservationStatus]);
  return (
    <ol className="relative space-y-4 border-l border-white/8 pl-6">
      {history.map((h, i) => {
        const m = meta(h.to);
        return (
          <li key={i} className="relative">
            <span className={cn('absolute -left-[31px] top-1 size-3 rounded-full ring-4 ring-ink-900', m ? TONE_CLASSES[m.tone].dot : 'bg-ink-400')} />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-medium text-cream">{h.from === h.to ? h.note : (m?.label ?? h.to)}</span>
              <span className="text-xs tabular-nums text-ink-400">{fmtDateTime(h.at)}</span>
            </div>
            <div className="mt-0.5 text-xs text-ink-400">
              {h.actor.name}
              {h.actor.role !== 'SYSTEM' && ROLE_LABEL[h.actor.role as Role] ? ` · ${ROLE_LABEL[h.actor.role as Role]}` : ''}
              {h.note && h.from !== h.to ? ` · ${h.note}` : ''}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
