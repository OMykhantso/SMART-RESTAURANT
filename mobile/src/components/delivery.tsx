import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Bike, Check, ChefHat, ClipboardCheck, CreditCard, House, MapPin, PackageCheck, Phone, Star, Wallet } from 'lucide-react-native';
import { colors, fonts, goldGradient, radius } from '../theme';
import { Badge, Caption, DishImage, PressableScale } from './ui';
import { haptic } from '../lib/notify';
import { fmtDateShort, fmtTime, money } from '../lib/format';
import { DELIVERY_FLOW, DELIVERY_META } from '../lib/status';
import { etaText, formatPhone } from '../lib/delivery';
import type { Address, DeliveryZone, Order, OrderStatus } from '../api/types';

const STEP_ICON: Partial<Record<OrderStatus, (c: string) => ReactNode>> = {
  CONFIRMED: (c) => <ClipboardCheck size={15} color={c} />,
  PREPARING: (c) => <ChefHat size={15} color={c} />,
  READY: (c) => <PackageCheck size={15} color={c} />,
  DELIVERING: (c) => <Bike size={15} color={c} />,
  DELIVERED: (c) => <House size={15} color={c} />,
};

const STEP_LABEL: Partial<Record<OrderStatus, string>> = {
  CONFIRMED: 'Прийнято',
  PREPARING: 'Готуємо',
  READY: 'Готово',
  DELIVERING: 'В дорозі',
  DELIVERED: 'Вручено',
};

function stepTime(o: Order, s: OrderStatus): string | null {
  const d = o.delivery;
  const t = { CONFIRMED: o.confirmedAt, PREPARING: o.preparingAt, READY: o.readyAt, DELIVERING: d?.pickedUpAt, DELIVERED: d?.deliveredAt }[s as 'CONFIRMED'];
  return t ? fmtTime(t) : null;
}

/** Горизонтальний трекер доставки: 5 кроків з іконками, часом і «пульсом» на поточному. */
export function DeliveryStepper({ order }: { order: Order }) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const current = DELIVERY_FLOW.indexOf(order.status);
  return (
    <View>
      <View style={styles.stepTrack}>
        <View style={[styles.stepFill, { width: `${(Math.max(0, current) / (DELIVERY_FLOW.length - 1)) * 100}%` }]} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -18 }}>
        {DELIVERY_FLOW.map((s, i) => {
          const done = i < current || order.status === 'DELIVERED';
          const active = i === current && order.status !== 'DELIVERED';
          const iconColor = done ? '#141008' : active ? colors.goldLight : colors.faint;
          return (
            <View key={s} style={{ alignItems: 'center', width: 62 }}>
              <View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}>
                {active && (
                  <Animated.View
                    style={[
                      styles.stepPulse,
                      {
                        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
                        transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.8] }) }],
                      },
                    ]}
                  />
                )}
                {done ? (
                  <LinearGradient colors={goldGradient} style={styles.stepDot}>
                    {s === 'DELIVERED' && order.status === 'DELIVERED' ? <Check size={16} color="#141008" strokeWidth={3} /> : STEP_ICON[s]?.(iconColor)}
                  </LinearGradient>
                ) : (
                  <View style={[styles.stepDot, { backgroundColor: active ? colors.goldSoft : colors.surfaceHigh, borderWidth: 1.5, borderColor: active ? colors.gold : colors.border }]}>
                    {STEP_ICON[s]?.(iconColor)}
                  </View>
                )}
              </View>
              <Text numberOfLines={1} style={{ marginTop: 6, fontFamily: active ? fonts.bold : fonts.semibold, fontSize: 11, color: active ? colors.goldLight : done ? colors.text : colors.faint }}>
                {STEP_LABEL[s]}
              </Text>
              <Text style={{ fontFamily: fonts.medium, fontSize: 10.5, color: colors.faint, marginTop: 1 }}>{stepTime(order, s) ?? ' '}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Міні-прогрес для списків. */
export function DeliveryProgress({ status }: { status: OrderStatus }) {
  const i = DELIVERY_FLOW.indexOf(status);
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {DELIVERY_FLOW.map((s, k) => (
        <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: k <= i ? (s === 'DELIVERING' || s === 'DELIVERED' ? colors.info : colors.gold) : 'rgba(255,255,255,0.08)' }} />
      ))}
    </View>
  );
}

