import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { confirmAction } from '../lib/confirm';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import Svg, { Circle } from 'react-native-svg';
import { Bike, CalendarPlus, CircleCheck, CreditCard, DoorOpen, MessageSquareHeart, Receipt, UtensilsCrossed, XCircle } from 'lucide-react-native';
import { Badge, Body, Button, Caption, Card, Divider, DishImage, EmptyState, Eyebrow, Header, Screen, Skeleton, Title } from '../components/ui';
import { OrderRow, OrderTimeline, ReservationRow } from '../components/domain';
import { DeliveryRow } from '../components/delivery';
import { isActiveDelivery, useMyDeliveries } from '../lib/delivery';
import { Qr } from '../components/Qr';
import { colors, fonts, goldGradient, radius } from '../theme';
import { api } from '../api/client';
import { useMyOrders, useMyReservations } from '../lib/queries';
import { haptic } from '../lib/notify';
import { useToast } from '../lib/toast';
import { fmtFullDate, fmtTime, money } from '../lib/format';
import { ORDER_META, RESERVATION_META, ZONE_LABEL, placeOf } from '../lib/status';
import type { Order, Reservation } from '../api/types';
import type { ScreenProps, TabParamList } from '../navigation/types';

export function VisitsScreen() {
  const nav = useNavigation();
  const route = useRoute<RouteProp<TabParamList, 'Visits'>>();
  const [tab, setTab] = useState<'deliveries' | 'reservations' | 'orders'>(route.params?.tab ?? 'reservations');
  const reservations = useMyReservations();
  const orders = useMyOrders();
  const deliveries = useMyDeliveries();
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    if (route.params?.tab) setTab(route.params.tab);
  }, [route.params?.tab]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    await qc.invalidateQueries();
    setRefreshing(false);
  }, [qc]);
  const upcoming = (reservations.data ?? []).filter((r) => ['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(r.status));
  const past = (reservations.data ?? []).filter((r) => !['PENDING', 'CONFIRMED', 'CHECKED_IN'].includes(r.status));

  return (
    <Screen refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.gold} />}>
      <Title>Історія</Title>
      <View style={styles.segment}>
        {(['deliveries', 'reservations', 'orders'] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => {
              haptic.tap();
              setTab(t);
            }}
            style={{ flex: 1 }}
          >
            {tab === t ? (
              <LinearGradient colors={goldGradient} style={styles.segBtn}>
                <Text style={[styles.segText, { color: '#141008' }]}>{SEG_LABEL[t]}</Text>
              </LinearGradient>
            ) : (
              <View style={styles.segBtn}>
                <Text style={styles.segText}>{SEG_LABEL[t]}</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
      {tab === 'deliveries' ? (
        deliveries.isLoading ? (
          <Skeleton height={200} />
        ) : !deliveries.data?.length ? (
          <EmptyState
            icon={<Bike size={26} color={colors.gold} />}
            title="Доставок ще не було"
            text="Додайте страви в кошик і оформіть доставку додому — привеземо гарячим"
            action={<Button title="До меню" onPress={() => nav.navigate('Tabs', { screen: 'Menu' })} />}
          />
        ) : (
          <>
            {deliveries.data.some(isActiveDelivery) && <Eyebrow style={{ marginBottom: 10 }}>Зараз</Eyebrow>}
            {deliveries.data.filter(isActiveDelivery).map((o) => (
              <DeliveryRow key={o.id} order={o} onPress={() => nav.navigate('DeliveryOrder', { id: o.id })} />
            ))}
            {deliveries.data.some((o) => !isActiveDelivery(o)) && <Eyebrow style={{ marginTop: 14, marginBottom: 10, color: colors.muted }}>Раніше</Eyebrow>}
            {deliveries.data
              .filter((o) => !isActiveDelivery(o))
              .slice(0, 40)
              .map((o) => (
                <DeliveryRow key={o.id} order={o} onPress={() => nav.navigate('DeliveryOrder', { id: o.id })} />
              ))}
          </>
        )
      ) : tab === 'reservations' ? (
        reservations.isLoading ? (
          <Skeleton height={200} />
        ) : (
          <>
            <Eyebrow style={{ marginBottom: 10 }}>Майбутні</Eyebrow>
            {upcoming.length === 0 ? (
              <EmptyState icon={<CalendarPlus size={26} color={colors.gold} />} title="Немає активних бронювань" action={<Button title="Забронювати столик" onPress={() => nav.navigate('Booking')} />} />
            ) : (
              upcoming.map((r) => <ReservationRow key={r.id} r={r} onPress={() => nav.navigate('Reservation', { id: r.id })} />)
            )}
            {past.length > 0 && (
              <>
                <Eyebrow style={{ marginTop: 24, marginBottom: 10, color: colors.muted }}>Історія</Eyebrow>
                {past.slice(0, 30).map((r) => (
                  <ReservationRow key={r.id} r={r} onPress={() => nav.navigate('Reservation', { id: r.id })} />
                ))}
              </>
            )}
          </>
        )
      ) : orders.isLoading ? (
        <Skeleton height={200} />
      ) : !orders.data?.length ? (
        <EmptyState icon={<UtensilsCrossed size={26} color={colors.gold} />} title="Замовлень ще немає" text="Після check-in за столиком замовляйте прямо з телефона" />
      ) : (
        orders.data.map((o) => <OrderRow key={o.id} order={o} onPress={() => nav.navigate('Order', { id: o.id })} />)
      )}
    </Screen>
  );
}

const SEG_LABEL = { deliveries: 'Доставка', reservations: 'Бронювання', orders: 'У залі' } as const;

export function ReservationScreen({ route, navigation }: ScreenProps<'Reservation'>) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: r } = useQuery({ queryKey: ['reservation', route.params.id], queryFn: () => api.get<Reservation>(`/reservations/${route.params.id}`) });
  const orders = useMyOrders();
  const pop = useRef(new Animated.Value(route.params.justCreated ? 0 : 1)).current;
  useEffect(() => {
    if (route.params.justCreated) Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  }, [pop, route.params.justCreated]);
  const visitOrders = (orders.data ?? []).filter((o) => o.reservationId === route.params.id);

  const transition = useMutation({
    mutationFn: (status: 'CANCELLED' | 'COMPLETED') => api.patch<Reservation>(`/reservations/${route.params.id}/status`, { status, reason: status === 'CANCELLED' ? 'Скасовано гостем у застосунку' : undefined }),
    onSuccess: (res) => {
      haptic.success();
      qc.invalidateQueries();
      toast({ title: res.status === 'COMPLETED' ? 'Дякуємо за візит! ❤️' : 'Бронювання скасовано', tone: res.status === 'COMPLETED' ? 'gold' : 'muted' });
    },
    onError: (e) => {
      haptic.error();
      toast({ title: (e as Error).message, tone: 'danger' });
    },
  });

  if (!r) {
    return (
      <Screen edges={['top']}>
        <Header title="Бронювання" />
        <Skeleton height={380} />
      </Screen>
    );
  }
  const meta = RESERVATION_META[r.status];
  const showQr = ['PENDING', 'CONFIRMED'].includes(r.status) && r.qrPayload;

  return (
    <Screen edges={['top']}>
      <Header title={r.code} subtitle={meta.label} />
      {route.params.justCreated && (
        <Animated.View style={[styles.created, { transform: [{ scale: pop }], opacity: pop }]}>
          <CircleCheck size={22} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.semibold, color: colors.text }}>Заявку прийнято!</Text>
            <Caption>Хостес підтвердить її найближчим часом — ви отримаєте сповіщення.</Caption>
          </View>
        </Animated.View>
      )}
      <LinearGradient colors={['rgba(220,171,74,0.16)', 'rgba(20,20,25,0.96)']} style={styles.ticket}>
        <Badge tone={meta.tone}>{meta.label}</Badge>
        <Title style={{ fontSize: 26, marginTop: 12 }}>{fmtFullDate(r.startAt)}</Title>
        <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: colors.goldLight, marginTop: 4 }}>
          {r.time} – {r.endTime}
        </Text>
        <View style={styles.infoRow}>
          <Info label="Столик" value={`№${r.table.number}`} />
          <Info label="Зона" value={ZONE_LABEL[r.table.zone]} />
          <Info label="Гості" value={String(r.guests)} />
        </View>
        {showQr && (
          <>
            <View style={styles.perforation} />
            <View style={{ alignItems: 'center' }}>
              <View style={styles.qrWrap}>
                <Qr value={r.qrPayload!} size={200} />
              </View>
              <Text style={styles.code}>{r.code}</Text>
              <Caption style={{ textAlign: 'center', marginTop: 8, paddingHorizontal: 10 }}>Покажіть хостес або відскануйте QR на столику, коли прийдете (доступно за 60 хв до початку)</Caption>
            </View>
          </>
        )}
        {r.notes && <Body style={{ marginTop: 14, color: colors.muted }}>«{r.notes}»</Body>}
        {r.cancelReason && <Text style={{ marginTop: 12, color: colors.danger, fontFamily: fonts.medium }}>Причина: {r.cancelReason}</Text>}
      </LinearGradient>

      <View style={{ gap: 10, marginTop: 18 }}>
        {r.status === 'CHECKED_IN' && <Button title="Замовити страви" icon={<UtensilsCrossed size={18} color="#141008" />} onPress={() => navigation.navigate('Tabs', { screen: 'Menu' })} />}
        {r.status === 'CHECKED_IN' &&
          (r.actions.canComplete ? (
            <Button title="Завершити візит" variant="success" icon={<DoorOpen size={18} color={colors.success} />} loading={transition.isPending} onPress={() => transition.mutate('COMPLETED')} />
          ) : (
            r.unpaidOrdersCount > 0 && <Caption style={{ textAlign: 'center' }}>Щоб завершити візит, оплатіть замовлення ({r.unpaidOrdersCount})</Caption>
          ))}
        {['PENDING', 'CONFIRMED'].includes(r.status) &&
          (r.actions.canCancel ? (
            <Button
              title="Скасувати бронювання"
              variant="danger"
              icon={<XCircle size={18} color={colors.danger} />}
              onPress={() => confirmAction('Скасувати бронювання?', `${r.time}, столик №${r.table.number}`, 'Так, скасувати', () => transition.mutate('CANCELLED'))}
            />
          ) : (
            <Caption style={{ textAlign: 'center' }}>Онлайн-скасування недоступне менш ніж за годину до візиту</Caption>
          ))}
      </View>

      {visitOrders.length > 0 && (
        <>
          <Eyebrow style={{ marginTop: 26, marginBottom: 10 }}>Замовлення візиту</Eyebrow>
          {visitOrders.map((o) => (
            <OrderRow key={o.id} order={o} onPress={() => navigation.navigate('Order', { id: o.id })} />
          ))}
        </>
      )}
    </Screen>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Caption>{label}</Caption>
      <Text style={{ fontFamily: fonts.semibold, color: colors.text, fontSize: 15, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

/** Кільцевий індикатор часу до готовності (ETA). */
function EtaRing({ minutes, total }: { minutes: number; total: number }) {
  const size = 110;
  const r = 46;
  const c = 2 * Math.PI * r;
  const progress = total > 0 ? Math.min(1, Math.max(0.05, 1 - minutes / total)) : 1;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={8} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.gold} strokeWidth={8} fill="none" strokeLinecap="round" strokeDasharray={`${c}`} strokeDashoffset={c * (1 - progress)} />
      </Svg>
      <Text style={{ fontFamily: fonts.bold, fontSize: 28, color: colors.text }}>{minutes}</Text>
      <Caption>хв</Caption>
    </View>
  );
}

