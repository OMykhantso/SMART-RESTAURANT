import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { Qr } from '../components/Qr';
import { Bike, CalendarPlus, ChevronRight, Clock, QrCode, Receipt, ScanLine, Sparkles, UtensilsCrossed, Wifi, WifiOff } from 'lucide-react-native';
import { Badge, Body, Button, Caption, DishImage, Eyebrow, PressableScale, Screen, Skeleton, Title } from '../components/ui';
import { OrderMiniProgress, SectionTitle } from '../components/domain';
import { DeliveryProgress } from '../components/delivery';
import { etaText, isActiveDelivery, useDeliveryInfo, useMyDeliveries } from '../lib/delivery';
import { useCart } from '../lib/cart';
import { colors, fonts, radius } from '../theme';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import { useCurrentVisit, useMyOrders, useRecommendations } from '../lib/queries';
import { fmtTime, greeting, guestsLabel, money, relativeDay, isoDay } from '../lib/format';
import { DELIVERY_META, ORDER_META, RESERVATION_META, ZONE_LABEL } from '../lib/status';
import type { Order, Reservation } from '../api/types';

export function HomeScreen() {
  const nav = useNavigation();
  const { user } = useAuth();
  const { connected } = useRealtime();
  const qc = useQueryClient();
  const visit = useCurrentVisit();
  const orders = useMyOrders();
  const recs = useRecommendations([], 8);
  const deliveries = useMyDeliveries();
  const info = useDeliveryInfo();
  const cart = useCart();
  const liveDeliveries = (deliveries.data ?? []).filter(isActiveDelivery);
  const [refreshing, setRefreshing] = useState(false);
  const active = visit.data?.active;
  const next = visit.data?.next;
  const visitOrders = (orders.data ?? []).filter((o) => o.reservationId === active?.id && o.status !== 'CANCELLED');

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await qc.invalidateQueries();
    setRefreshing(false);
  }, [qc]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}>
          <Caption>{greeting()},</Caption>
          <Title style={{ marginTop: 2 }}>{user?.name.split(' ')[0]} 👋</Title>
        </View>
        <View style={[styles.conn, { borderColor: connected ? 'rgba(52,211,153,0.3)' : 'rgba(251,113,133,0.3)' }]}>
          {connected ? <Wifi size={14} color={colors.success} /> : <WifiOff size={14} color={colors.danger} />}
          <Text style={{ fontFamily: fonts.semibold, fontSize: 11, color: connected ? colors.success : colors.danger }}>{connected ? 'Live' : 'Офлайн'}</Text>
        </View>
      </View>

      {visit.isLoading ? (
        <Skeleton height={180} style={{ marginTop: 22 }} />
      ) : active ? (
        <ActiveVisitCard r={active} total={visitOrders.reduce((s, o) => s + o.total, 0)} orders={visitOrders} />
      ) : next ? (
        <NextReservationCard r={next} />
      ) : liveDeliveries.length === 0 ? (
        <HeroCTA />
      ) : null}

      {liveDeliveries.slice(0, 2).map((o) => (
        <ActiveDeliveryCard key={o.id} o={o} />
      ))}
      {!active && liveDeliveries.length === 0 && (
        <DeliveryPromo
          fromPrice={info.data?.fromPrice ?? null}
          eta={info.data ? info.data.kitchenEtaMin + 15 : null}
          open={info.data?.window.isOpen ?? true}
          until={info.data?.window.lastOrderAt}
          nextOpen={info.data?.window.nextOpenLabel ?? null}
          onPress={() => (cart.count > 0 ? nav.navigate('Checkout') : nav.navigate('Tabs', { screen: 'Menu' }))}
        />
      )}

      <View style={styles.quick}>
        <QuickAction icon={<Bike size={22} color={colors.gold} />} label="Доставка" onPress={() => (cart.count > 0 ? nav.navigate('Checkout') : nav.navigate('Tabs', { screen: 'Menu' }))} />
        <QuickAction icon={<CalendarPlus size={22} color={colors.gold} />} label="Бронювати" onPress={() => nav.navigate('Booking')} />
        <QuickAction icon={<ScanLine size={22} color={colors.gold} />} label="Скан QR" onPress={() => nav.navigate('Scan')} />
        <QuickAction icon={<Receipt size={22} color={colors.gold} />} label="Історія" onPress={() => nav.navigate('Tabs', { screen: 'Visits', params: { tab: liveDeliveries.length ? 'deliveries' : 'reservations' } })} />
      </View>

      <SectionTitle
        title="Підібрано для вас"
        action={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Sparkles size={14} color={colors.gold} />
            <Caption style={{ color: colors.gold }}>AI-підбір</Caption>
          </View>
        }
      />
      {recs.isLoading ? (
        <Skeleton height={220} />
      ) : (
        <FlatList
          horizontal
          data={recs.data ?? []}
          keyExtractor={(r) => String(r.dish.id)}
          showsHorizontalScrollIndicator={false}
          style={{ marginHorizontal: -20 }}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 12 }}
          renderItem={({ item }) => (
            <PressableScale onPress={() => nav.navigate('Dish', { id: item.dish.id })} style={styles.rec}>
              <DishImage uri={item.dish.imageUrl} category={item.dish.category?.slug} style={{ width: '100%', height: 130 }} radius={18} />
              <View style={{ padding: 10 }}>
                <Text numberOfLines={1} style={{ fontFamily: fonts.display, fontSize: 16, color: colors.text }}>
                  {item.dish.name}
                </Text>
                <Text numberOfLines={1} style={{ fontFamily: fonts.semibold, fontSize: 11, color: colors.gold, marginTop: 3 }}>
                  ✦ {item.reasons[0] ?? 'Рекомендуємо'}
                </Text>
                <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: colors.goldLight, marginTop: 8 }}>{money(item.dish.price)}</Text>
              </View>
            </PressableScale>
          )}
        />
      )}

      <View style={styles.infoCard}>
        <Clock size={18} color={colors.gold} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.semibold, color: colors.text, fontSize: 14 }}>
            {info.data ? `Сьогодні до ${info.data.window.closesAt} · доставка до ${info.data.window.lastOrderAt}` : 'Сьогодні працюємо до 23:00'}
          </Text>
          <Caption>Київ, вул. Хрещатик, 1 · +380 44 123 45 67</Caption>
        </View>
      </View>
    </Screen>
  );
}