/** Велика анімована «сцена» статусу доставки з прогнозом часу. */
export function DeliveryHero({ order }: { order: Order }) {
  const ride = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (order.status !== 'DELIVERING') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(ride, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(ride, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [order.status, ride]);
  const meta = DELIVERY_META[order.status];
  const eta = order.delivery?.etaAt;
  const icon =
    order.status === 'DELIVERING' ? (
      <Animated.View style={{ transform: [{ translateX: ride.interpolate({ inputRange: [0, 1], outputRange: [-4, 4] }) }] }}>
        <Bike size={34} color="#141008" />
      </Animated.View>
    ) : order.status === 'DELIVERED' ? (
      <House size={32} color="#141008" />
    ) : order.status === 'READY' ? (
      <PackageCheck size={32} color="#141008" />
    ) : order.status === 'NEW' ? (
      <CreditCard size={30} color="#141008" />
    ) : (
      <ChefHat size={32} color="#141008" />
    );
  const big =
    order.status === 'DELIVERED'
      ? `о ${fmtTime(order.delivery?.deliveredAt ?? order.createdAt)}`
      : order.status === 'CANCELLED'
        ? 'Скасовано'
        : eta
          ? `о ${fmtTime(eta)}`
          : '—';
  return (
    <LinearGradient
      colors={order.status === 'DELIVERING' ? ['rgba(125,211,252,0.18)', 'rgba(20,20,25,0.96)'] : ['rgba(220,171,74,0.18)', 'rgba(20,20,25,0.96)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.hero, order.status === 'DELIVERING' && { borderColor: 'rgba(125,211,252,0.35)' }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <LinearGradient colors={order.status === 'DELIVERING' ? ['#bae6fd', '#7dd3fc', '#38bdf8'] : goldGradient} style={styles.heroIcon}>
          {icon}
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Badge tone={meta.tone}>{meta.label}</Badge>
          <Caption style={{ marginTop: 8 }}>{order.status === 'DELIVERED' ? 'Доставили' : order.status === 'CANCELLED' ? order.cancelReason ?? '' : 'Привеземо'}</Caption>
          <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.text, marginTop: -2 }}>{big}</Text>
          {['CONFIRMED', 'PREPARING', 'READY', 'DELIVERING'].includes(order.status) && eta ? <Caption style={{ color: colors.goldLight }}>{etaText(eta)}</Caption> : null}
        </View>
      </View>
      <Text style={{ fontFamily: fonts.medium, color: colors.textSoft, fontSize: 13.5, marginTop: 14 }}>{meta.hint}</Text>
    </LinearGradient>
  );
}

export function CourierCard({ courier, status }: { courier: { id: number; name: string; phone: string | null }; status: OrderStatus }) {
  const initials = courier.name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
  return (
    <View style={styles.courier}>
      <View style={styles.courierAvatar}>
        <Text style={{ fontFamily: fonts.display, color: colors.info, fontSize: 18 }}>{initials}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.semibold, color: colors.text, fontSize: 15 }}>{courier.name}</Text>
        <Caption>{status === 'DELIVERING' ? 'Везе ваше замовлення' : status === 'DELIVERED' ? 'Доставив замовлення' : 'Ваш курʼєр · забере, щойно буде готово'}</Caption>
      </View>
      {courier.phone && status !== 'DELIVERED' ? (
        <Pressable
          accessibilityLabel="Подзвонити курʼєру"
          onPress={() => {
            haptic.tap();
            Linking.openURL(`tel:${courier.phone}`).catch(() => undefined);
          }}
          style={styles.callBtn}
        >
          <Phone size={18} color={colors.info} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Рядок доставки в історії / на головній. */
export function DeliveryRow({ order, onPress }: { order: Order; onPress: () => void }) {
  const meta = DELIVERY_META[order.status];
  const active = ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERING'].includes(order.status);
  return (
    <PressableScale onPress={onPress} style={styles.row}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flexDirection: 'row' }}>
          {order.items.slice(0, 3).map((it, k) => (
            <DishImage key={it.id} uri={it.imageUrl} category={it.category.slug} size={38} radius={19} style={{ marginLeft: k ? -12 : 0, borderWidth: 2, borderColor: colors.surface }} />
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            Доставка #{order.id}
          </Text>
          <Text numberOfLines={1} style={styles.rowSub}>
            {fmtDateShort(order.createdAt)}, {fmtTime(order.createdAt)} · {order.delivery?.zone.name}
          </Text>
        </View>
        <Text style={{ fontFamily: fonts.bold, color: colors.goldLight, fontSize: 15 }}>{money(order.total)}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
        <Badge tone={meta.tone}>{meta.label}</Badge>
        {order.hasReview && order.status === 'DELIVERED' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Star size={12} color={colors.gold} fill={colors.gold} />
            <Caption>Ви оцінили</Caption>
          </View>
        ) : order.actions.canReview ? (
          <Caption style={{ color: colors.gold }}>Оцініть доставку →</Caption>
        ) : (
          <Caption numberOfLines={1} style={{ flexShrink: 1, marginLeft: 10 }}>
            {order.delivery?.street}, {order.delivery?.house}
          </Caption>
        )}
      </View>
      {active && order.status !== 'NEW' && (
        <View style={{ marginTop: 12 }}>
          <DeliveryProgress status={order.status} />
          {order.delivery?.etaAt ? <Caption style={{ marginTop: 8 }}>Привеземо о {fmtTime(order.delivery.etaAt)} · {etaText(order.delivery.etaAt)}</Caption> : null}
        </View>
      )}
    </PressableScale>
  );
}

/** Картка збереженої адреси (вибір у кошику, список у профілі). */
export function AddressCard({ address, selected, onPress, right }: { address: Address; selected?: boolean; onPress?: () => void; right?: ReactNode }) {
  const line = [`${address.street}, ${address.house}`, address.apartment && `кв. ${address.apartment}`].filter(Boolean).join(', ');
  return (
    <Pressable
      onPress={() => {
        if (!onPress) return;
        haptic.tap();
        onPress();
      }}
      style={[styles.address, selected && { borderColor: colors.goldBorder, backgroundColor: colors.goldSoft }]}
    >
      <View style={[styles.addressIcon, selected && { backgroundColor: colors.gold }]}>
        {address.label.toLowerCase().includes('дім') ? <House size={18} color={selected ? '#141008' : colors.gold} /> : <MapPin size={18} color={selected ? '#141008' : colors.gold} />}
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontFamily: fonts.semibold, color: colors.text, fontSize: 15 }}>{address.label}</Text>
          {address.isDefault ? <Star size={12} color={colors.gold} fill={colors.gold} /> : null}
        </View>
        <Text numberOfLines={1} style={{ fontFamily: fonts.medium, color: colors.textSoft, fontSize: 13, marginTop: 2 }}>
          {line}
        </Text>
        <Caption style={{ marginTop: 2 }}>
          {address.zone.name} · доставка {address.zone.fee ? money(address.zone.fee) : 'безкоштовна'} · ~{address.zone.travelMin} хв у дорозі
        </Caption>
      </View>
      {right ?? (selected !== undefined ? <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <Check size={13} color="#141008" strokeWidth={3} /> : null}</View> : null)}
    </Pressable>
  );
}

