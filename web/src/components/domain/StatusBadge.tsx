import { Badge } from '@/components/ui/primitives';
import { ORDER_STATUS, RESERVATION_STATUS } from '@/lib/constants';
import type { OrderStatus, ReservationStatus } from '@/lib/types';

export function ReservationBadge({ status, className }: { status: ReservationStatus; className?: string }) {
  const s = RESERVATION_STATUS[status];
  return (
    <Badge tone={s.tone} pulse={status === 'PENDING' || status === 'CHECKED_IN'} className={className}>
      {s.label}
    </Badge>
  );
}

export function OrderBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const s = ORDER_STATUS[status];
  return (
    <Badge tone={s.tone} pulse={status === 'PREPARING' || status === 'READY' || status === 'NEW'} className={className}>
      {s.label}
    </Badge>
  );
}
