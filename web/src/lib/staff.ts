import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from './api';
import type { LiveTable, Order, OrderStatus, Reservation, ReservationStatus } from './types';

export const useLiveTables = () =>
  useQuery({ queryKey: ['tables-live'], queryFn: () => api.get<LiveTable[]>('/tables/live'), refetchInterval: 60_000 });

export interface TodayStats {
  date: string;
  reservations: { total: number; byStatus: Record<string, number>; expectedGuests: number; pending: number };
  orders: { total: number; byStatus: Record<string, number>; active: number };
  revenue: number;
  tips: number;
  paymentsCount: number;
  avgCheck: number;
  avgPrepMin: number | null;
  tables: { total: number; occupied: number };
  guestsInHouse: number;
}

export const useToday = () => useQuery({ queryKey: ['today'], queryFn: () => api.get<TodayStats>('/analytics/today'), refetchInterval: 60_000 });

export const useStaffOrders = (params: Record<string, unknown> = {}, enabled = true) =>
  useQuery({ queryKey: ['orders', params], queryFn: () => api.get<Order[]>('/orders', params), refetchInterval: 45_000, enabled });

export const useStaffReservations = (params: Record<string, unknown>) =>
  useQuery({ queryKey: ['reservations', params], queryFn: () => api.get<Reservation[]>('/reservations', params) });

function useInvalidate() {
  const qc = useQueryClient();
  return () => ['orders', 'reservations', 'tables-live', 'today', 'kitchen', 'reservation', 'order'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

const RES_SUCCESS: Partial<Record<ReservationStatus, string>> = {
  CONFIRMED: 'Бронювання підтверджено',
  REJECTED: 'Бронювання відхилено',
  CHECKED_IN: 'Гостей зареєстровано (check-in)',
  COMPLETED: 'Візит завершено — столик вільний',
  NO_SHOW: 'Позначено «не прийшов»',
  CANCELLED: 'Бронювання скасовано',
};

export function useReservationAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: number; status: ReservationStatus; reason?: string }) => api.patch<Reservation>(`/reservations/${id}/status`, { status, reason }),
    onSuccess: (r) => {
      toast.success(RES_SUCCESS[r.status] ?? 'Статус оновлено', { description: `${r.code} · столик №${r.table.number}` });
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

const ORDER_SUCCESS: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'Замовлення прийнято й передано на кухню',
  PREPARING: 'Кухня почала готувати',
  READY: 'Замовлення готове',
  SERVED: 'Страви подано гостям',
  CANCELLED: 'Замовлення скасовано',
};

export function useOrderAction() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: number; status: OrderStatus; reason?: string }) => api.patch<Order>(`/orders/${id}/status`, { status, reason }),
    onSuccess: (o) => {
      toast.success(ORDER_SUCCESS[o.status] ?? 'Статус оновлено', { description: `#${o.id} · столик №${o.table.number}` });
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useCashPayment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ orderId, tip }: { orderId: number; tip: number }) => api.post('/payments/cash', { orderId, tip }),
    onSuccess: () => {
      toast.success('Оплату зафіксовано');
      invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