/** Вибір району доставки: вартість, мінімальна сума і час у дорозі. */
export function ZonePicker({ zones, value, onChange }: { zones: DeliveryZone[]; value: number | null; onChange: (id: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {zones.map((z) => {
        const on = z.id === value;
        return (
          <Pressable
            key={z.id}
            disabled={!z.isActive}
            onPress={() => {
              haptic.tap();
              onChange(z.id);
            }}
            style={[styles.zone, on && { borderColor: colors.goldBorder, backgroundColor: colors.goldSoft }, !z.isActive && { opacity: 0.4 }]}
          >
            <Text style={{ fontFamily: fonts.semibold, color: on ? colors.goldLight : colors.text, fontSize: 13.5 }}>{z.name}</Text>
            <Text style={{ fontFamily: fonts.medium, color: colors.muted, fontSize: 11, marginTop: 2 }}>
              {money(z.fee)} · від {money(z.minOrder)} · {z.travelMin} хв
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PaymentLine({ order }: { order: Order }) {
  const d = order.delivery;
  if (!d) return null;
  const text = order.payment
    ? order.payment.method === 'CARD'
      ? `Оплачено карткою ${order.payment.cardBrand ?? ''} •• ${order.payment.cardLast4 ?? ''}`
      : `Оплачено готівкою курʼєру`
    : order.refunded
      ? `Кошти ${money(order.refunded.amount)} повернуто на картку`
      : d.paymentMethod === 'CASH'
        ? `Готівкою курʼєру${d.changeFrom ? ` · решта з ${money(d.changeFrom)}` : ''}`
        : 'Онлайн-оплата карткою';
  const ok = Boolean(order.payment) || Boolean(order.refunded);
  return (
    <View style={[styles.payLine, { backgroundColor: ok ? colors.successSoft : 'rgba(255,255,255,0.04)' }]}>
      {d.paymentMethod === 'CASH' ? <Wallet size={17} color={ok ? colors.success : colors.gold} /> : <CreditCard size={17} color={ok ? colors.success : colors.gold} />}
      <Text style={{ flex: 1, fontFamily: fonts.medium, color: ok ? colors.success : colors.textSoft, fontSize: 13.5 }}>{text}</Text>
    </View>
  );
}

export { formatPhone };

const styles = StyleSheet.create({
  stepTrack: { height: 3, marginHorizontal: 31, marginTop: 17, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  stepFill: { height: '100%', backgroundColor: colors.gold, borderRadius: 2 },
  stepDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepPulse: { position: 'absolute', width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: colors.gold },
  hero: { borderRadius: radius.xl, padding: 20, borderWidth: 1, borderColor: colors.goldBorder },
  heroIcon: { width: 72, height: 72, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  courier: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(125,211,252,0.25)' },
  courierAvatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.infoSoft, alignItems: 'center', justifyContent: 'center' },
  callBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.infoSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(125,211,252,0.3)' },
  row: { padding: 14, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  rowTitle: { fontFamily: fonts.semibold, color: colors.text, fontSize: 15 },
  rowSub: { fontFamily: fonts.medium, color: colors.muted, fontSize: 12.5, marginTop: 2 },
  address: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  addressIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  zone: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.03)', minWidth: '47%', flexGrow: 1 },
  payLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, padding: 12, borderRadius: 14 },
});
