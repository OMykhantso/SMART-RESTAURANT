export const TZ = 'Europe/Kyiv';

export function money(kop: number): string {
  return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(kop / 100) + ' ₴';
}

const dtf = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('uk-UA', { timeZone: TZ, ...opts });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const fmtTime = (iso: string | Date) => dtf({ hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
export const fmtDate = (iso: string | Date) => dtf({ day: 'numeric', month: 'long' }).format(new Date(iso));
export const fmtDateShort = (iso: string | Date) => dtf({ day: 'numeric', month: 'short' }).format(new Date(iso));
export const fmtFullDate = (iso: string | Date) => cap(dtf({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso)));

export function isoDay(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

export function relativeDay(isoDate: string): string {
  const today = isoDay();
  if (isoDate === today) return 'Сьогодні';
  if (isoDate === addDays(today, 1)) return 'Завтра';
  return cap(new Intl.DateTimeFormat('uk-UA', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${isoDate}T12:00:00Z`)));
}

export function plural(n: number, one: string, few: string, many: string) {
  const a = n % 10;
  const b = n % 100;
  if (a === 1 && b !== 11) return one;
  if (a >= 2 && a <= 4 && (b < 12 || b > 14)) return few;
  return many;
}
export const guestsLabel = (n: number) => `${n} ${plural(n, 'гість', 'гості', 'гостей')}`;

export function greeting(): string {
  const h = Number(dtf({ hour: 'numeric', hour12: false }).format(new Date()));
  if (h < 12) return 'Доброго ранку';
  if (h < 18) return 'Добрий день';
  return 'Добрий вечір';
}

export function minutesSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}
