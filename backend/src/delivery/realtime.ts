import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { resolveUser } from '../middleware/auth';
import { env } from '../config';
import { orderLabels } from '../lib/stateMachine';
import type { OrderFull } from '../modules/orders/orders.service';

/**
 * Real-time шар Delivery API (власний Socket.IO-сервер, порт Delivery API). Кімнати:
 *  - user:<id>  — клієнт (статус його доставки) і курʼєр (призначені йому замовлення)
 *  - couriers   — усі курʼєри (черга замовлень, що шукають курʼєра)
 *  - dispatch   — зал і адміністратор (моніторинг доставок)
 */
let io: Server | null = null;

export function initDeliveryRealtime(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',') },
  });
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('UNAUTHORIZED'));
    try {
      socket.data.user = await resolveUser(token);
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });
  io.on('connection', (socket) => {
    const user = socket.data.user as { id: number; role: string };
    socket.join(`user:${user.id}`);
    if (user.role === 'COURIER') socket.join('couriers');
    if (user.role === 'STAFF' || user.role === 'ADMIN') socket.join('dispatch');
    socket.emit('hello', { system: 'delivery', serverTime: new Date().toISOString() });
  });
  return io;
}

export function closeDeliveryRealtime() {
  io?.close();
  io = null;
}

/** Подія про зміну доставки — клієнту, призначеному курʼєру, диспетчеру і черзі курʼєрів. */
export function emitDeliveryUpdate(o: OrderFull, event: 'order:created' | 'order:updated') {
  if (!io || o.type !== 'DELIVERY') return;
  const payload = {
    id: o.id,
    event,
    status: o.status,
    statusLabel: orderLabels(o.type)[o.status],
    etaAt: o.delivery?.etaAt ?? null,
    courier: o.delivery?.courier ? { id: o.delivery.courier.id, name: o.delivery.courier.name } : null,
    zone: o.delivery?.zone.name ?? null,
    total: o.total,
  };
  const rooms = ['dispatch'];
  if (o.userId) rooms.push(`user:${o.userId}`);
  if (o.delivery?.courierId) rooms.push(`user:${o.delivery.courierId}`);
  io.to(rooms).emit('delivery:updated', payload);
  // черга курʼєрів змінюється, коли замовлення оплачене/готується/готове або його хтось узяв
  if (o.status !== 'NEW') io.to('couriers').emit('courier:queue', { id: o.id, status: o.status, assigned: Boolean(o.delivery?.courierId) });
}
