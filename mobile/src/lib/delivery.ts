import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dapi } from '../api/client';
import type { Address, AddressInput, CourierLite, CourierSummary, DeliveryOverview, DeliveryZone, Order, PayMethod, Quote } from '../api/types';
import { useToast } from './toast';
import { haptic } from './notify';

/**
 * Хуки служби доставки — усі запити йдуть в окремий сервіс Delivery API (порт 4100).
 * Ключі кешу починаються з 'delivery' / 'courier' / 'dispatch', щоб real-time подія з Delivery API
 * оновлювала лише свої дані.
 */

export const useDeliveryInfo = () =>
  useQuery({ queryKey: ['delivery', 'info'], queryFn: () => dapi.get<DeliveryOverview>('/delivery/info'), staleTime: 30_000, refetchInterval: 120_000 });

export const useZones = (all = false) => useQuery({ queryKey: ['delivery', 'zones', all], queryFn: () => dapi.get<DeliveryZone[]>('/delivery/zones', all ? { all: true } : undefined) });

export const useAddresses = (enabled = true) => useQuery({ queryKey: ['delivery', 'addresses'], queryFn: () => dapi.get<Address[]>('/addresses'), enabled });

export const useMyDeliveries = (enabled = true) =>
  useQuery({ queryKey: ['delivery', 'my'], queryFn: () => dapi.get<Order[]>('/delivery/orders/my'), enabled, refetchInterval: 60_000 });

export const useDelivery = (id: number) =>
  useQuery({ queryKey: ['delivery', 'order', id], queryFn: () => dapi.get<Order>(`/delivery/orders/${id}`), refetchInterval: 30_000 });

export const useQuote = (zoneId: number | null, items: { dishId: number; quantity: number }[]) =>
  useQuery({
    queryKey: ['delivery', 'quote', zoneId, items.map((i) => `${i.dishId}x${i.quantity}`).join(',')],
    queryFn: () => dapi.post<Quote>('/delivery/quote', { zoneId, items }),
    enabled: zoneId !== null && items.length > 0,
    staleTime: 15_000,
  });

export const ACTIVE_DELIVERY = ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERING'];
export const isActiveDelivery = (o: Order) => ACTIVE_DELIVERY.includes(o.status);

export interface PlaceDeliveryInput {
  items: { dishId: number; quantity: number; notes?: string }[];
  addressId?: number;
  address?: AddressInput;
  saveAddressAs?: string;
  recipientName?: string;
  phone: string;
  paymentMethod: PayMethod;
  changeFrom?: number;
  notes?: string;
}

export function usePlaceDelivery() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PlaceDeliveryInput) => dapi.post<Order>('/delivery/orders', input),
    onSuccess: () => {
      haptic.success();
      qc.invalidateQueries({ queryKey: ['delivery'] });
    },
    onError: () => haptic.error(),
  });
}

export function useCancelDelivery() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) => dapi.post<Order>(`/delivery/orders/${id}/cancel`, { reason }),
    onSuccess: (o) => {
      haptic.success();
      qc.invalidateQueries({ queryKey: ['delivery'] });
      qc.invalidateQueries({ queryKey: ['dispatch'] });
      toast({ title: `Замовлення #${o.id} скасовано`, body: o.refunded ? 'Кошти повернуться на картку' : undefined, tone: 'muted' });
    },
    onError: (e) => {
      haptic.error();
      toast({ title: 'Не вдалося скасувати', body: (e as Error).message, tone: 'danger' });
    },
  });
}

export function useAddressMutations() {
  const qc = useQueryClient();
  const toast = useToast();
  const done = () => qc.invalidateQueries({ queryKey: ['delivery', 'addresses'] });
  const fail = (e: unknown) => {
    haptic.error();
    toast({ title: (e as Error).message, tone: 'danger' });
  };
  return {
    create: useMutation({
      mutationFn: (a: AddressInput & { label: string; isDefault?: boolean }) => dapi.post<Address>('/addresses', a),
      onSuccess: () => {
        haptic.success();
        done();
      },
      onError: fail,
    }),
    update: useMutation({
      mutationFn: ({ id, ...a }: Partial<AddressInput> & { id: number; label?: string; isDefault?: boolean }) => dapi.patch<Address>(`/addresses/${id}`, a),
      onSuccess: () => {
        haptic.tap();
        done();
      },
      onError: fail,
    }),
    remove: useMutation({
      mutationFn: (id: number) => dapi.delete(`/addresses/${id}`),
      onSuccess: () => {
        haptic.light();
        done();
      },
      onError: fail,
    }),
  };
}

