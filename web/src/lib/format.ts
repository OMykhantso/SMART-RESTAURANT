import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export const TZ = 'Europe/Kyiv';

/** Гроші зберігаються в копійках → «1 245 ₴» (з копійками — лише якщо withKop) */
export function money(kop: number, withKop = false): string {
  return (
    new Intl.NumberFormat('uk-UA', {
      minimumFractionDigits: withKop ? 2 : 0,
      maximumFractionDigits: withKop ? 2 : 0,
    }).format(kop / 100) + ' ₴'
  );
}

const dtf = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('uk-UA', { timeZone: TZ, ...opts });

export const fmtTime = (iso: string | Date) => dtf({ hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const fmtDate = (iso: string | Date) => dtf({ day: 'numeric', month: 'long' }).format(new Date(iso));
export const fmtDateShort = (iso: string | Date) => dtf({ day: 'numeric', month: 'short' }).format(new Date(iso));
export const fmtWeekday = (iso: string | Date) => dtf({ weekday: 'short' }).format(new Date(iso));
export const fmtDateTime = (iso: string | Date) =>
  dtf({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const fmtFullDate = (iso: string | Date) => capFirst(dtf({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso)));

/** YYYY-MM-DD у часовому поясі ресторану */
export function isoDay(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return parts;
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days, 12));
  return dt.toISOString().slice(0, 10);
}

export function relativeDay(isoDate: string): string {
  const today = isoDay();
  if (isoDate === today) return 'Сьогодні';
  if (isoDate === addDays(today, 1)) return 'Завтра';
  return new Intl.DateTimeFormat('uk-UA', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T12:00:00Z`),
  );
}

export function minutesSince(iso: string | null | undefined, now = Date.now()): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
}

export function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export const guestsLabel = (n: number) => `${n} ${plural(n, 'гість', 'гості', 'гостей')}`;

export function initials(name: string | null | undefined) {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

/** Унікальний ідентифікатор (crypto.randomUUID недоступний поза HTTPS/localhost) */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto && window.isSecureContext) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const fmtDayNum = (iso: string | Date) => dtf({ day: 'numeric' }).format(new Date(iso));
export const fmtMonthShort = (iso: string | Date) => dtf({ month: 'short' }).format(new Date(iso));
