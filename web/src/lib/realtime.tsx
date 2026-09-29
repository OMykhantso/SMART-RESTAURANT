import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { tokens } from './api';
import { useAuth } from './auth';
import { ORDER_STATUS, RESERVATION_STATUS } from './constants';
import type { OrderStatus, ReservationStatus } from './types';
import { chime } from './sound';

interface RealtimeState {
  socket: Socket | null;
  connected: boolean;
}

const RealtimeContext = createContext<RealtimeState>({ socket: null, connected: false });

/**
 * Єдине WebSocket-зʼєднання застосунку. Події сервера інвалідовують кеш React Query,
 * тож усі екрани (Web ↔ Mobile) синхронізуються без перезавантаження.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const roleRef = useRef(user?.role);
  roleRef.current = user?.role;

  useEffect(() => {
    const s = io({
      path: '/socket.io',
      // функція, щоб при перепідключенні використовувався свіжий access-токен
      auth: (cb) => cb({ token: tokens.access }),
      transports: ['websocket', 'polling'],
    });
    setSocket(s);
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', () => setConnected(false));

    const invalidate = (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

    s.on('order:created', (p: { id: number; status: OrderStatus; tableNumber: number }) => {
      invalidate('orders', 'kitchen', 'tables-live', 'today', 'reservation', 'my-orders', 'current-visit');
      const role = roleRef.current;
      if (role === 'STAFF' || role === 'ADMIN') {
        toast(`Нове замовлення #${p.id}`, { description: `Столик №${p.tableNumber} · ${ORDER_STATUS[p.status].label}` });
        chime('new');
      } else if (role === 'KITCHEN' && p.status === 'CONFIRMED') {
        chime('new');
      }
    });
    s.on('order:updated', (p: { id: number; status: OrderStatus; tableNumber?: number; userId: number | null }) => {
      invalidate('orders', 'order', 'kitchen', 'tables-live', 'today', 'reservation', 'my-orders', 'current-visit', 'analytics');
      const role = roleRef.current;
      if (role === 'CLIENT') {
        const s = ORDER_STATUS[p.status];
        toast(`Замовлення #${p.id}: ${s.label}`, { description: s.hint });
        if (p.status === 'READY') chime('ready');
      } else if ((role === 'STAFF' || role === 'ADMIN') && p.status === 'READY') {
        toast.success(`Замовлення #${p.id} готове до подачі`, { description: p.tableNumber ? `Столик №${p.tableNumber}` : undefined });
        chime('ready');
      } else if (role === 'KITCHEN' && p.status === 'CONFIRMED') {
        toast(`Нове замовлення #${p.id} на кухню`, { description: p.tableNumber ? `Столик №${p.tableNumber}` : undefined });
        chime('new');
      }
    });
    s.on('reservation:created', (p: { code: string }) => {
      invalidate('reservations', 'tables-live', 'today', 'availability', 'booking-tables', 'my-reservations', 'current-visit');
      const role = roleRef.current;
      if (role === 'STAFF' || role === 'ADMIN') {
        toast(`Нове бронювання ${p.code}`);
        chime('soft');
      }
    });
    s.on('reservation:updated', (p: { code: string; status: ReservationStatus }) => {
      invalidate('reservations', 'reservation', 'tables-live', 'today', 'availability', 'booking-tables', 'my-reservations', 'current-visit');
      if (roleRef.current === 'CLIENT') {
        const meta = RESERVATION_STATUS[p.status];
        if (p.status === 'CONFIRMED') toast.success(`Бронювання ${p.code} підтверджено! 🎉`);
        else toast(`Бронювання ${p.code}: ${meta.label}`);
      }
    });
    s.on('tables:changed', () => invalidate('tables-live', 'tables-admin', 'booking-tables', 'today'));
    s.on('menu:changed', () => invalidate('dishes', 'dish', 'categories', 'recommendations'));
    s.on('payment:succeeded', (p: { orderId: number; amount: number; tableNumber: number }) => {
      invalidate('orders', 'order', 'payments', 'today', 'analytics', 'tables-live', 'my-orders', 'reservation', 'current-visit');
      const role = roleRef.current;
      if (role === 'STAFF' || role === 'ADMIN') {
        toast.success(`Оплата замовлення #${p.orderId}`, { description: `Столик №${p.tableNumber}` });
      }
    });

    return () => {
      s.removeAllListeners();
      s.close();
    };
    // перепідключаємося при зміні користувача (новий токен → нові кімнати)
  }, [user?.id, qc]);

  return <RealtimeContext.Provider value={{ socket, connected }}>{children}</RealtimeContext.Provider>;
}

export const useRealtime = () => useContext(RealtimeContext);
