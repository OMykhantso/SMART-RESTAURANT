import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { Category, Dish, Order, Recommendation, Reservation } from '../api/types';

export const useCategories = () => useQuery({ queryKey: ['categories'], queryFn: () => api.get<Category[]>('/categories'), staleTime: 60_000 });
export const useDishes = (params: Record<string, unknown> = {}) =>
  useQuery({ queryKey: ['dishes', params], queryFn: () => api.get<Dish[]>('/dishes', params), staleTime: 30_000 });
export const useCurrentVisit = () =>
  useQuery({
    queryKey: ['current-visit'],
    queryFn: () => api.get<{ active: Reservation | null; next: Reservation | null }>('/reservations/current'),
    refetchInterval: 60_000,
  });
export const useMyReservations = (enabled = true) => useQuery({ queryKey: ['reservations', 'my'], queryFn: () => api.get<Reservation[]>('/reservations/my'), enabled });
/** Замовлення в залі (доставки — окремо, з Delivery API: useMyDeliveries). */
export const useMyOrders = (enabled = true) => useQuery({ queryKey: ['orders', 'my'], queryFn: () => api.get<Order[]>('/orders/my', { type: 'DINE_IN' }), enabled });
export const useRecommendations = (cart: number[], limit = 6) =>
  useQuery({ queryKey: ['recommendations', cart.join(','), limit], queryFn: () => api.get<Recommendation[]>('/recommendations', { cart: cart.join(','), limit }), staleTime: 20_000 });
