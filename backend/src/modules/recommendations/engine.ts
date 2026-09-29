/**
 * RECOMMENDATION ENGINE (BONUS-компонент) — гібридна пояснювана модель.
 *
 * Для кожної доступної страви d обчислюється
 *
 *   score(d) = 0.35·A(d) + 0.25·P(d) + 0.15·Pop(d) + 0.10·R(d) + 0.10·C(d) + 0.05·T(d)
 *
 *   A   — асоціативні правила «часто замовляють разом»: max confidence(c → d) по стравах c у кошику,
 *         підсилена lift (наскільки частіше, ніж випадково). Рахується за історією оплачених замовлень.
 *   P   — персоналізація: частота замовлень цієї страви користувачем + прихильність до її категорії.
 *   Pop — популярність (логарифмічна шкала кількості порцій).
 *   R   — рейтинг з байєсівським згладжуванням: (C·m + Σr)/(C + n), щоб 1 відгук «5★» не перемагав 100 відгуків «4.8★».
 *   C   — доповнення кошика: якщо є основна страва, але немає напою/десерту — підсилюємо ці категорії.
 *   T   — контекст часу доби (сніданки зранку, коктейлі ввечері).
 *
 * Кожна рекомендація повертається з причинами (explainability).
 */

export interface RecDish {
  id: number;
  categoryId: number;
  categorySlug: string;
  price: number;
  isAvailable: boolean;
  isChefChoice: boolean;
  tags: string[];
}

export interface RecContext {
  dishes: RecDish[];
  /** Історія замовлень: кожне замовлення — множина dishId */
  baskets: number[][];
  /** Скільки разів поточний користувач замовляв кожну страву */
  userDishCounts: Map<number, number>;
  ratings: Map<number, { avg: number; count: number }>;
  cart: number[];
  hour: number;
  names?: Map<number, string>;
}

export interface Recommendation {
  dishId: number;
  score: number;
  reasons: string[];
  components: Record<'assoc' | 'personal' | 'popularity' | 'rating' | 'complement' | 'time', number>;
}

export const WEIGHTS = { assoc: 0.35, personal: 0.25, popularity: 0.15, rating: 0.1, complement: 0.1, time: 0.05 };

const MAIN_CATEGORIES = new Set(['main', 'pasta', 'pizza', 'soups', 'grill']);
const DRINK_CATEGORIES = new Set(['drinks', 'cocktails', 'coffee']);
const DESSERT_CATEGORIES = new Set(['desserts']);

export interface AssociationStats {
  itemCount: Map<number, number>;
  pairCount: Map<string, number>;
  totalBaskets: number;
}

const pairKey = (a: number, b: number) => `${a}:${b}`;

export function buildAssociations(baskets: number[][]): AssociationStats {
  const itemCount = new Map<number, number>();
  const pairCount = new Map<string, number>();
  for (const raw of baskets) {
    const basket = [...new Set(raw)];
    for (const a of basket) {
      itemCount.set(a, (itemCount.get(a) ?? 0) + 1);
      for (const b of basket) {
        if (a !== b) pairCount.set(pairKey(a, b), (pairCount.get(pairKey(a, b)) ?? 0) + 1);
      }
    }
  }
  return { itemCount, pairCount, totalBaskets: baskets.length };
}

/** confidence(a → b) = P(b | a); lift = confidence / P(b) */
export function associationRule(stats: AssociationStats, a: number, b: number) {
  const countA = stats.itemCount.get(a) ?? 0;
  const countB = stats.itemCount.get(b) ?? 0;
  const both = stats.pairCount.get(pairKey(a, b)) ?? 0;
  if (!countA || !countB || !stats.totalBaskets) return { support: 0, confidence: 0, lift: 0, both };
  const confidence = both / countA;
  const lift = confidence / (countB / stats.totalBaskets);
  return { support: both / stats.totalBaskets, confidence, lift, both };
}

