import { DateTime } from 'luxon';
import { restaurant } from '../config';

export const TZ = () => restaurant.timezone;

/** Поточний момент (виділено окремо, щоб у тестах можна було підмінити системний час). */
export const now = () => new Date();

export function toLocal(date: Date): DateTime {
  return DateTime.fromJSDate(date, { zone: TZ() });
}

export function localDay(isoDate: string): DateTime {
  const day = DateTime.fromISO(isoDate, { zone: TZ() }).startOf('day');
  if (!day.isValid) throw new Error('Invalid date');
  return day;
}

export function todayLocal(): DateTime {
  return DateTime.fromJSDate(now(), { zone: TZ() }).startOf('day');
}

function atTime(day: DateTime, hhmm: string): DateTime {
  const [h, m] = hhmm.split(':').map(Number);
  // 24:00 → північ наступного дня
  if (h === 24) return day.plus({ days: 1 }).startOf('day');
  return day.set({ hour: h, minute: m, second: 0, millisecond: 0 });
}

/** Години роботи ресторану для конкретного дня (у часовому поясі ресторану). */
export function openingWindow(day: DateTime): { open: DateTime; close: DateTime } {
  const hours = restaurant.openingHours[day.weekday];
  return { open: atTime(day, hours.open), close: atTime(day, hours.close) };
}

export function formatHm(date: Date | DateTime): string {
  const dt = date instanceof Date ? toLocal(date) : date.setZone(TZ());
  return dt.toFormat('HH:mm');
}

export function minutesBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}
