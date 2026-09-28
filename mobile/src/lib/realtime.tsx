import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { session } from '../api/client';
import { apiConfig } from '../config';
import { useAuth } from './auth';
import { useToast } from './toast';
import { haptic, notify } from './notify';
import { ORDER_META, RESERVATION_META } from './status';
import type { OrderStatus, ReservationStatus } from '../api/types';

const Ctx = createContext<{ connected: boolean }>({ connected: false });

/**
 * WebSocket-звʼязок із сервером: будь-яка зміна з Web-панелі (підтвердження бронювання,
 * статус кухні, оплата) миттєво зʼявляється на телефоні — з банером, вібрацією та сповіщенням.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!user) return;
    const s = io(apiConfig.baseUrl, { transports: ['websocket'], auth: (cb) => cb({ token: session.access }) });
    socketRef.current = s;
    const invalidate = (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));

    s.on('reservation:updated', (p: { code: string; status: ReservationStatus }) => {
      invalidate('reservations', 'reservation', 'current-visit', 'availability');
      const meta = RESERVATION_META[p.status];
      if (p.status === 'CONFIRMED') {
        haptic.success();
        toast({ title: 'Бронювання підтверджено! 🎉', body: `${p.code} · чекаємо на вас`, tone: 'success' });
        notify('Бронювання підтверджено', `${p.code} — чекаємо на вас!`);
      } else {
        toast({ title: `Бронювання ${p.code}`, body: meta.label, tone: meta.tone });
      }
    });
    s.on('reservation:created', () => invalidate('reservations', 'current-visit'));
    s.on('order:created', () => invalidate('orders', 'order', 'current-visit'));
    s.on('order:updated', (p: { id: number; status: OrderStatus }) => {
      invalidate('orders', 'order', 'current-visit', 'reservation');
      const meta = ORDER_META[p.status];
      if (p.status === 'READY') {
        haptic.success();
        notify('Ваше замовлення готове! 🍽', 'Офіціант уже несе страви до вашого столика');
      } else haptic.light();
      toast({ title: `Замовлення #${p.id}: ${meta.label}`, body: meta.hint, tone: meta.tone });
    });
    s.on('payment:succeeded', () => invalidate('orders', 'order', 'current-visit'));
    s.on('menu:changed', () => invalidate('dishes', 'dish', 'recommendations'));

    return () => {
      s.removeAllListeners();
      s.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [user?.id, qc, toast]);

  return <Ctx.Provider value={{ connected }}>{children}</Ctx.Provider>;
}

export const useRealtime = () => useContext(Ctx);