function ActiveVisitCard({ r, total, orders }: { r: Reservation; total: number; orders: import('../api/types').Order[] }) {
  const nav = useNavigation();
  const live = orders.filter((o) => o.status !== 'PAID');
  return (
    <LinearGradient colors={['rgba(52,211,153,0.16)', 'rgba(20,20,25,0.9)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.bigCard, { borderColor: 'rgba(52,211,153,0.3)' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }} />
        <Eyebrow style={{ color: colors.success }}>Ви в ресторані</Eyebrow>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10 }}>
        <View>
          <Title style={{ fontSize: 34 }}>Столик №{r.table.number}</Title>
          <Caption>
            {ZONE_LABEL[r.table.zone]} · до {r.endTime}
          </Caption>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Caption>Рахунок</Caption>
          <Text style={{ fontFamily: fonts.bold, fontSize: 22, color: colors.goldLight }}>{money(total)}</Text>
        </View>
      </View>
      {live.slice(0, 2).map((o) => (
        <Pressable key={o.id} onPress={() => nav.navigate('Order', { id: o.id })} style={styles.liveOrder}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ fontFamily: fonts.semibold, color: colors.text }}>Замовлення #{o.id}</Text>
            <Badge tone={ORDER_META[o.status].tone}>{ORDER_META[o.status].label}</Badge>
          </View>
          <OrderMiniProgress status={o.status} />
          {o.etaMinutes !== null && <Caption style={{ marginTop: 8 }}>Готовність через ~{o.etaMinutes} хв</Caption>}
        </Pressable>
      ))}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <Button title="Замовити" size="md" style={{ flex: 1 }} icon={<UtensilsCrossed size={18} color="#141008" />} onPress={() => nav.navigate('Tabs', { screen: 'Menu' })} />
        <Button title="Візит" size="md" variant="glass" style={{ flex: 1 }} onPress={() => nav.navigate('Reservation', { id: r.id })} />
      </View>
    </LinearGradient>
  );
}