export function OrderScreen({ route, navigation }: ScreenProps<'Order'>) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: o } = useQuery({ queryKey: ['order', route.params.id], queryFn: () => api.get<Order>(`/orders/${route.params.id}`), refetchInterval: 30_000 });
  const cancel = useMutation({
    mutationFn: () => api.patch(`/orders/${route.params.id}/status`, { status: 'CANCELLED' }),
    onSuccess: () => {
      qc.invalidateQueries();
      toast({ title: 'Замовлення скасовано', tone: 'muted' });
    },
    onError: (e) => toast({ title: (e as Error).message, tone: 'danger' }),
  });
  // доставку відстежуємо на окремому екрані (Delivery API)
  useEffect(() => {
    if (o?.type === 'DELIVERY') navigation.replace('DeliveryOrder', { id: o.id });
  }, [o?.type, o?.id, navigation]);
  if (!o) {
    return (
      <Screen edges={['top']}>
        <Header title="Замовлення" />
        <Skeleton height={380} />
      </Screen>
    );
  }
  const meta = ORDER_META[o.status];
  const maxPrep = Math.max(...o.items.map((i) => i.prepTimeMin), 1);

  return (
    <Screen edges={['top']}>
      <Header title={`Замовлення #${o.id}`} subtitle={`${placeOf(o)} · ${fmtTime(o.createdAt)}`} />
      <LinearGradient colors={['rgba(220,171,74,0.14)', 'rgba(20,20,25,0.96)']} style={styles.statusCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ flex: 1 }}>
            <Badge tone={meta.tone}>{meta.label}</Badge>
            <Title style={{ fontSize: 26, marginTop: 10 }}>{meta.hint}</Title>
          </View>
          {o.etaMinutes !== null && <EtaRing minutes={o.etaMinutes} total={maxPrep + 5} />}
        </View>
        {o.status === 'CANCELLED' ? (
          <Text style={{ marginTop: 14, color: colors.danger, fontFamily: fonts.medium }}>{o.cancelReason}</Text>
        ) : (
          <View style={{ marginTop: 20 }}>
            <OrderTimeline order={o} />
          </View>
        )}
      </LinearGradient>

      <View style={{ gap: 10, marginTop: 16 }}>
        {o.actions.canPay && <Button title={`Оплатити ${money(o.total)}`} icon={<CreditCard size={18} color="#141008" />} onPress={() => navigation.navigate('Payment', { orderId: o.id })} />}
        {o.actions.canReview && <Button title="Оцінити візит" variant="outline" icon={<MessageSquareHeart size={18} color={colors.goldLight} />} onPress={() => navigation.navigate('Review', { orderId: o.id })} />}
        {o.actions.canCancel && <Button title="Скасувати замовлення" variant="danger" loading={cancel.isPending} onPress={() => cancel.mutate()} />}
      </View>

      <Card style={{ marginTop: 18 }}>
        <Eyebrow style={{ marginBottom: 6 }}>Страви</Eyebrow>
        {o.items.map((i) => (
          <View key={i.id} style={styles.item}>
            <DishImage uri={i.imageUrl} category={i.category.slug} size={48} radius={14} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.semibold, color: colors.text }}>
                {i.quantity} × {i.name}
              </Text>
              <Caption>{i.status === 'READY' ? '✓ готово' : i.status === 'COOKING' ? '● готується' : '○ у черзі'}</Caption>
              {i.notes ? <Caption style={{ fontStyle: 'italic' }}>«{i.notes}»</Caption> : null}
            </View>
            <Text style={{ fontFamily: fonts.semibold, color: colors.textSoft }}>{money(i.lineTotal)}</Text>
          </View>
        ))}
        <Divider />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <Body>Разом</Body>
          <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.goldLight }}>{money(o.total)}</Text>
        </View>
        {o.payment && (
          <View style={styles.paid}>
            <Receipt size={18} color={colors.success} />
            <Text style={{ flex: 1, fontFamily: fonts.medium, color: colors.success }}>
              Оплачено {o.payment.method === 'CARD' ? `${o.payment.cardBrand} •• ${o.payment.cardLast4}` : 'готівкою'}
              {o.payment.tip ? ` · чайові ${money(o.payment.tip)}` : ''}
            </Text>
          </View>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  segment: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginVertical: 18 },
  segBtn: { height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segText: { fontFamily: fonts.semibold, fontSize: 14, color: colors.muted },
  created: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.successSoft, borderWidth: 1, borderColor: 'rgba(52,211,153,0.3)', marginBottom: 14 },
  ticket: { borderRadius: radius.xl, padding: 20, borderWidth: 1, borderColor: colors.goldBorder },
  infoRow: { flexDirection: 'row', marginTop: 18, gap: 10 },
  perforation: { height: 1, borderStyle: 'dashed', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', marginVertical: 20 },
  qrWrap: { padding: 10, borderRadius: 24, backgroundColor: colors.text, shadowColor: colors.gold, shadowOpacity: 0.4, shadowRadius: 24, elevation: 8 },
  code: { fontFamily: fonts.bold, fontSize: 18, letterSpacing: 6, color: colors.goldLight, marginTop: 14 },
  statusCard: { borderRadius: radius.xl, padding: 20, borderWidth: 1, borderColor: colors.goldBorder },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  paid: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, padding: 12, borderRadius: 14, backgroundColor: colors.successSoft },
});
