import { useCallback, useState } from 'react';
import { Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { Banknote, Bike, ChefHat, Clock, CreditCard, HandCoins, House, MapPin, Navigation, PackageCheck, Phone, Route, Timer, Undo2, Wallet } from 'lucide-react-native';
import { Badge, Button, Caption, EmptyState, Eyebrow, Screen, Skeleton, Title } from '../../components/ui';
import { StatTile } from '../../components/staff';
import { formatPhone } from '../../components/delivery';
import { colors, fonts, goldGradient, radius } from '../../theme';
import { useAuth } from '../../lib/auth';
import { useRealtime } from '../../lib/realtime';
import { confirmAction } from '../../lib/confirm';
import { haptic } from '../../lib/notify';
import { fmtDateShort, fmtTime, minutesSince, money } from '../../lib/format';
import { DELIVERY_META } from '../../lib/status';
import { mapsUrl, useCourierAction, useCourierOrders, useCourierSummary } from '../../lib/delivery';
import type { Order } from '../../api/types';

function useRefresh() {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ['courier'] });
    setRefreshing(false);
  }, [qc]);
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />;
}

function CourierHeader({ title, subtitle }: { title: string; subtitle: string }) {
  const { user } = useAuth();
  const { connected } = useRealtime();
  const nav = useNavigation();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <View style={{ flex: 1 }}>
        <Caption>{subtitle}</Caption>
        <Title style={{ marginTop: 2 }}>{title}</Title>
      </View>
      <View style={[styles.live, { borderColor: connected ? 'rgba(52,211,153,0.35)' : 'rgba(251,113,133,0.35)' }]}>
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: connected ? colors.success : colors.danger }} />
        <Text style={{ fontFamily: fonts.semibold, fontSize: 11, color: connected ? colors.success : colors.danger }}>{connected ? 'На лінії' : 'Офлайн'}</Text>
      </View>
      <Pressable onPress={() => nav.navigate('CourierTabs', { screen: 'CourierProfile' })} style={styles.avatar} accessibilityLabel="Профіль">
        <Text style={{ fontFamily: fonts.display, fontSize: 17, color: colors.info }}>
          {user?.name
            .split(' ')
            .map((p) => p[0])
            .slice(0, 2)
            .join('')}
        </Text>
      </Pressable>
    </View>
  );
}

function SummaryStrip() {
  const s = useCourierSummary();
  if (!s.data) return <Skeleton height={64} style={{ marginBottom: 16 }} />;
  const d = s.data;
  return (
    <View style={styles.strip}>
      <StripItem icon={<Bike size={16} color={colors.info} />} value={`${d.active}/${d.capacity}`} label="в роботі" />
      <View style={styles.stripDiv} />
      <StripItem icon={<PackageCheck size={16} color={colors.success} />} value={String(d.deliveredToday)} label="доставлено" />
      <View style={styles.stripDiv} />
      <StripItem icon={<Wallet size={16} color={colors.gold} />} value={money(d.cashOnHand)} label="готівка" />
    </View>
  );
}

function StripItem({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {icon}
        <Text style={{ fontFamily: fonts.bold, color: colors.text, fontSize: 16 }} numberOfLines={1}>
          {value}
        </Text>
      </View>
      <Caption style={{ marginTop: 2 }}>{label}</Caption>
    </View>
  );
}

/** Сума, яку курʼєр має отримати (або «оплачено»). */
function CashBadge({ o }: { o: Order }) {
  const d = o.delivery!;
  if (d.paymentMethod === 'CARD') {
    return (
      <View style={[styles.cash, { backgroundColor: colors.successSoft }]}>
        <CreditCard size={14} color={colors.success} />
        <Text style={[styles.cashText, { color: colors.success }]}>Оплачено онлайн</Text>
      </View>
    );
  }
  return (
    <View style={[styles.cash, { backgroundColor: colors.warningSoft }]}>
      <Banknote size={14} color={colors.warning} />
      <Text style={[styles.cashText, { color: colors.warning }]}>
        Взяти {money(o.total)}
        {d.changeFrom ? ` · решта з ${money(d.changeFrom)} (${money(d.changeFrom - o.total)})` : ''}
      </Text>
    </View>
  );
}

