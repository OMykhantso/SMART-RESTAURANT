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

    const role = user.role;
    const staff = role === 'STAFF' || role === 'ADMIN';
    const kitchen = role === 'KITCHEN';

    s.on('reservation:updated', (p: { code: string; status: ReservationStatus }) => {
      invalidate('reservations', 'reservation', 'current-visit', 'availability', 'tables-live', 'today');
      if (role !== 'CLIENT') return;
      const meta = RESERVATION_META[p.status];
      if (p.status === 'CONFIRMED') {
        haptic.success();
        toast({ title: 'Бронювання підтверджено! 🎉', body: `${p.code} · чекаємо на вас`, tone: 'success' });
        notify('Бронювання підтверджено', `${p.code} — чекаємо на вас!`);
      } else {
        toast({ title: `Бронювання ${p.code}`, body: meta.label, tone: meta.tone });
      }
    });
    s.on('reservation:created', (p: { code: string; status?: ReservationStatus; guests?: number; time?: string }) => {
      invalidate('reservations', 'current-visit', 'tables-live', 'today');
      if (staff) {
        haptic.light();
        toast({ title: `Нове бронювання ${p.code}`, body: p.status === 'PENDING' ? 'Чекає на підтвердження' : undefined, tone: 'warning' });
        if (p.status === 'PENDING') notify('Нове бронювання', `${p.code} — підтвердіть у застосунку`);
      }
    });
    s.on('order:created', (p: { id: number; status: OrderStatus; tableNumber: number }) => {
      invalidate('orders', 'order', 'current-visit', 'kitchen', 'tables-live', 'today');
      if (staff && p.status === 'NEW') {
        haptic.warning();
        toast({ title: `Нове замовлення #${p.id}`, body: `Столик №${p.tableNumber} — прийміть замовлення`, tone: 'warning' });
        notify('Нове замовлення', `Столик №${p.tableNumber} · #${p.id}`);
      } else if (kitchen && p.status === 'CONFIRMED') {
        haptic.warning();
        toast({ title: `На кухню: #${p.id}`, body: `Столик №${p.tableNumber}`, tone: 'info' });
        notify('Нове замовлення на кухню', `Столик №${p.tableNumber} · #${p.id}`);
      }
    });
    s.on('order:updated', (p: { id: number; status: OrderStatus; tableNumber?: number }) => {
      invalidate('orders', 'order', 'current-visit', 'reservation', 'kitchen', 'tables-live', 'today');
      const meta = ORDER_META[p.status];
      if (role === 'CLIENT') {
        if (p.status === 'READY') {
          haptic.success();
          notify('Ваше замовлення готове! 🍽', 'Офіціант уже несе страви до вашого столика');
        } else haptic.light();
        toast({ title: `Замовлення #${p.id}: ${meta.label}`, body: meta.hint, tone: meta.tone });
      } else if (staff && p.status === 'READY') {
        haptic.success();
        toast({ title: `#${p.id} готове до подачі`, body: p.tableNumber ? `Столик №${p.tableNumber}` : undefined, tone: 'success' });
        notify('Страви готові 🛎', p.tableNumber ? `Столик №${p.tableNumber} · #${p.id}` : `#${p.id}`);
      } else if (kitchen && p.status === 'CONFIRMED') {
        haptic.warning();
        toast({ title: `На кухню: #${p.id}`, body: p.tableNumber ? `Столик №${p.tableNumber}` : undefined, tone: 'info' });
        notify('Нове замовлення на кухню', p.tableNumber ? `Столик №${p.tableNumber} · #${p.id}` : `#${p.id}`);
      }
    });
    s.on('payment:succeeded', (p: { orderId: number; tableNumber?: number }) => {
      invalidate('orders', 'order', 'current-visit', 'tables-live', 'today', 'analytics');
      if (staff) toast({ title: `Оплата замовлення #${p.orderId}`, body: p.tableNumber ? `Столик №${p.tableNumber}` : undefined, tone: 'success' });
    });
    s.on('tables:changed', () => invalidate('tables-live', 'today'));
    s.on('menu:changed', () => invalidate('dishes', 'dish', 'recommendations'));

    return () => {
      s.removeAllListeners();
      s.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [user?.id, user?.role, qc, toast]);

  return <Ctx.Provider value={{ connected }}>{children}</Ctx.Provider>;
}

export const useRealtime = () => useContext(Ctx);
