/**
 * SANDBOX PAYMENT GATEWAY (ADVANCED-компонент)
 *
 * Емуляція платіжного провайдера за зразком Stripe test mode:
 *  - перевірка номера картки алгоритмом Луна (Luhn), терміну дії та CVC;
 *  - визначення платіжної системи (Visa / Mastercard) за BIN;
 *  - детерміновані тестові картки для різних сценаріїв (успіх, відмова, 3-D Secure);
 *  - повний номер картки ніколи не зберігається — лише бренд та останні 4 цифри.
 */
import { randomToken } from '../../lib/http';

export type GatewayOutcome =
  | { kind: 'success' }
  | { kind: 'declined'; code: string; message: string }
  | { kind: 'requires_action' };

export interface CardInput {
  number: string;
  expMonth: number;
  expYear: number;
  cvc: string;
  holder?: string;
}

export const SANDBOX_OTP = '123456';

export const TEST_CARDS: Record<string, { label: string; outcome: GatewayOutcome }> = {
  '4242424242424242': { label: 'Visa — успішна оплата', outcome: { kind: 'success' } },
  '5555555555554444': { label: 'Mastercard — успішна оплата', outcome: { kind: 'success' } },
  '4000000000003220': { label: 'Visa — потребує 3-D Secure (код 123456)', outcome: { kind: 'requires_action' } },
  '4000000000000002': {
    label: 'Visa — відмова банку',
    outcome: { kind: 'declined', code: 'card_declined', message: 'Банк відхилив операцію' },
  },
  '4000000000009995': {
    label: 'Visa — недостатньо коштів',
    outcome: { kind: 'declined', code: 'insufficient_funds', message: 'Недостатньо коштів на картці' },
  },
};

export function normalizeCardNumber(number: string): string {
  return number.replace(/[\s-]/g, '');
}

/** Алгоритм Луна: контрольна сума номера платіжної картки. */
export function luhnCheck(number: string): boolean {
  const digits = normalizeCardNumber(number);
  if (!/^\d{12,19}$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

export function detectBrand(number: string): string {
  const n = normalizeCardNumber(number);
  if (/^4/.test(n)) return 'VISA';
  if (/^(5[1-5]|2(2[2-9][1-9]|2[3-9]\d|[3-6]\d\d|7[01]\d|720))/.test(n)) return 'MASTERCARD';
  if (/^3[47]/.test(n)) return 'AMEX';
  return 'CARD';
}

export interface CardValidationError {
  field: 'number' | 'exp' | 'cvc';
  message: string;
}

export function validateCard(card: CardInput, today = new Date()): CardValidationError | null {
  if (!luhnCheck(card.number)) return { field: 'number', message: 'Некоректний номер картки' };
  if (card.expMonth < 1 || card.expMonth > 12) return { field: 'exp', message: 'Некоректний місяць' };
  const year = card.expYear < 100 ? 2000 + card.expYear : card.expYear;
  const lastValid = new Date(year, card.expMonth, 1); // перше число наступного місяця
  if (lastValid <= today) return { field: 'exp', message: 'Термін дії картки минув' };
  const cvcLength = detectBrand(card.number) === 'AMEX' ? 4 : 3;
  if (!new RegExp(`^\\d{${cvcLength}}$`).test(card.cvc)) return { field: 'cvc', message: 'Некоректний CVC' };
  return null;
}

/** «Авторизація» платежу у sandbox-провайдера. */
export function authorize(card: CardInput): GatewayOutcome {
  const n = normalizeCardNumber(card.number);
  return TEST_CARDS[n]?.outcome ?? { kind: 'success' };
}

export function newProviderRef(): string {
  return `pi_sbx_${randomToken(12)}`;
}
