import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Dish, LiveTable, Order, OrderItemStatus, OrderStatus, Reservation, ReservationStatus, Role, User } from '../api/types';
import { useToast } from './toast';
import { haptic } from './notify';
import { placeOf } from './status';

/** Дані та дії робочих ролей (офіціант, кухар, адміністратор) — ті самі endpoints, що й у Web-панелі. */

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
  delivery?: { total: number; inKitchen: number; waitingCourier: number; onTheWay: number; delivered: number };
}

export interface Overview {
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
  delivery?: {
    orders: number;
    delivered: number;
    cancelled: number;
    revenue: number;
    share: number;
    fees: number;
    avgDeliveryMin: number;
    byZone: { zone: string; orders: number; revenue: number }[];
  };
}

export const useToday = () => useQuery({ queryKey: ['today'], queryFn: () => api.get<TodayStats>('/analytics/today'), refetchInterval: 60_000 });
export const useLiveTables = () => useQuery({ queryKey: ['tables-live'], queryFn: () => api.get<LiveTable[]>('/tables/live'), refetchInterval: 60_000 });
export const useStaffOrders = (params: Record<string, unknown> = {}, enabled = true) =>
  useQuery({ queryKey: ['orders', 'staff', params], queryFn: () => api.get<Order[]>('/orders', params), refetchInterval: 45_000, enabled });
export const useStaffReservations = (params: Record<string, unknown>) =>
  useQuery({ queryKey: ['reservations', 'staff', params], queryFn: () => api.get<Reservation[]>('/reservations', params) });
export const useKitchenOrders = () => useQuery({ queryKey: ['kitchen'], queryFn: () => api.get<Order[]>('/kitchen/orders'), refetchInterval: 30_000 });
export const useOverview = (days: number) => useQuery({ queryKey: ['analytics', days], queryFn: () => api.get<Overview>('/analytics/overview', { days }) });
export const useAllDishes = () => useQuery({ queryKey: ['dishes', 'all'], queryFn: () => api.get<Dish[]>('/dishes') });
export const useUsers = (params: Record<string, unknown>) =>
  useQuery({ queryKey: ['users', params], queryFn: () => api.get<{ total: number; items: User[] }>('/users', { pageSize: 50, ...params }) });

const STAFF_KEYS = ['orders', 'order', 'reservations', 'reservation', 'tables-live', 'today', 'kitchen', 'current-visit'];

function useInvalidate() {
  const qc = useQueryClient();
  return () => STAFF_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

const RES_SUCCESS: Partial<Record<ReservationStatus, string>> = {
  CONFIRMED: 'Бронювання підтверджено',
  REJECTED: 'Бронювання відхилено',
  CHECKED_IN: 'Гостей посаджено (check-in)',
  COMPLETED: 'Візит завершено — столик вільний',
  NO_SHOW: 'Позначено «не прийшов»',
  CANCELLED: 'Бронювання скасовано',
};

export function useReservationAction() {
  const invalidate = useInvalidate();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: number; status: ReservationStatus; reason?: string }) => api.patch<Reservation>(`/reservations/${id}/status`, { status, reason }),
    onSuccess: (r) => {
      haptic.success();
      toast({ title: RES_SUCCESS[r.status] ?? 'Статус оновлено', body: `${r.code} · столик №${r.table.number}`, tone: 'success' });
      invalidate();
    },
    onError: (e) => {
      haptic.error();
      toast({ title: (e as Error).message, tone: 'danger' });
    },
  });
}

const ORDER_SUCCESS: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'Прийнято й передано на кухню',
  PREPARING: 'Кухня почала готувати',
  READY: 'Замовлення готове',
  SERVED: 'Страви подано гостям',
  CANCELLED: 'Замовлення скасовано',
};

export function useOrderAction() {
  const invalidate = useInvalidate();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, status, reason }: { id: number; status: OrderStatus; reason?: string }) => api.patch<Order>(`/orders/${id}/status`, { status, reason }),
    onSuccess: (o) => {
      haptic.success();
      toast({ title: ORDER_SUCCESS[o.status] ?? 'Статус оновлено', body: `#${o.id} · ${placeOf(o)}`, tone: 'success' });
      invalidate();
    },
    onError: (e) => {
      haptic.error();
      toast({ title: (e as Error).message, tone: 'danger' });
    },
  });
}

export function useCashPayment() {
  const invalidate = useInvalidate();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ orderId, tip }: { orderId: number; tip: number }) => api.post('/payments/cash', { orderId, tip }),
    onSuccess: () => {
      haptic.success();
      toast({ title: 'Оплату готівкою зафіксовано', tone: 'success' });
      invalidate();
    },
    onError: (e) => {
      haptic.error();
      toast({ title: (e as Error).message, tone: 'danger' });
    },
  });
}

export function useItemStatus() {
  const invalidate = useInvalidate();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ orderId, itemId, status }: { orderId: number; itemId: number; status: OrderItemStatus }) => api.patch<Order>(`/kitchen/orders/${orderId}/items/${itemId}`, { status }),
    onSuccess: (o) => {
      if (o.status === 'READY') {
        haptic.success();
        toast({ title: `Замовлення #${o.id} готове`, body: o.table ? `Столик №${o.table.number} — офіціант отримав сигнал` : 'Доставка — курʼєр отримав сигнал', tone: 'success' });
      } else haptic.light();
      invalidate();
    },
    onError: (e) => {
      haptic.error();
      toast({ title: (e as Error).message, tone: 'danger' });
    },
  });
}

export function useAvailability() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, isAvailable }: { id: number; isAvailable: boolean }) => api.patch<Dish>(`/dishes/${id}/availability`, { isAvailable }),
    onSuccess: (d) => {
      haptic.light();
      toast({ title: d.isAvailable ? `«${d.name}» знову в меню` : `«${d.name}» у стоп-листі`, tone: d.isAvailable ? 'success' : 'warning' });
      ['dishes', 'dish', 'recommendations'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => toast({ title: (e as Error).message, tone: 'danger' }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: number; role?: Role; isActive?: boolean }) => api.patch<User>(`/users/${id}`, data),
    onSuccess: (u) => {
      haptic.success();
      toast({ title: 'Користувача оновлено', body: `${u.name} · ${ROLE_LABEL[u.role]}${u.isActive === false ? ' · деактивовано' : ''}`, tone: 'success' });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => {
      haptic.error();
      toast({ title: (e as Error).message, tone: 'danger' });
    },
  });
}

export const ROLE_LABEL: Record<Role, string> = { CLIENT: 'Гість', STAFF: 'Офіціант', KITCHEN: 'Кухар', ADMIN: 'Адміністратор', COURIER: 'Курʼєр' };

/** Перемальовує компонент кожні `ms` мілісекунд (таймери на кухні, «хв тому»). */
export function useTick(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
