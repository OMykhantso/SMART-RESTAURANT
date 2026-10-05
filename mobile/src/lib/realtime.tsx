import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { io } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { session } from '../api/client';
import { apiConfig } from '../config';
import { useAuth } from './auth';
import { useToast } from './toast';
import { haptic, notify } from './notify';
import { DELIVERY_META, ORDER_META, RESERVATION_META } from './status';
import type { OrderStatus, ReservationStatus } from '../api/types';

const Ctx = createContext<{ connected: boolean; deliveryConnected: boolean }>({ connected: false, deliveryConnected: false });

const place = (tableNumber: number | null | undefined) => (tableNumber ? `Столик №${tableNumber}` : 'Доставка');

/**
 * Два WebSocket-канали — по одному на кожну систему:
 *  - Restaurant API: бронювання, замовлення за столиком, кухня, зал;
 *  - Delivery API: статус доставки (клієнт), черга й призначення (курʼєр), диспетчерська (зал / адмін).
 * Будь-яка зміна з Web-панелі чи кухні миттєво зʼявляється на телефоні — з банером, вібрацією та сповіщенням.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [connected, setConnected] = useState(false);
  const [deliveryConnected, setDeliveryConnected] = useState(false);

  // ─────────── Restaurant API ───────────
  useEffect(() => {
    if (!user || user.role === 'COURIER') return;
    const s = io(apiConfig.baseUrl, { transports: ['websocket'], auth: (cb) => cb({ token: session.access }) });
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
    s.on('reservation:created', (p: { code: string; status?: ReservationStatus }) => {
      invalidate('reservations', 'current-visit', 'tables-live', 'today');
      if (staff) {
        haptic.light();
        toast({ title: `Нове бронювання ${p.code}`, body: p.status === 'PENDING' ? 'Чекає на підтвердження' : undefined, tone: 'warning' });
        if (p.status === 'PENDING') notify('Нове бронювання', `${p.code} — підтвердіть у застосунку`);
      }
    });
    s.on('order:created', (p: { id: number; type?: string; status: OrderStatus; tableNumber: number | null }) => {
      invalidate('orders', 'order', 'current-visit', 'kitchen', 'tables-live', 'today');
      if (staff && p.status === 'NEW') {
        haptic.warning();
        toast({ title: `Нове замовлення #${p.id}`, body: `${place(p.tableNumber)} — прийміть замовлення`, tone: 'warning' });
        notify('Нове замовлення', `${place(p.tableNumber)} · #${p.id}`);
      } else if (kitchen && p.status === 'CONFIRMED') {
        haptic.warning();
        toast({ title: `На кухню: #${p.id}`, body: place(p.tableNumber), tone: 'info' });
        notify('Нове замовлення на кухню', `${place(p.tableNumber)} · #${p.id}`);
      }
    });
    s.on('order:updated', (p: { id: number; type?: string; status: OrderStatus; tableNumber?: number | null }) => {
      invalidate('orders', 'order', 'current-visit', 'reservation', 'kitchen', 'tables-live', 'today');
      const meta = ORDER_META[p.status];
      if (role === 'CLIENT') {
        if (p.status === 'READY') {
          haptic.success();
          notify('Ваше замовлення готове! 🍽', 'Офіціант уже несе страви до вашого столика');
        } else haptic.light();
        toast({ title: `Замовлення #${p.id}: ${meta.label}`, body: meta.hint, tone: meta.tone });
      } else if (staff && p.status === 'READY' && p.type !== 'DELIVERY') {
        haptic.success();
        toast({ title: `#${p.id} готове до подачі`, body: place(p.tableNumber), tone: 'success' });
        notify('Страви готові 🛎', `${place(p.tableNumber)} · #${p.id}`);
      } else if (kitchen && p.status === 'CONFIRMED') {
        haptic.warning();
        toast({ title: `На кухню: #${p.id}`, body: place(p.tableNumber), tone: 'info' });
        notify('Нове замовлення на кухню', `${place(p.tableNumber)} · #${p.id}`);
      }
    });
    s.on('payment:succeeded', (p: { orderId: number; tableNumber?: number | null }) => {
      invalidate('orders', 'order', 'current-visit', 'tables-live', 'today', 'analytics');
      if (staff) toast({ title: `Оплата замовлення #${p.orderId}`, body: place(p.tableNumber), tone: 'success' });
    });
    s.on('tables:changed', () => invalidate('tables-live', 'today'));
    s.on('menu:changed', () => invalidate('dishes', 'dish', 'recommendations'));

    return () => {
      s.removeAllListeners();
      s.close();
      setConnected(false);
    };
  }, [user?.id, user?.role, qc, toast]);

  // ─────────── Delivery API ───────────
  useEffect(() => {
    if (!user || user.role === 'KITCHEN') return;
    const s = io(apiConfig.deliveryUrl, { transports: ['websocket'], auth: (cb) => cb({ token: session.access }) });
    s.on('connect', () => setDeliveryConnected(true));
    s.on('disconnect', () => setDeliveryConnected(false));
    const role = user.role;

    s.on('delivery:updated', (p: { id: number; event: string; status: OrderStatus; courier: { id: number; name: string } | null }) => {
      qc.invalidateQueries({ queryKey: ['delivery'] });
      qc.invalidateQueries({ queryKey: ['dispatch'] });
      qc.invalidateQueries({ queryKey: ['courier'] });
      if (role === 'CLIENT') {
        const meta = DELIVERY_META[p.status];
        if (p.status === 'DELIVERING') {
          haptic.success();
          notify('Курʼєр уже в дорозі 🛵', p.courier ? `${p.courier.name} везе замовлення #${p.id}` : `Замовлення #${p.id}`);
        } else if (p.status === 'DELIVERED') {
          haptic.success();
          notify('Доставлено! Смачного 🍽', `Замовлення #${p.id} — оцініть, будь ласка, доставку`);
        } else if (p.status === 'CANCELLED') haptic.warning();
        else haptic.light();
        if (p.status !== 'NEW') toast({ title: `Доставка #${p.id}: ${meta.label}`, body: meta.hint, tone: meta.tone });
      } else if (role === 'COURIER' && p.courier?.id === user.id && p.status === 'READY') {
        haptic.warning();
        toast({ title: `#${p.id} готове — забирайте!`, body: 'Кухня запакувала замовлення', tone: 'success' });
        notify('Замовлення готове 🛵', `#${p.id} чекає на видачі`);
      } else if (role === 'COURIER' && p.courier?.id === user.id && p.status === 'CANCELLED') {
        haptic.warning();
        toast({ title: `#${p.id} скасовано`, body: 'Замовлення знято з вашого маршруту', tone: 'danger' });
      }
    });
    s.on('courier:queue', (p: { id: number; status: OrderStatus; assigned: boolean }) => {
      qc.invalidateQueries({ queryKey: ['courier'] });
      if (role === 'COURIER' && !p.assigned && p.status === 'CONFIRMED') {
        haptic.warning();
        toast({ title: `Нове замовлення #${p.id}`, body: 'Шукає курʼєра — візьміть, поки готується', tone: 'warning' });
        notify('Нове замовлення для доставки', `#${p.id} шукає курʼєра`);
      }
    });

    return () => {
      s.removeAllListeners();
      s.close();
      setDeliveryConnected(false);
    };
  }, [user?.id, user?.role, qc, toast]);

  const live = user?.role === 'COURIER' ? deliveryConnected : connected;
  return <Ctx.Provider value={{ connected: live, deliveryConnected }}>{children}</Ctx.Provider>;
}

export const useRealtime = () => useContext(Ctx);
