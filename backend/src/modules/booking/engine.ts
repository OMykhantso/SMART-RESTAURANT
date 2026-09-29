/**
 * BOOKING ENGINE (ADVANCED-компонент)
 *
 * Чисті функції (без звернень до БД) — легко тестуються модульними тестами.
 *
 *  1. Генерація сітки слотів у межах годин роботи з урахуванням
 *     тривалості візиту (залежить від кількості гостей), мінімального
 *     часу до бронювання та технологічної перерви між гостями (buffer).
 *  2. Перевірка конфліктів: інтервал [start − buffer, end + buffer) не може
 *     перетинатися з активними бронюваннями столика.
 *  3. Підбір оптимального столика (best-fit): мінімізація штрафної функції
 *       score = 10·(зайві місця) + 30·(невідповідність бажаній зоні) + 8·(барне місце без запиту)
 *             + штраф за «мертві» проміжки (фрагментацію розкладу)
 *             − бонус за щільне прилягання до сусідніх бронювань.
 *     Такий підхід залишає великі столи та довгі вільні вікна для інших гостей
 *     і підвищує загальну заповнюваність ресторану.
 */
import type { TableShape, TableZone } from '@prisma/client';

export interface EngineTable {
  id: number;
  number: number;
  seats: number;
  zone: TableZone;
  shape: TableShape;
  posX: number;
  posY: number;
}

export interface BusyInterval {
  reservationId: number;
  tableId: number;
  startAt: Date;
  endAt: Date;
}

export interface EngineSettings {
  bufferMin: number;
  /** Мінімальна корисна довжина вільного вікна (коротші вікна вважаються «мертвими») */
  minUsefulGapMin: number;
}

export interface Preferences {
  zone?: TableZone;
}

export interface ScoredTable {
  table: EngineTable;
  score: number;
  reasons: string[];
}

const MIN = 60_000;

export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Чи вільний столик на інтервал [start, end) з урахуванням буфера до/після сусідніх бронювань. */
export function isTableFree(
  busy: BusyInterval[],
  tableId: number,
  start: Date,
  end: Date,
  bufferMin: number,
  excludeReservationId?: number,
): boolean {
  const bufferedStart = new Date(start.getTime() - bufferMin * MIN);
  const bufferedEnd = new Date(end.getTime() + bufferMin * MIN);
  return !busy.some(
    (b) =>
      b.tableId === tableId &&
      b.reservationId !== excludeReservationId &&
      overlaps(bufferedStart, bufferedEnd, b.startAt, b.endAt),
  );
}

/**
 * Штрафна функція для столика (менше — краще).
 * dayOpen / dayClose — межі робочого дня, які теж вважаються «сусідами».
 */
export function scoreTable(
  table: EngineTable,
  guests: number,
  start: Date,
  end: Date,
  busyForTable: BusyInterval[],
  dayOpen: Date,
  dayClose: Date,
  settings: EngineSettings,
  prefs: Preferences = {},
): ScoredTable {
  const reasons: string[] = [];
  let score = 0;

  const waste = table.seats - guests;
  score += waste * 10;
  if (waste === 0) reasons.push('Ідеально за кількістю місць');
  else if (waste <= 1) reasons.push('Оптимальний розмір столика');

  if (prefs.zone) {
    if (table.zone !== prefs.zone) score += 30;
    else reasons.push('У бажаній зоні');
  } else if (table.zone === 'BAR') {
    // барні місця пропонуємо лише тим, хто їх явно обрав, або коли інших варіантів немає
    score += 8;
  }

  // Найближчі сусідні бронювання до та після нашого інтервалу
  let prevEnd = dayOpen.getTime();
  let nextStart = dayClose.getTime();
  let hasPrev = false;
  let hasNext = false;
  for (const b of busyForTable) {
    const bEnd = b.endAt.getTime() + settings.bufferMin * MIN;
    const bStart = b.startAt.getTime() - settings.bufferMin * MIN;
    if (bEnd <= start.getTime() && bEnd >= prevEnd) {
      prevEnd = bEnd;
      hasPrev = true;
    }
    if (bStart >= end.getTime() && bStart <= nextStart) {
      nextStart = bStart;
      hasNext = true;
    }
  }
  const gapBefore = Math.max(0, (start.getTime() - prevEnd) / MIN);
  const gapAfter = Math.max(0, (nextStart - end.getTime()) / MIN);

  let fragmentation = 0;
  for (const gap of [gapBefore, gapAfter]) {
    if (gap > 0 && gap < settings.minUsefulGapMin) fragmentation += (settings.minUsefulGapMin - gap) / 5;
  }
  score += fragmentation;

  const tightFit = (hasPrev && gapBefore === 0) || (hasNext && gapAfter === 0);
  if (tightFit) {
    score -= 5;
    reasons.push('Щільне планування без «мертвих» проміжків');
  } else if (fragmentation === 0 && (hasPrev || hasNext)) {
    reasons.push('Не створює незручних проміжків у розкладі');
  }

  return { table, score: Math.round(score * 100) / 100, reasons };
}