export function recommend(ctx: RecContext, limit = 8): Recommendation[] {
  const stats = buildAssociations(ctx.baskets);
  const cartSet = new Set(ctx.cart);
  const byId = new Map(ctx.dishes.map((d) => [d.id, d]));
  const cartCategories = new Set(ctx.cart.map((id) => byId.get(id)?.categorySlug).filter(Boolean) as string[]);

  const hasMain = [...cartCategories].some((c) => MAIN_CATEGORIES.has(c));
  const hasDrink = [...cartCategories].some((c) => DRINK_CATEGORIES.has(c));
  const hasDessert = [...cartCategories].some((c) => DESSERT_CATEGORIES.has(c));

  // Популярність — логарифмічна нормалізація
  const maxCount = Math.max(1, ...stats.itemCount.values());
  // Прихильність користувача до категорій
  const categoryAffinity = new Map<number, number>();
  let userTotal = 0;
  for (const [dishId, count] of ctx.userDishCounts) {
    const d = byId.get(dishId);
    if (!d) continue;
    categoryAffinity.set(d.categoryId, (categoryAffinity.get(d.categoryId) ?? 0) + count);
    userTotal += count;
  }
  const maxUserDish = Math.max(1, ...ctx.userDishCounts.values());
  const maxCategory = Math.max(1, ...categoryAffinity.values());

  // Байєсівський рейтинг: m — середній рейтинг по всіх, C — «вага довіри»
  const allRatings = [...ctx.ratings.values()];
  const globalAvg = allRatings.length
    ? allRatings.reduce((s, r) => s + r.avg * r.count, 0) / Math.max(1, allRatings.reduce((s, r) => s + r.count, 0))
    : 4;
  const C = 5;

  const results: Recommendation[] = [];
  for (const d of ctx.dishes) {
    if (!d.isAvailable || cartSet.has(d.id)) continue;
    const reasons: { text: string; weight: number }[] = [];

    // A — асоціації з кошиком
    let assoc = 0;
    let bestPartner: number | null = null;
    for (const c of ctx.cart) {
      const rule = associationRule(stats, c, d.id);
      if (rule.both < 2) continue; // мінімальна підтримка
      const value = rule.confidence * Math.min(1, rule.lift / 3);
      if (value > assoc) {
        assoc = value;
        bestPartner = c;
      }
    }
    assoc = Math.min(1, assoc * 1.5);
    if (assoc > 0.15 && bestPartner != null) {
      const partnerName = ctx.names?.get(bestPartner);
      reasons.push({ text: partnerName ? `Часто замовляють разом із «${partnerName}»` : 'Часто замовляють разом', weight: assoc * WEIGHTS.assoc });
    }

    // P — персоналізація
    const own = ctx.userDishCounts.get(d.id) ?? 0;
    const catAff = userTotal ? (categoryAffinity.get(d.categoryId) ?? 0) / maxCategory : 0;
    const personal = userTotal ? 0.6 * (own / maxUserDish) + 0.4 * catAff : 0;
    if (own >= 2) reasons.push({ text: 'Ви часто це замовляєте', weight: personal * WEIGHTS.personal });
    else if (catAff > 0.6) reasons.push({ text: 'Схоже на те, що вам подобається', weight: personal * WEIGHTS.personal });

    // Pop — популярність
    const count = stats.itemCount.get(d.id) ?? 0;
    const popularity = count ? Math.log1p(count) / Math.log1p(maxCount) : 0;
    if (popularity > 0.8) reasons.push({ text: 'Хіт ресторану', weight: popularity * WEIGHTS.popularity });

    // R — байєсівський рейтинг
    const r = ctx.ratings.get(d.id);
    const bayes = r ? (C * globalAvg + r.avg * r.count) / (C + r.count) : globalAvg;
    const rating = Math.max(0, (bayes - 3) / 2);
    if (r && r.count >= 3 && bayes >= 4.5) reasons.push({ text: `Рейтинг ${r.avg.toFixed(1)}★`, weight: rating * WEIGHTS.rating });

    // C — доповнення кошика
    let complement = 0;
    if (ctx.cart.length) {
      if (hasMain && !hasDrink && DRINK_CATEGORIES.has(d.categorySlug)) {
        complement = 1;
        reasons.push({ text: 'Доповніть страву напоєм', weight: WEIGHTS.complement });
      } else if (hasMain && !hasDessert && DESSERT_CATEGORIES.has(d.categorySlug)) {
        complement = 0.8;
        reasons.push({ text: 'Завершіть вечерю десертом', weight: 0.8 * WEIGHTS.complement });
      } else if (cartCategories.has(d.categorySlug)) {
        complement = -0.5; // не пропонуємо третій суп до двох супів
      }
    }

    // T — час доби
    let time = 0;
    if (ctx.hour < 12 && d.categorySlug === 'breakfast') time = 1;
    else if (ctx.hour >= 17 && d.categorySlug === 'cocktails') time = 1;
    else if (ctx.hour >= 12 && ctx.hour < 17 && (d.categorySlug === 'soups' || d.tags.includes('lunch'))) time = 0.7;
    if (time > 0) reasons.push({ text: ctx.hour < 12 ? 'Ідеально на сніданок' : ctx.hour >= 17 ? 'Для вечірнього настрою' : 'Чудовий вибір на обід', weight: time * WEIGHTS.time });

    let score =
      WEIGHTS.assoc * assoc +
      WEIGHTS.personal * personal +
      WEIGHTS.popularity * popularity +
      WEIGHTS.rating * rating +
      WEIGHTS.complement * complement +
      WEIGHTS.time * time;
    if (d.isChefChoice) {
      score += 0.02;
      if (!reasons.length) reasons.push({ text: 'Рекомендація шефа', weight: 0.02 });
    }

    results.push({
      dishId: d.id,
      score: Math.round(score * 1000) / 1000,
      reasons: reasons.sort((a, b) => b.weight - a.weight).map((r) => r.text).slice(0, 2),
      components: {
        assoc: round(assoc),
        personal: round(personal),
        popularity: round(popularity),
        rating: round(rating),
        complement: round(complement),
        time: round(time),
      },
    });
  }
  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

const round = (v: number) => Math.round(v * 1000) / 1000;
