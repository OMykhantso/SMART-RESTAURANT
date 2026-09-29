import { describe, expect, it } from 'vitest';
import { computeSlots, isTableFree, nearestAlternatives, rankTables, type BusyInterval, type EngineTable } from '../src/modules/booking/engine';

const d = (hhmm: string) => new Date(`2030-01-16T${hhmm}:00Z`);
const T = (id: number, seats: number, zone: EngineTable['zone'] = 'HALL'): EngineTable => ({
  id,
  number: id,
  seats,
  zone,
  shape: 'SQUARE',
  posX: 0,
  posY: 0,
});
const settings = { bufferMin: 15, minUsefulGapMin: 90 };

describe('Booking engine — конфлікти', () => {
  const busy: BusyInterval[] = [{ reservationId: 1, tableId: 1, startAt: d('18:00'), endAt: d('20:00') }];

  it('виявляє пряме перетинання інтервалів', () => {
    expect(isTableFree(busy, 1, d('19:00'), d('20:30'), 15)).toBe(false);
  });
  it('враховує технологічну перерву (buffer) між гостями', () => {
    // 20:00 закінчення + 15 хв буфера → о 20:05 ще не можна
    expect(isTableFree(busy, 1, d('20:05'), d('21:30'), 15)).toBe(false);
    expect(isTableFree(busy, 1, d('20:15'), d('21:45'), 15)).toBe(true);
    expect(isTableFree(busy, 1, d('16:00'), d('17:45'), 15)).toBe(true);
    expect(isTableFree(busy, 1, d('16:00'), d('17:50'), 15)).toBe(false);
  });
  it('ігнорує власне бронювання при редагуванні', () => {
    expect(isTableFree(busy, 1, d('18:30'), d('20:00'), 15, 1)).toBe(true);
  });
  it('не впливає на інші столики', () => {
    expect(isTableFree(busy, 2, d('18:00'), d('20:00'), 15)).toBe(true);
  });
});

describe('Booking engine — вибір столика (best-fit)', () => {
  const open = d('08:00');
  const close = d('21:00');

  it('обирає найменший достатній столик', () => {
    const ranked = rankTables([T(1, 6), T(2, 2), T(3, 4)], [], 2, d('12:00'), d('13:30'), open, close, settings);
    expect(ranked.map((r) => r.table.id)).toEqual([2, 3, 1]);
    expect(ranked[0].reasons).toContain('Ідеально за кількістю місць');
  });

  it('відкидає замалі та зайняті столики', () => {
    const busy: BusyInterval[] = [{ reservationId: 9, tableId: 2, startAt: d('12:00'), endAt: d('13:00') }];
    const ranked = rankTables([T(1, 2), T(2, 4), T(3, 6)], busy, 3, d('12:00'), d('14:00'), open, close, settings);
    expect(ranked.map((r) => r.table.id)).toEqual([3]);
  });

  it('враховує бажану зону', () => {
    const ranked = rankTables([T(1, 4, 'HALL'), T(2, 4, 'TERRACE')], [], 4, d('12:00'), d('14:00'), open, close, settings, {
      zone: 'TERRACE',
    });
    expect(ranked[0].table.id).toBe(2);
    expect(ranked[0].reasons).toContain('У бажаній зоні');
  });

  it('уникає «мертвих» проміжків у розкладі (фрагментації)', () => {
    // Столик 1: бронювання закінчується о 11:45 (+15 буфер = 12:00) → ідеальне прилягання о 12:00
    // Столик 2: бронювання до 11:00 → залишиться 45-хвилинний «мертвий» проміжок
    const busy: BusyInterval[] = [
      { reservationId: 1, tableId: 1, startAt: d('10:00'), endAt: d('11:45') },
      { reservationId: 2, tableId: 2, startAt: d('09:30'), endAt: d('10:00') },
      { reservationId: 3, tableId: 2, startAt: d('10:00'), endAt: d('11:00') },
    ];
    const ranked = rankTables([T(1, 4), T(2, 4)], busy, 4, d('12:00'), d('14:00'), open, close, settings);
    expect(ranked[0].table.id).toBe(1);
    expect(ranked[0].score).toBeLessThan(ranked[1].score);
    expect(ranked[0].reasons).toContain('Щільне планування без «мертвих» проміжків');
  });
});

describe('Booking engine — сітка слотів', () => {
  const tables = [T(1, 2), T(2, 4)];
  const base = {
    dayOpen: d('08:00'),
    dayClose: d('12:00'),
    durationMin: 90,
    stepMin: 30,
    earliestStart: d('08:00'),
    guests: 2,
    tables,
    settings,
  };

  it('слоти не виходять за години роботи', () => {
    const slots = computeSlots({ ...base, busy: [] });
    expect(slots[0].startAt).toEqual(d('08:00'));
    expect(slots.at(-1)!.startAt).toEqual(d('10:30')); // 10:30 + 90 хв = 12:00
    expect(slots.every((s) => s.available)).toBe(true);
  });

  it('враховує мінімальний час до бронювання', () => {
    const slots = computeSlots({ ...base, earliestStart: d('09:10'), busy: [] });
    expect(slots[0].startAt).toEqual(d('09:30'));
  });

  it('позначає слот недоступним, коли всі столики зайняті, і пропонує альтернативи', () => {
    const busy: BusyInterval[] = [
      { reservationId: 1, tableId: 1, startAt: d('08:00'), endAt: d('10:00') },
      { reservationId: 2, tableId: 2, startAt: d('08:00'), endAt: d('10:00') },
    ];
    const slots = computeSlots({ ...base, busy });
    const at9 = slots.find((s) => s.startAt.getTime() === d('09:00').getTime())!;
    expect(at9.available).toBe(false);
    expect(at9.load).toBe(1);
    const alt = nearestAlternatives(slots, d('09:00'), 2);
    expect(alt.length).toBeGreaterThan(0);
    expect(alt.every((s) => s.available)).toBe(true);
  });
});