/** Повертає столики, відсортовані за оптимальністю (найкращий — перший). */
export function rankTables(
  tables: EngineTable[],
  busy: BusyInterval[],
  guests: number,
  start: Date,
  end: Date,
  dayOpen: Date,
  dayClose: Date,
  settings: EngineSettings,
  prefs: Preferences = {},
  excludeReservationId?: number,
): ScoredTable[] {
  return tables
    .filter((t) => t.seats >= guests)
    .filter((t) => isTableFree(busy, t.id, start, end, settings.bufferMin, excludeReservationId))
    .map((t) =>
      scoreTable(
        t,
        guests,
        start,
        end,
        busy.filter((b) => b.tableId === t.id && b.reservationId !== excludeReservationId),
        dayOpen,
        dayClose,
        settings,
        prefs,
      ),
    )
    .sort((a, b) => a.score - b.score || a.table.seats - b.table.seats || a.table.number - b.table.number);
}

export interface SlotInput {
  dayOpen: Date;
  dayClose: Date;
  durationMin: number;
  stepMin: number;
  /** Найраніший допустимий початок (now + lead time) */
  earliestStart: Date;
  guests: number;
  tables: EngineTable[];
  busy: BusyInterval[];
  settings: EngineSettings;
  prefs?: Preferences;
}

export interface Slot {
  startAt: Date;
  endAt: Date;
  available: boolean;
  tablesLeft: number;
  /** Завантаженість ресторану в цей час: частка зайнятих столиків 0..1 */
  load: number;
  bestTable: ScoredTable | null;
  inPreferredZone: boolean;
}

export function computeSlots(input: SlotInput): Slot[] {
  const slots: Slot[] = [];
  const fitting = input.tables.filter((t) => t.seats >= input.guests);
  const stepMs = input.stepMin * MIN;
  const durationMs = input.durationMin * MIN;

  // вирівнюємо перший слот по сітці від відкриття
  for (let t = input.dayOpen.getTime(); t + durationMs <= input.dayClose.getTime(); t += stepMs) {
    const start = new Date(t);
    const end = new Date(t + durationMs);
    if (start < input.earliestStart) continue;

    const ranked = rankTables(
      fitting,
      input.busy,
      input.guests,
      start,
      end,
      input.dayOpen,
      input.dayClose,
      input.settings,
      input.prefs,
    );
    const occupiedNow = new Set(
      input.busy.filter((b) => overlaps(start, end, b.startAt, b.endAt)).map((b) => b.tableId),
    );
    const best = ranked[0] ?? null;
    slots.push({
      startAt: start,
      endAt: end,
      available: ranked.length > 0,
      tablesLeft: ranked.length,
      load: input.tables.length ? Math.round((occupiedNow.size / input.tables.length) * 100) / 100 : 0,
      bestTable: best,
      inPreferredZone: Boolean(best && (!input.prefs?.zone || best.table.zone === input.prefs.zone)),
    });
  }
  return slots;
}

/** Найближчі доступні альтернативи до бажаного часу (для підказок «спробуйте о …»). */
export function nearestAlternatives(slots: Slot[], desired: Date, limit = 4): Slot[] {
  return slots
    .filter((s) => s.available)
    .sort(
      (a, b) =>
        Math.abs(a.startAt.getTime() - desired.getTime()) - Math.abs(b.startAt.getTime() - desired.getTime()),
    )
    .slice(0, limit)
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}