function ActiveDeliveryCard({ o }: { o: Order }) {
  const nav = useNavigation();
  const meta = DELIVERY_META[o.status];
  const eta = o.delivery?.etaAt;
  return (
    <PressableScale onPress={() => nav.navigate('DeliveryOrder', { id: o.id })}>
      <LinearGradient
        colors={o.status === 'DELIVERING' ? ['rgba(125,211,252,0.18)', 'rgba(20,20,25,0.95)'] : ['rgba(220,171,74,0.16)', 'rgba(20,20,25,0.95)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.bigCard, o.status === 'DELIVERING' && { borderColor: 'rgba(125,211,252,0.35)' }]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Bike size={16} color={o.status === 'DELIVERING' ? colors.info : colors.gold} />
          <Eyebrow style={o.status === 'DELIVERING' ? { color: colors.info } : undefined}>Доставка #{o.id}</Eyebrow>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: 10 }}>
          <View style={{ flex: 1 }}>
            <Title style={{ fontSize: 28 }}>{o.status === 'NEW' ? 'Очікує оплати' : eta ? `о ${fmtTime(eta)}` : meta.label}</Title>
            <Caption numberOfLines={1}>{o.delivery?.addressLine}</Caption>
          </View>
          <Badge tone={meta.tone}>{meta.label}</Badge>
        </View>
        {o.status !== 'NEW' && (
          <View style={{ marginTop: 14 }}>
            <DeliveryProgress status={o.status} />
          </View>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <Body style={{ fontSize: 13, color: colors.muted, flex: 1 }}>
            {o.status === 'NEW' ? 'Оплатіть, щоб ми почали готувати' : o.delivery?.courier ? `Курʼєр: ${o.delivery.courier.name} · ${etaText(eta) ?? ''}` : meta.hint}
          </Body>
          <ChevronRight size={18} color={colors.gold} />
        </View>
      </LinearGradient>
    </PressableScale>
  );
}

function DeliveryPromo({ fromPrice, eta, open, until, nextOpen, onPress }: { fromPrice: number | null; eta: number | null; open: boolean; until?: string; nextOpen: string | null; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress}>
      <View style={styles.promo}>
        <LinearGradient colors={['#bae6fd', '#7dd3fc', '#38bdf8']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.promoIcon}>
          <Bike size={26} color="#0b1a24" />
        </LinearGradient>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 19, color: colors.text }}>Доставка додому</Text>
          <Caption style={{ marginTop: 2 }}>
            {open
              ? `${fromPrice != null ? `від ${money(fromPrice)}` : ''}${eta ? ` · ~${eta} хв` : ''}${until ? ` · до ${until}` : ''}`
              : `Зараз зачинено${nextOpen ? ` · відкриємось ${nextOpen}` : ''}`}
          </Caption>
        </View>
        <ChevronRight size={18} color={colors.info} />
      </View>
    </PressableScale>
  );
}

function NextReservationCard({ r }: { r: Reservation }) {
  const nav = useNavigation();
  const meta = RESERVATION_META[r.status];
  return (
    <PressableScale onPress={() => nav.navigate('Reservation', { id: r.id })}>
      <LinearGradient colors={['rgba(220,171,74,0.18)', 'rgba(20,20,25,0.95)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bigCard}>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Eyebrow>Наступний візит</Eyebrow>
            <Title style={{ fontSize: 28, marginTop: 8 }}>
              {relativeDay(isoDay(new Date(r.startAt)))}, {r.time}
            </Title>
            <Caption style={{ marginTop: 4 }}>
              Столик №{r.table.number} · {guestsLabel(r.guests)}
            </Caption>
            <View style={{ marginTop: 12 }}>
              <Badge tone={meta.tone}>{meta.label}</Badge>
            </View>
          </View>
          <View style={styles.qrBox}>{r.qrPayload ? <Qr value={r.qrPayload} size={84} /> : <QrCode size={60} color={colors.bg} />}</View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
          <Body style={{ fontSize: 13, color: colors.muted, flex: 1 }}>У ресторані відскануйте QR на столику — і ви в системі</Body>
          <ChevronRight size={18} color={colors.gold} />
        </View>
      </LinearGradient>
    </PressableScale>
  );
}

function HeroCTA() {
  const nav = useNavigation();
  return (
    <LinearGradient colors={['rgba(220,171,74,0.22)', 'rgba(20,20,25,0.95)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.bigCard}>
      <Eyebrow>Вечір, що організовує себе сам</Eyebrow>
      <Title style={{ fontSize: 28, marginTop: 10, lineHeight: 34 }}>
        Забронюйте столик{'\n'}за <Text style={{ fontFamily: fonts.displayItalic, color: colors.goldLight }}>30 секунд</Text>
      </Title>
      <Body style={{ marginTop: 8, color: colors.muted }}>Алгоритм підбере найкращий столик під вашу компанію.</Body>
      <Button title="Обрати час" style={{ marginTop: 18 }} icon={<CalendarPlus size={18} color="#141008" />} onPress={() => nav.navigate('Booking')} />
    </LinearGradient>
  );
}

function QuickAction({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} style={styles.qa}>
      <View style={styles.qaIcon}>{icon}</View>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: colors.textSoft }}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  conn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, borderWidth: 1 },
  bigCard: { marginTop: 22, borderRadius: radius.xl, padding: 20, borderWidth: 1, borderColor: colors.goldBorder },
  liveOrder: { marginTop: 14, padding: 14, borderRadius: 18, backgroundColor: 'rgba(8,8,11,0.5)', borderWidth: 1, borderColor: colors.border },
  qrBox: { backgroundColor: colors.text, borderRadius: 18, padding: 8, alignSelf: 'flex-start' },
  quick: { flexDirection: 'row', gap: 10, marginTop: 18 },
  qa: { flex: 1, alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  qaIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  rec: { width: 180, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, padding: 6 },
  promo: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14, padding: 16, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: 'rgba(125,211,252,0.25)' },
  promoIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  infoCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24, padding: 16, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
});