function KitchenState({ o }: { o: Order }) {
  if (o.status === 'READY')
    return (
      <View style={[styles.kitchen, { backgroundColor: colors.successSoft }]}>
        <PackageCheck size={14} color={colors.success} />
        <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: colors.success }}>Готово · чекає {minutesSince(o.readyAt)} хв</Text>
      </View>
    );
  if (o.status === 'DELIVERING')
    return (
      <View style={[styles.kitchen, { backgroundColor: colors.infoSoft }]}>
        <Bike size={14} color={colors.info} />
        <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: colors.info }}>В дорозі · привезти о {o.delivery?.etaAt ? fmtTime(o.delivery.etaAt) : '—'}</Text>
      </View>
    );
  return (
    <View style={[styles.kitchen, { backgroundColor: colors.orangeSoft }]}>
      <ChefHat size={14} color={colors.orange} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: colors.orange }}>
        {o.status === 'PREPARING' ? 'Готується' : 'Прийнято кухнею'}
        {o.etaMinutes != null ? (o.etaMinutes > 1 ? ` · готово через ~${o.etaMinutes} хв` : ' · майже готово') : ''}
      </Text>
    </View>
  );
}

// ─────────────────────────────── Доступні замовлення ───────────────────────────────

export function CourierQueueScreen() {
  const list = useCourierOrders('available');
  const summary = useCourierSummary();
  const act = useCourierAction();
  const full = summary.data ? summary.data.active >= summary.data.capacity : false;
  const refresh = useRefresh();
  const sorted = [...(list.data ?? [])].sort((a, b) => (a.status === 'READY' ? -1 : 0) - (b.status === 'READY' ? -1 : 0));
  return (
    <Screen refreshControl={refresh}>
      <CourierHeader title="Замовлення" subtitle="Шукають курʼєра" />
      <SummaryStrip />
      {full && (
        <View style={styles.full}>
          <Bike size={16} color={colors.warning} />
          <Text style={{ flex: 1, fontFamily: fonts.medium, color: colors.text, fontSize: 13 }}>У вас максимум замовлень. Доставте поточні, щоб брати нові.</Text>
        </View>
      )}
      {list.isLoading ? (
        <Skeleton height={220} />
      ) : !sorted.length ? (
        <EmptyState icon={<Route size={26} color={colors.gold} />} title="Поки тихо" text="Нові замовлення зʼявляться тут миттєво — ми сповістимо вібрацією" />
      ) : (
        sorted.map((o) => (
          <View key={o.id} style={[styles.card, o.status === 'READY' && { borderColor: 'rgba(52,211,153,0.4)' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={styles.zoneIcon}>
                <MapPin size={18} color={colors.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {o.delivery?.street}, {o.delivery?.house}
                </Text>
                <Caption>
                  {o.delivery?.zone.name} · ~{o.delivery?.zone.travelMin} хв у дорозі · #{o.id}
                </Caption>
              </View>
              <Text style={styles.total}>{money(o.total)}</Text>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              <KitchenState o={o} />
              <CashBadge o={o} />
            </View>
            <Caption style={{ marginTop: 10 }} numberOfLines={2}>
              {o.items.map((i) => `${i.quantity}× ${i.name}`).join(' · ')}
            </Caption>
            <Button
              title={o.status === 'READY' ? 'Взяти й забрати зараз' : 'Взяти замовлення'}
              size="md"
              style={{ marginTop: 14 }}
              icon={<Bike size={18} color="#141008" />}
              disabled={full}
              loading={act.isPending && act.variables?.id === o.id}
              onPress={() => act.mutate({ id: o.id, action: 'accept' })}
            />
          </View>
        ))
      )}
    </Screen>
  );
}

// ─────────────────────────────── Мої доставки ───────────────────────────────

export function CourierActiveScreen() {
  const nav = useNavigation();
  const list = useCourierOrders('mine');
  const act = useCourierAction();
  const refresh = useRefresh();
  const busy = (id: number) => act.isPending && act.variables?.id === id;
  return (
    <Screen refreshControl={refresh}>
      <CourierHeader title="Мої доставки" subtitle="Маршрут" />
      {list.isLoading ? (
        <Skeleton height={300} />
      ) : !list.data?.length ? (
        <EmptyState
          icon={<Bike size={26} color={colors.gold} />}
          title="Немає активних доставок"
          text="Візьміть замовлення у вкладці «Замовлення»"
          action={<Button title="Відкрити чергу" variant="glass" onPress={() => nav.navigate('CourierTabs', { screen: 'CourierQueue' })} />}
        />
      ) : (
        list.data.map((o) => {
          const d = o.delivery!;
          const meta = DELIVERY_META[o.status];
          return (
            <View key={o.id} style={[styles.card, o.status === 'DELIVERING' && { borderColor: 'rgba(125,211,252,0.45)' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontFamily: fonts.bold, color: colors.text, fontSize: 16 }}>#{o.id}</Text>
                <Badge tone={meta.tone}>{meta.label}</Badge>
              </View>

              <View style={styles.addressBlock}>
                <Text style={{ fontFamily: fonts.display, color: colors.text, fontSize: 21 }}>{d.addressLine}</Text>
                <Caption style={{ marginTop: 4 }}>
                  {d.zone.name} · {d.recipientName} · {formatPhone(d.phone)}
                </Caption>
                {d.comment ? <Text style={styles.comment}>💬 {d.comment}</Text> : null}
                {o.notes ? <Text style={styles.comment}>🍽 {o.notes}</Text> : null}
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <Pressable
                    style={styles.action}
                    onPress={() => {
                      haptic.tap();
                      Linking.openURL(mapsUrl(o)).catch(() => undefined);
                    }}
                  >
                    <Navigation size={16} color={colors.info} />
                    <Text style={styles.actionText}>Маршрут</Text>
                  </Pressable>
                  <Pressable
                    style={styles.action}
                    onPress={() => {
                      haptic.tap();
                      Linking.openURL(`tel:${d.phone}`).catch(() => undefined);
                    }}
                  >
                    <Phone size={16} color={colors.info} />
                    <Text style={styles.actionText}>Подзвонити</Text>
                  </Pressable>
                </View>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
                <KitchenState o={o} />
                <CashBadge o={o} />
              </View>
              <View style={{ marginTop: 12, gap: 4 }}>
                {o.items.map((i) => (
                  <Text key={i.id} style={{ fontFamily: fonts.medium, color: colors.textSoft, fontSize: 13.5 }}>
                    <Text style={{ color: colors.goldLight, fontFamily: fonts.bold }}>{i.quantity}×</Text> {i.name}
                  </Text>
                ))}
              </View>

              {o.status === 'READY' && (
                <Button title="Забрав замовлення — їду" style={{ marginTop: 16 }} icon={<PackageCheck size={18} color="#141008" />} loading={busy(o.id)} onPress={() => act.mutate({ id: o.id, action: 'pickup' })} />
              )}
              {o.status === 'DELIVERING' && (
                <Button
                  title={d.paymentMethod === 'CASH' ? `Вручено · отримав ${money(o.total)}` : 'Вручено клієнту'}
                  variant="success"
                  style={{ marginTop: 16 }}
                  icon={<House size={18} color={colors.success} />}
                  loading={busy(o.id)}
                  onPress={() =>
                    d.paymentMethod === 'CASH'
                      ? confirmAction('Готівку отримано?', `Сума ${money(o.total)}${d.changeFrom ? `, решта ${money(d.changeFrom - o.total)}` : ''}`, 'Так, доставлено', () =>
                          act.mutate({ id: o.id, action: 'delivered' }),
                        )
                      : act.mutate({ id: o.id, action: 'delivered' })
                  }
                />
              )}
              {['CONFIRMED', 'PREPARING'].includes(o.status) && (
                <View style={styles.waiting}>
                  <Timer size={16} color={colors.muted} />
                  <Text style={{ flex: 1, fontFamily: fonts.medium, color: colors.muted, fontSize: 13 }}>Кухня ще готує — ми сповістимо, щойно буде «Готово»</Text>
                </View>
              )}
              {o.status !== 'DELIVERING' && (
                <Pressable
                  onPress={() => confirmAction('Відмовитися від замовлення?', 'Воно повернеться в загальну чергу', 'Відмовитися', () => act.mutate({ id: o.id, action: 'release' }))}
                  style={styles.release}
                >
                  <Undo2 size={14} color={colors.faint} />
                  <Text style={{ fontFamily: fonts.medium, color: colors.faint, fontSize: 12.5 }}>Відмовитися</Text>
                </Pressable>
              )}
            </View>
          );
        })
      )}
    </Screen>
  );
}

// ─────────────────────────────── Зміна курʼєра ───────────────────────────────

export function CourierShiftScreen() {
  const s = useCourierSummary();
  const history = useCourierOrders('history');
  const refresh = useRefresh();
  return (
    <Screen refreshControl={refresh}>
      <CourierHeader title="Моя зміна" subtitle={fmtDateShort(new Date())} />
      <LinearGradient colors={['rgba(220,171,74,0.2)', 'rgba(20,20,25,0.96)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cashCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <LinearGradient colors={goldGradient} style={styles.cashIcon}>
            <HandCoins size={22} color="#141008" />
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Eyebrow>Готівка на руках</Eyebrow>
            <Text style={{ fontFamily: fonts.display, fontSize: 32, color: colors.text, marginTop: 2 }}>{s.data ? money(s.data.cashOnHand) : '—'}</Text>
          </View>
        </View>
        <Caption style={{ marginTop: 10 }}>Здайте в касу ресторану в кінці зміни · чайові: {s.data ? money(s.data.tipsToday) : '—'}</Caption>
      </LinearGradient>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <StatTile label="Доставлено" value={String(s.data?.deliveredToday ?? '—')} icon={<PackageCheck size={18} color={colors.success} />} tone="success" />
        <StatTile label="Час у дорозі" value={s.data?.avgRideMin != null ? `${s.data.avgRideMin} хв` : '—'} icon={<Clock size={18} color={colors.info} />} tone="info" />
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <StatTile label="Тарифи доставок" value={s.data ? money(s.data.feesToday) : '—'} icon={<Wallet size={18} color={colors.gold} />} tone="gold" />
        <StatTile label="В роботі" value={s.data ? `${s.data.active}/${s.data.capacity}` : '—'} icon={<Bike size={18} color={colors.orange} />} tone="orange" />
      </View>

      <Eyebrow style={{ marginTop: 24, marginBottom: 10 }}>Доставлено за тиждень</Eyebrow>
      {history.isLoading ? (
        <Skeleton height={160} />
      ) : !history.data?.length ? (
        <EmptyState icon={<PackageCheck size={26} color={colors.gold} />} title="Ще жодної доставки" text="Тут зʼявиться історія ваших доставок" />
      ) : (
        history.data.map((o) => (
          <View key={o.id} style={styles.histRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.semibold, color: colors.text }} numberOfLines={1}>
                {o.delivery?.street}, {o.delivery?.house}
              </Text>
              <Caption>
                #{o.id} · {fmtDateShort(o.delivery?.deliveredAt ?? o.createdAt)}, {fmtTime(o.delivery?.deliveredAt ?? o.createdAt)} · {o.delivery?.zone.name}
              </Caption>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontFamily: fonts.bold, color: colors.goldLight }}>{money(o.total)}</Text>
              <Caption>{o.delivery?.paymentMethod === 'CASH' ? 'готівка' : 'картка'}</Caption>
            </View>
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, borderWidth: 1 },
  avatar: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.infoSoft, borderWidth: 1, borderColor: 'rgba(125,211,252,0.3)', alignItems: 'center', justifyContent: 'center' },
  strip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  stripDiv: { width: 1, height: 28, backgroundColor: colors.border },
  full: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: colors.warningSoft, marginBottom: 14 },
  card: { padding: 16, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  cardTitle: { fontFamily: fonts.semibold, color: colors.text, fontSize: 16 },
  zoneIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  total: { fontFamily: fonts.bold, color: colors.goldLight, fontSize: 16 },
  cash: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99 },
  cashText: { fontFamily: fonts.semibold, fontSize: 12.5 },
  kitchen: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99 },
  addressBlock: { marginTop: 12, padding: 14, borderRadius: 18, backgroundColor: 'rgba(8,8,11,0.55)', borderWidth: 1, borderColor: colors.border },
  comment: { fontFamily: fonts.medium, color: colors.textSoft, fontSize: 13, marginTop: 6 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 42, borderRadius: 14, backgroundColor: colors.infoSoft, borderWidth: 1, borderColor: 'rgba(125,211,252,0.25)' },
  actionText: { fontFamily: fonts.semibold, color: colors.info, fontSize: 13.5 },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)' },
  release: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 12, paddingVertical: 6 },
  cashCard: { padding: 18, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.goldBorder },
  cashIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
});
