import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, Clock, Flame, Leaf, Minus, Plus, Star } from 'lucide-react-native';
import { colors, fonts, goldGradient, radius } from '../theme';
import { Badge, Caption, DishImage, PressableScale } from './ui';
import { useCart } from '../lib/cart';
import { haptic } from '../lib/notify';
import { money, fmtTime } from '../lib/format';
import { ORDER_FLOW, ORDER_META, RESERVATION_META } from '../lib/status';
import type { Dish, Order, OrderStatus, Reservation, Table, TableShape } from '../api/types';

export function QtyStepper({ value, onChange, compact }: { value: number; onChange: (v: number) => void; compact?: boolean }) {
  const s = compact ? 30 : 36;
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityLabel="Менше"
        onPress={() => {
          haptic.tap();
          onChange(value - 1);
        }}
        style={[styles.stepBtn, { width: s, height: s }]}
      >
        <Minus size={16} color={colors.goldLight} />
      </Pressable>
      <Text style={styles.stepVal}>{value}</Text>
      <Pressable
        accessibilityLabel="Більше"
        onPress={() => {
          haptic.tap();
          onChange(value + 1);
        }}
        style={[styles.stepBtn, { width: s, height: s }]}
      >
        <Plus size={16} color={colors.goldLight} />
      </Pressable>
    </View>
  );
}

export function AddButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityLabel="Додати в кошик"
      disabled={disabled}
      onPress={() => {
        haptic.light();
        onPress();
      }}
      style={({ pressed }) => ({ opacity: disabled ? 0.3 : 1, transform: [{ scale: pressed ? 0.9 : 1 }] })}
    >
      <LinearGradient colors={goldGradient} style={styles.addBtn}>
        <Plus size={20} color="#141008" strokeWidth={2.6} />
      </LinearGradient>
    </Pressable>
  );
}

/** Картка страви для сітки меню (2 колонки). */
export function DishTile({ dish, onPress, reason, width }: { dish: Dish; onPress: () => void; reason?: string; width: number }) {
  const cart = useCart();
  const qty = cart.qtyOf(dish.id);
  return (
    <PressableScale onPress={onPress} style={[styles.tile, { width }, !dish.isAvailable && { opacity: 0.55 }]}>
      <View>
        <DishImage uri={dish.imageUrl} category={dish.category?.slug} style={{ width: '100%', aspectRatio: 1 }} radius={18} />
        {dish.isChefChoice && (
          <LinearGradient colors={goldGradient} style={styles.tagChef}>
            <Text style={styles.tagChefText}>ШЕФ</Text>
          </LinearGradient>
        )}
        {!dish.isAvailable && (
          <View style={styles.soldOut}>
            <Text style={styles.soldOutText}>Немає</Text>
          </View>
        )}
      </View>
      <View style={{ paddingHorizontal: 4, paddingTop: 10, flex: 1 }}>
        <Text numberOfLines={2} style={styles.tileName}>
          {dish.name}
        </Text>
        {reason ? (
          <Text numberOfLines={1} style={styles.reason}>
            ✦ {reason}
          </Text>
        ) : (
          <View style={styles.metaRow}>
            {dish.avgRating !== null && (
              <View style={styles.meta}>
                <Star size={12} color={colors.gold} fill={colors.gold} />
                <Text style={styles.metaText}>{dish.avgRating.toFixed(1)}</Text>
              </View>
            )}
            <View style={styles.meta}>
              <Clock size={12} color={colors.faint} />
              <Text style={styles.metaText}>{dish.prepTimeMin} хв</Text>
            </View>
            {dish.isVegetarian && <Leaf size={12} color={colors.success} />}
            {dish.isSpicy && <Flame size={12} color={colors.danger} />}
          </View>
        )}
        <View style={styles.tileBottom}>
          <Text style={styles.price}>{money(dish.price)}</Text>
          {qty > 0 ? <QtyStepper compact value={qty} onChange={(v) => cart.setQty(dish.id, v)} /> : <AddButton disabled={!dish.isAvailable} onPress={() => cart.add(dish)} />}
        </View>
      </View>
    </PressableScale>
  );
}