// ─────────────────────────────── Курʼєр ───────────────────────────────

export const useCourierOrders = (scope: 'available' | 'mine' | 'history') =>
  useQuery({ queryKey: ['courier', scope], queryFn: () => dapi.get<Order[]>('/courier/orders', { scope }), refetchInterval: scope === 'history' ? undefined : 30_000 });

export const useCourierSummary = () => useQuery({ queryKey: ['courier', 'summary'], queryFn: () => dapi.get<CourierSummary>('/courier/summary'), refetchInterval: 60_000 });

const COURIER_SUCCESS = {
  accept: 'Замовлення ваше 🛵',
  release: 'Ви відмовились від замовлення',
  pickup: 'В дорозі! Клієнт отримав сповіщення',
  delivered: 'Доставлено ✓',
} as const;

export function useCourierAction() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, action, tip }: { id: number; action: keyof typeof COURIER_SUCCESS; tip?: number }) =>
      dapi.post<Order>(`/courier/orders/${id}/${action}`, action === 'delivered' ? { tip } : {}),
    onSuccess: (o, v) => {
      if (v.action === 'release') haptic.light();
      else haptic.success();
      qc.invalidateQueries({ queryKey: ['courier'] });
      toast({ title: COURIER_SUCCESS[v.action], body: `#${o.id} · ${o.delivery?.addressLine ?? ''}`, tone: v.action === 'release' ? 'muted' : 'success' });
    },
    onError: (e) => {
      haptic.error();
      qc.invalidateQueries({ queryKey: ['courier'] });
      toast({ title: 'Не вдалося', body: (e as Error).message, tone: 'danger' });
    },
  });
}

// ─────────────────────────────── Диспетчерська (зал / адміністратор) ───────────────────────────────

export const useDispatch = (date?: string) =>
  useQuery({ queryKey: ['dispatch', date ?? 'today'], queryFn: () => dapi.get<Order[]>('/delivery/orders', date ? { date } : undefined), refetchInterval: 30_000 });

export const useCouriers = () => useQuery({ queryKey: ['dispatch', 'couriers'], queryFn: () => dapi.get<CourierLite[]>('/courier/couriers') });

export function useAssignCourier() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, courierId }: { id: number; courierId: number | null }) => dapi.post<Order>(`/delivery/orders/${id}/assign`, { courierId }),
    onSuccess: (o) => {
      haptic.success();
      qc.invalidateQueries({ queryKey: ['dispatch'] });
      toast({ title: o.delivery?.courier ? `Курʼєр: ${o.delivery.courier.name}` : 'Курʼєра знято', body: `Замовлення #${o.id}`, tone: 'success' });
    },
    onError: (e) => {
      haptic.error();
      toast({ title: (e as Error).message, tone: 'danger' });
    },
  });
}

export function useZoneUpdate() {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, ...z }: Partial<DeliveryZone> & { id: number }) => dapi.patch<DeliveryZone>(`/delivery/zones/${id}`, z),
    onSuccess: (z) => {
      haptic.success();
      qc.invalidateQueries({ queryKey: ['delivery'] });
      toast({ title: `Зона «${z.name}» оновлена`, body: z.isActive ? 'Доставка працює' : 'Доставку вимкнено', tone: z.isActive ? 'success' : 'muted' });
    },
    onError: (e) => toast({ title: (e as Error).message, tone: 'danger' }),
  });
}

// ─────────────────────────────── Утиліти ───────────────────────────────

export function etaText(etaAt: string | null | undefined): string | null {
  if (!etaAt) return null;
  const min = Math.round((new Date(etaAt).getTime() - Date.now()) / 60000);
  if (min <= 1) return 'ось-ось';
  return `≈ ${min} хв`;
}

export function mapsUrl(o: Order): string {
  const q = encodeURIComponent(`Київ, ${o.delivery?.street ?? ''} ${o.delivery?.house ?? ''}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export const formatPhone = (p: string) => p.replace(/^\+380(\d{2})(\d{3})(\d{2})(\d{2})$/, '+380 $1 $2 $3 $4');
