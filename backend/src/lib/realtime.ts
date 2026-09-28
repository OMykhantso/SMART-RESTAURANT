import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { resolveUser } from '../middleware/auth';
import { env } from '../config';

/**
 * Real-time шар (Socket.IO). Кімнати:
 *  - user:<id>  — персональні події клієнта (статус його бронювання/замовлення)
 *  - staff      — працівники залу та адміністратор
 *  - kitchen    — кухня (kitchen display)
 *  - public     — усі підключені (зміни меню / стоп-лист)
 */
let io: Server | null = null;

export type RealtimeEvent =
  | 'order:created'
  | 'order:updated'
  | 'reservation:created'
  | 'reservation:updated'
  | 'tables:changed'
  | 'menu:changed'
  | 'payment:succeeded';

export function initRealtime(server: HttpServer) {
  io = new Server(server, {
    cors: { origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',') },
  });

  io.use(async (socket, next) => {
    const token = (socket.handshake.auth?.token as string | undefined) ?? undefined;
    if (!token) {
      socket.data.user = null;
      return next();
    }
    try {
      socket.data.user = await resolveUser(token);
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    socket.join('public');
    const user = socket.data.user as { id: number; role: string } | null;
    if (user) {
      socket.join(`user:${user.id}`);
      if (user.role === 'STAFF' || user.role === 'ADMIN') socket.join('staff');
      if (user.role === 'KITCHEN' || user.role === 'ADMIN') socket.join('kitchen');
    }
    socket.emit('hello', { authenticated: Boolean(user), serverTime: new Date().toISOString() });
  });

  return io;
}

export function getIO() {
  return io;
}

interface Target {
  userId?: number | null;
  staff?: boolean;
  kitchen?: boolean;
  everyone?: boolean;
}

export function emit(event: RealtimeEvent, payload: unknown, target: Target) {
  if (!io) return;
  const rooms: string[] = [];
  if (target.everyone) rooms.push('public');
  if (target.userId) rooms.push(`user:${target.userId}`);
  if (target.staff) rooms.push('staff');
  if (target.kitchen) rooms.push('kitchen');
  if (rooms.length === 0) return;
  io.to(rooms).emit(event, payload);
}