/** Вертикальний трекер статусу замовлення з «пульсом» на активному кроці. */
export function OrderTimeline({ order }: { order: Order }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const current = ORDER_FLOW.indexOf(order.status);
  const times: Record<string, string | null> = {
    NEW: order.createdAt,
    CONFIRMED: order.confirmedAt,
    PREPARING: order.preparingAt,
    READY: order.readyAt,
    SERVED: order.servedAt,
    PAID: order.paidAt,
  };
  return (
    <View>
      {ORDER_FLOW.map((s: OrderStatus, i) => {
        const done = i < current;
        const active = i === current;
        const meta = ORDER_META[s];
        return (
          <View key={s} style={{ flexDirection: 'row', gap: 14 }}>
            <View style={{ alignItems: 'center', width: 28 }}>
              <View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                {active && (
                  <Animated.View
                    style={{
                      position: 'absolute',
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      borderWidth: 2,
                      borderColor: colors.gold,
                      opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
                      transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
                    }}
                  />
                )}
                {done ? (
                  <LinearGradient colors={goldGradient} style={styles.stepDot}>
                    <Check size={14} color="#141008" strokeWidth={3} />
                  </LinearGradient>
                ) : (
                  <View style={[styles.stepDot, { backgroundColor: active ? colors.goldSoft : colors.surfaceHigh, borderWidth: 1.5, borderColor: active ? colors.gold : colors.border }]}>
                    {active && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.gold }} />}
                  </View>
                )}
              </View>
              {i < ORDER_FLOW.length - 1 && <View style={{ width: 2, flex: 1, minHeight: 22, backgroundColor: done ? colors.gold : colors.border, borderRadius: 1 }} />}
            </View>
            <View style={{ flex: 1, paddingBottom: 18 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: active ? fonts.bold : fonts.semibold, fontSize: 15, color: active ? colors.goldLight : done ? colors.text : colors.faint }}>{meta.label}</Text>
                <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.faint }}>{times[s] ? fmtTime(times[s]!) : ''}</Text>
              </View>
              {active && <Caption style={{ marginTop: 2 }}>{meta.hint}</Caption>}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function OrderMiniProgress({ status }: { status: OrderStatus }) {
  const i = ORDER_FLOW.indexOf(status);
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {ORDER_FLOW.map((s, k) => (
        <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: k <= i ? colors.gold : 'rgba(255,255,255,0.08)' }} />
      ))}
    </View>
  );
}

