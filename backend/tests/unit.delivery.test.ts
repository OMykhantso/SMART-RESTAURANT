import { describe, expect, it } from 'vitest';
import { DateTime } from 'luxon';
import { deliveryWindow, normalizePhone, priceFor } from '../src/delivery/delivery.service';
import { canTransition, DELIVERY_FLOW, ORDER_FLOW } from '../src/lib/stateMachine';

const kyiv = (iso: string) => DateTime.fromISO(iso, { zone: 'Europe/Kyiv' }).toJSDate();

describe('Доставка: вартість', () => {
  const zone = { fee: 4900, minOrder: 30000, freeFrom: 80000 };
  it('платна доставка нижче порогу і безкоштовна від порогу', () => {
    expect(priceFor(zone, 50000)).toMatchObject({ fee: 4900, total: 54900, missingToMin: 0, missingToFree: 30000 });
    expect(priceFor(zone, 80000)).toMatchObject({ fee: 0, total: 80000, missingToFree: 0 });
  });
  it('скільки бракує до мінімальної суми', () => {
    expect(priceFor(zone, 23500).missingToMin).toBe(6500);
  });
  it('зона без безкоштовної доставки', () => {
    expect(priceFor({ ...zone, freeFrom: null }, 500000)).toMatchObject({ fee: 4900, missingToFree: null });
  });
});

describe('Доставка: години роботи', () => {
  it('середа: приймаємо з 10:00 до 22:15 (закриття 23:00 − 45 хв)', () => {
    expect(deliveryWindow(kyiv('2026-10-07T13:00')).isOpen).toBe(true);
    expect(deliveryWindow(kyiv('2026-10-07T09:59')).isOpen).toBe(false);
    const late = deliveryWindow(kyiv('2026-10-07T22:20'));
    expect(late).toMatchObject({ isOpen: false, lastOrderAt: '22:15' });
    expect(late.nextOpenLabel).toBe('завтра о 10:00');
  });
  it('пʼятниця працює до 24:00 — після півночі діє вікно попереднього дня', () => {
    expect(deliveryWindow(kyiv('2026-10-09T23:10')).isOpen).toBe(true);
    expect(deliveryWindow(kyiv('2026-10-10T00:10')).isOpen).toBe(false);
  });
  it('зранку до відкриття — «сьогодні о …»', () => {
    expect(deliveryWindow(kyiv('2026-10-07T08:00')).nextOpenLabel).toBe('сьогодні о 10:00');
  });
});

describe('Доставка: телефон', () => {
  it('приводить номери до формату +380XXXXXXXXX', () => {
    expect(normalizePhone('050 123 45 67')).toBe('+380501234567');
    expect(normalizePhone('+38 (067) 111-22-33')).toBe('+380671112233');
    expect(normalizePhone('671112233')).toBe('+380671112233');
    expect(() => normalizePhone('12345')).toThrow();
  });
});

describe('Доставка: автомат станів', () => {
  it('онлайн-оплату підтверджує лише система, а забрати замовлення — курʼєр', () => {
    expect(canTransition(DELIVERY_FLOW, 'NEW', 'CONFIRMED', ['STAFF'])).toBe(false);
    expect(canTransition(DELIVERY_FLOW, 'NEW', 'CONFIRMED', ['SYSTEM'])).toBe(true);
    expect(canTransition(DELIVERY_FLOW, 'READY', 'DELIVERING', ['COURIER'])).toBe(true);
    expect(canTransition(DELIVERY_FLOW, 'READY', 'DELIVERING', ['STAFF'])).toBe(false);
    expect(canTransition(DELIVERY_FLOW, 'READY', 'SERVED', ['STAFF'])).toBe(false);
    expect(canTransition(DELIVERY_FLOW, 'PREPARING', 'CANCELLED', ['OWNER'])).toBe(false);
  });
  it('у залі курʼєрських переходів немає', () => {
    expect(canTransition(ORDER_FLOW, 'READY', 'DELIVERING', ['COURIER', 'ADMIN'])).toBe(false);
  });
});
