import { describe, expect, it } from 'vitest';
import { authorize, detectBrand, luhnCheck, validateCard } from '../src/modules/payments/sandbox';
import { associationRule, buildAssociations, recommend, type RecDish } from '../src/modules/recommendations/engine';
import { actorsFor, assertTransition, canTransition, ORDER_FLOW, ORDER_LABELS, RESERVATION_FLOW, RESERVATION_LABELS } from '../src/lib/stateMachine';

describe('Sandbox payment gateway', () => {
  it('перевіряє номер картки алгоритмом Луна', () => {
    expect(luhnCheck('4242 4242 4242 4242')).toBe(true);
    expect(luhnCheck('4242 4242 4242 4241')).toBe(false);
    expect(luhnCheck('1234')).toBe(false);
  });
  it('визначає платіжну систему', () => {
    expect(detectBrand('4242424242424242')).toBe('VISA');
    expect(detectBrand('5555555555554444')).toBe('MASTERCARD');
  });
  it('відхиляє прострочену картку та неправильний CVC', () => {
    const today = new Date('2030-06-15');
    expect(validateCard({ number: '4242424242424242', expMonth: 5, expYear: 2030, cvc: '123' }, today)?.field).toBe('exp');
    expect(validateCard({ number: '4242424242424242', expMonth: 6, expYear: 2030, cvc: '123' }, today)).toBeNull();
    expect(validateCard({ number: '4242424242424242', expMonth: 12, expYear: 31, cvc: '12' }, today)?.field).toBe('cvc');
  });
  it('повертає детерміновані результати для тестових карток', () => {
    const card = (number: string) => ({ number, expMonth: 12, expYear: 2099, cvc: '123' });
    expect(authorize(card('4242424242424242')).kind).toBe('success');
    expect(authorize(card('4000000000000002'))).toMatchObject({ kind: 'declined', code: 'card_declined' });
    expect(authorize(card('4000000000009995'))).toMatchObject({ kind: 'declined', code: 'insufficient_funds' });
    expect(authorize(card('4000000000003220')).kind).toBe('requires_action');
  });
});

describe('Скінченні автомати станів', () => {
  it('клієнт може скасувати власне нове замовлення, але не прийняте', () => {
    const client = actorsFor({ id: 7, role: 'CLIENT' }, 7);
    expect(canTransition(ORDER_FLOW, 'NEW', 'CANCELLED', client)).toBe(true);
    expect(canTransition(ORDER_FLOW, 'CONFIRMED', 'CANCELLED', client)).toBe(false);
  });
  it('чужий клієнт не є власником', () => {
    expect(actorsFor({ id: 8, role: 'CLIENT' }, 7)).toEqual(['CLIENT']);
  });
  it('лише система може позначити замовлення оплаченим', () => {
    expect(canTransition(ORDER_FLOW, 'SERVED', 'PAID', ['ADMIN'])).toBe(false);
    expect(canTransition(ORDER_FLOW, 'SERVED', 'PAID', ['SYSTEM'])).toBe(true);
  });
  it('недопустимий перехід → 409, заборонений для ролі → 403', () => {
    expect(() => assertTransition(ORDER_FLOW, ORDER_LABELS, 'NEW', 'SERVED', ['STAFF'])).toThrow(
      expect.objectContaining({ status: 409, code: 'INVALID_TRANSITION' }),
    );
    expect(() => assertTransition(RESERVATION_FLOW, RESERVATION_LABELS, 'PENDING', 'CONFIRMED', ['CLIENT', 'OWNER'])).toThrow(
      expect.objectContaining({ status: 403, code: 'TRANSITION_FORBIDDEN' }),
    );
  });
  it('кухня не може подати страву до столу, а офіціант — почати готувати', () => {
    expect(canTransition(ORDER_FLOW, 'READY', 'SERVED', ['KITCHEN'])).toBe(false);
    expect(canTransition(ORDER_FLOW, 'CONFIRMED', 'PREPARING', ['STAFF'])).toBe(false);
  });
});

describe('Recommendation engine (контрольні дані)', () => {
  const dish = (id: number, categorySlug: string, extra: Partial<RecDish> = {}): RecDish => ({
    id,
    categoryId: categorySlug.length,
    categorySlug,
    price: 10000,
    isAvailable: true,
    isChefChoice: false,
    tags: [],
    ...extra,
  });
  // 1 — стейк, 2 — вино, 3 — лимонад, 4 — тірамісу, 5 — піца
  const dishes = [dish(1, 'main'), dish(2, 'cocktails'), dish(3, 'drinks'), dish(4, 'desserts'), dish(5, 'pizza')];
  const baskets = [
    ...Array.from({ length: 8 }, () => [1, 2]), // стейк + вино — стабільна пара
    ...Array.from({ length: 6 }, () => [5, 3]), // піца + лимонад
    [1, 4],
    [5, 4],
    [3],
    [4],
  ];
  const base = { dishes, baskets, userDishCounts: new Map(), ratings: new Map(), hour: 13 };

  it('асоціативне правило стейк → вино має високу confidence та lift > 1', () => {
    const stats = buildAssociations(baskets);
    const rule = associationRule(stats, 1, 2);
    expect(rule.confidence).toBeCloseTo(8 / 9, 5);
    expect(rule.lift).toBeGreaterThan(1);
  });

  it('до стейку рекомендує вино з поясненням', () => {
    const recs = recommend({ ...base, cart: [1], names: new Map([[1, 'Стейк']]) });
    expect(recs[0].dishId).toBe(2);
    expect(recs[0].reasons[0]).toBe('Часто замовляють разом із «Стейк»');
  });

  it('до піци рекомендує лимонад, а не вино', () => {
    const recs = recommend({ ...base, cart: [5] });
    expect(recs[0].dishId).toBe(3);
  });

  it('не рекомендує страви з кошика та зі стоп-листа', () => {
    const recs = recommend({ ...base, dishes: dishes.map((d) => (d.id === 2 ? { ...d, isAvailable: false } : d)), cart: [1] });
    expect(recs.map((r) => r.dishId)).not.toContain(1);
    expect(recs.map((r) => r.dishId)).not.toContain(2);
  });

  it('персоналізація: улюблена страва користувача піднімається вгору', () => {
    const recs = recommend({ ...base, cart: [], userDishCounts: new Map([[4, 6]]) });
    expect(recs[0].dishId).toBe(4);
    expect(recs[0].reasons).toContain('Ви часто це замовляєте');
  });

  it('байєсівський рейтинг: один відгук 5★ не перемагає багато відгуків 4.9★', () => {
    const ratings = new Map([
      [1, { avg: 4.0, count: 30 }],
      [5, { avg: 4.2, count: 25 }],
      [3, { avg: 5, count: 1 }],
      [4, { avg: 4.9, count: 40 }],
    ]);
    const recs = recommend({ ...base, baskets: [], cart: [], ratings });
    const r3 = recs.find((r) => r.dishId === 3)!;
    const r4 = recs.find((r) => r.dishId === 4)!;
    expect(r4.components.rating).toBeGreaterThan(r3.components.rating);
  });
});
