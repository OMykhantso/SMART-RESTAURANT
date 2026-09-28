import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { BookingConfig, Category, Dish, Order, Recommendation, Reservation } from './types';
import { useAuth } from './auth';

export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/categories'), staleTime: 60_000 });

export const useDishes = (params: Record<string, unknown> = {}) =>
  useQuery({ queryKey: ['dishes', params], queryFn: () => api.get<Dish[]>('/dishes', params), staleTime: 30_000 });

export const useBookingConfig = () => useQuery({ queryKey: ['booking-config'], queryFn: () => api.get<BookingConfig>('/booking/config'), staleTime: 300_000 });

export function useCurrentVisit() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['current-visit'],
    queryFn: () => api.get<{ active: Reservation | null; next: Reservation | null }>('/reservations/current'),
    enabled: user?.role === 'CLIENT',
    refetchInterval: 60_000,
  });
}

export function useMyOrders(active?: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-orders', { active }],
    queryFn: () => api.get<Order[]>('/orders/my', active ? { active: true } : {}),
    enabled: Boolean(user),
  });
}

export function useRecommendations(cart: number[], limit = 6) {
  return useQuery({
    queryKey: ['recommendations', cart.join(','), limit],
    queryFn: () => api.get<Recommendation[]>('/recommendations', { cart: cart.join(','), limit }),
    staleTime: 20_000,
  });
}