export function OrderRow({ order, onPress }: { order: Order; onPress: () => void }) {
  const meta = ORDER_META[order.status];
  return (
    <PressableScale onPress={onPress} style={styles.row}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flexDirection: 'row' }}>
          {order.items.slice(0, 3).map((it, k) => (
            <DishImage key={it.id} uri={it.imageUrl} category={it.category.slug} size={38} radius={19} style={{ marginLeft: k ? -12 : 0, borderWidth: 2, borderColor: colors.surface }} />
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>
            #{order.id} · {money(order.total)}
          </Text>
          <Text numberOfLines={1} style={styles.rowSub}>
            {order.items.map((i) => i.name).join(', ')}
          </Text>
        </View>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </View>
      {!['PAID', 'CANCELLED'].includes(order.status) && (
        <View style={{ marginTop: 12 }}>
          <OrderMiniProgress status={order.status} />
        </View>
      )}
    </PressableScale>
  );
}

export function ReservationRow({ r, onPress }: { r: Reservation; onPress: () => void }) {
  const meta = RESERVATION_META[r.status];
  const d = new Date(r.startAt);
  return (
    <PressableScale onPress={onPress} style={[styles.row, { flexDirection: 'row', alignItems: 'center', gap: 14 }]}>
      <View style={styles.dateBox}>
        <Text style={styles.dateDay}>{new Intl.DateTimeFormat('uk-UA', { day: 'numeric', timeZone: 'Europe/Kyiv' }).format(d)}</Text>
        <Text style={styles.dateMonth}>{new Intl.DateTimeFormat('uk-UA', { month: 'short', timeZone: 'Europe/Kyiv' }).format(d)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>
          {r.time} · столик №{r.table.number}
        </Text>
        <Text style={styles.rowSub}>
          {r.guests} гост. · {r.code}
        </Text>
      </View>
      <Badge tone={meta.tone}>{meta.label}</Badge>
    </PressableScale>
  );
}

const SHAPE_SIZE = (seats: number, shape: TableShape) => {
  if (shape === 'ROUND') return { w: seats <= 2 ? 30 : 36, h: seats <= 2 ? 30 : 36, r: 99 };
  if (shape === 'SQUARE') return { w: 34, h: 34, r: 9 };
  return { w: seats >= 8 ? 64 : 54, h: 32, r: 9 };
};

/** Компактний план залу для мобільного бронювання. */
export function MiniFloorPlan<T extends Table & { state?: string; recommended?: boolean }>({ tables, selectedId, onSelect }: { tables: T[]; selectedId: number | null; onSelect: (t: T) => void }) {
  const { width } = useWindowDimensions();
  const w = Math.min(width - 40, 520);
  const h = w * 0.62;
  const zones: [string, number, number, number, number][] = [
    ['ЗАЛА', 1, 2, 66, 58],
    ['VIP', 69, 2, 30, 58],
    ['БАР', 1, 63, 32, 35],
    ['ТЕРАСА', 35, 63, 64, 35],
  ];
  return (
    <View style={{ width: w, height: h, borderRadius: 20, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
      {zones.map(([label, x, y, zw, zh]) => (
        <View key={label} style={{ position: 'absolute', left: (x / 100) * w, top: (y / 100) * h, width: (zw / 100) * w, height: (zh / 100) * h, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.07)' }}>
          <Text style={{ position: 'absolute', left: 8, top: 5, fontSize: 8, letterSpacing: 1.5, color: colors.faint, fontFamily: fonts.bold }}>{label}</Text>
        </View>
      ))}
      {tables.map((t) => {
        const s = SHAPE_SIZE(t.seats, t.shape);
        const selected = t.id === selectedId;
        const free = t.state === 'FREE';
        return (
          <Pressable
            key={t.id}
            disabled={!free}
            onPress={() => {
              haptic.tap();
              onSelect(t);
            }}
            style={{ position: 'absolute', left: (t.posX / 100) * w - s.w / 2, top: (t.posY / 100) * h - s.h / 2, width: s.w, height: s.h }}
          >
            {selected ? (
              <LinearGradient colors={goldGradient} style={{ flex: 1, borderRadius: s.r, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: '#141008' }}>{t.number}</Text>
              </LinearGradient>
            ) : (
              <View
                style={{
                  flex: 1,
                  borderRadius: s.r,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1.5,
                  borderColor: t.recommended ? colors.gold : free ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.05)',
                  backgroundColor: t.recommended ? colors.goldSoft : free ? colors.surfaceHigh : 'rgba(255,255,255,0.02)',
                }}
              >
                <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: free ? colors.text : colors.faint }}>{t.number}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 28, marginBottom: 14 }}>
      <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.text }}>{title}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.goldSoft, borderRadius: radius.pill, padding: 3, borderWidth: 1, borderColor: colors.goldBorder },
  stepBtn: { borderRadius: 99, alignItems: 'center', justifyContent: 'center' },
  stepVal: { minWidth: 18, textAlign: 'center', fontFamily: fonts.bold, fontSize: 14, color: colors.goldLight },
  addBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  tile: { backgroundColor: colors.surface, borderRadius: 24, padding: 8, borderWidth: 1, borderColor: colors.border },
  tagChef: { position: 'absolute', top: 8, left: 8, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  tagChefText: { fontFamily: fonts.bold, fontSize: 9, letterSpacing: 1, color: '#141008' },
  soldOut: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(8,8,11,0.65)', borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  soldOutText: { fontFamily: fonts.semibold, color: colors.text, fontSize: 12 },
  tileName: { fontFamily: fonts.display, fontSize: 15.5, lineHeight: 20, color: colors.text, minHeight: 40 },
  reason: { marginTop: 4, fontFamily: fonts.semibold, fontSize: 11, color: colors.gold },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontFamily: fonts.medium, fontSize: 11, color: colors.muted },
  tileBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingBottom: 4 },
  price: { fontFamily: fonts.bold, fontSize: 15, color: colors.goldLight },
  stepDot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  row: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  rowSub: { fontFamily: fonts.body, fontSize: 12.5, color: colors.muted, marginTop: 2 },
  dateBox: { width: 50, height: 54, borderRadius: 14, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.goldBorder },
  dateDay: { fontFamily: fonts.display, fontSize: 20, color: colors.goldLight },
  dateMonth: { fontFamily: fonts.semibold, fontSize: 10, color: colors.gold, textTransform: 'uppercase' },
});
