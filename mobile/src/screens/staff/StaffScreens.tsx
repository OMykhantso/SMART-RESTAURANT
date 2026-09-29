import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import {
  Armchair,
  BellRing,
  CalendarClock,
  ChartColumn,
  ChefHat,
  ChevronRight,
  ClipboardList,
  DoorOpen,
  LogIn,
  Receipt,
  Soup,
  UserRound,
  Users,
  UsersRound,
  Wallet,
} from 'lucide-react-native';
import { Badge, Button, Caption, Card, EmptyState, Eyebrow, Screen, Skeleton, Title } from '../../components/ui';
import { SectionTitle } from '../../components/domain';
import { LiveFloorPlan, Legend, OrderTicket, ReservationCard, Segmented, StatTile, TABLE_STATE } from '../../components/staff';
import { colors, fonts } from '../../theme';
import { useAuth } from '../../lib/auth';
import { useRealtime } from '../../lib/realtime';
import { ROLE_LABEL, useLiveTables, useReservationAction, useStaffOrders, useStaffReservations, useToday } from '../../lib/staff';
import { addDays, fmtFullDate, fmtTime, greeting, guestsLabel, isoDay, money, relativeDay } from '../../lib/format';
import type { LiveTable, OrderStatus, ReservationStatus } from '../../api/types';

function useRefresh(keys: string[]) {
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
    setRefreshing(false);
  };
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />;
}

function LiveDot() {
  const { connected } = useRealtime();
  return (
    <View style={styles.live}>
      <View style={[styles.liveDot, { backgroundColor: connected ? colors.success : colors.danger }]} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: 11.5, color: connected ? colors.success : colors.danger }}>{connected ? 'Наживо' : 'Офлайн'}</Text>
    </View>
  );
}

// ─────────────────────────────── Зміна (дашборд) ───────────────────────────────

export function ShiftScreen() {
  const { user } = useAuth();
  const nav = useNavigation();
  const today = useToday();
  const orders = useStaffOrders({ status: 'NEW,CONFIRMED,PREPARING,READY,SERVED' });
  const pending = useStaffReservations({ date: isoDay(), status: 'PENDING' });
  const refresh = useRefresh(['today', 'orders', 'reservations', 'tables-live']);
  const t = today.data;
  const attention = useMemo(() => {
    const rank: Partial<Record<OrderStatus, number>> = { READY: 0, NEW: 1, SERVED: 2 };
    return (orders.data ?? []).filter((o) => o.status in rank).sort((a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9));
  }, [orders.data]);
  const isAdmin = user?.role === 'ADMIN';

  return (
    <Screen refreshControl={refresh}>
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Eyebrow>{ROLE_LABEL[user!.role]} · зміна</Eyebrow>
          <Title style={{ marginTop: 6 }}>
            {greeting()}, {user?.name.split(' ')[0]}
          </Title>
          <Caption style={{ marginTop: 2 }}>{fmtFullDate(new Date())}</Caption>
        </View>
        <Pressable onPress={() => nav.navigate('StaffProfile')} style={styles.avatar} accessibilityLabel="Профіль">
          <UserRound size={22} color={colors.goldLight} />
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 12 }}>
        <LiveDot />
      </View>

      {!t ? (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
          <Skeleton style={{ flex: 1 }} height={118} />
          <Skeleton style={{ flex: 1 }} height={118} />
        </View>
      ) : (
        <View style={styles.grid}>
          <StatTile label="Виручка сьогодні" value={money(t.revenue)} hint={`${t.paymentsCount} оплат · чайові ${money(t.tips)}`} icon={<Wallet size={18} color={colors.goldLight} />} />
          <StatTile label="Гостей у залі" value={String(t.guestsInHouse)} hint={`${t.tables.occupied} з ${t.tables.total} столиків`} icon={<Users size={18} color={colors.success} />} tone="success" />
          <StatTile label="Активних замовлень" value={String(t.orders.active)} hint={t.avgPrepMin ? `кухня ≈ ${t.avgPrepMin} хв` : 'сьогодні'} icon={<Receipt size={18} color={colors.orange} />} tone="orange" />
          <StatTile label="Бронювань сьогодні" value={String(t.reservations.total)} hint={`${t.reservations.expectedGuests} гостей очікується`} icon={<CalendarClock size={18} color={colors.info} />} tone="info" />
        </View>
      )}

      {(pending.data?.length ?? 0) > 0 && (
        <>
          <SectionTitle title="Чекають підтвердження" action={<Badge tone="warning">{pending.data!.length}</Badge>} />
          {pending.data!.map((r) => (
            <ReservationCard key={r.id} r={r} />
          ))}
        </>
      )}

      <SectionTitle title="Потребує уваги" action={attention.length ? <Badge tone="gold">{attention.length}</Badge> : undefined} />
      {orders.isLoading ? (
        <Skeleton height={150} />
      ) : attention.length === 0 ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <BellRing size={20} color={colors.success} />
            <Text style={{ flex: 1, fontFamily: fonts.medium, color: colors.textSoft }}>Усе під контролем — нових і готових замовлень немає.</Text>
          </View>
        </Card>
      ) : (
        attention.map((o) => <OrderTicket key={o.id} order={o} />)
      )}

      <SectionTitle title="Швидкий доступ" />
      <View style={{ gap: 10 }}>
        <QuickLink icon={<ChefHat size={20} color={colors.orange} />} title="Кухня" text="Черга страв і таймери (перегляд)" onPress={() => nav.navigate('KitchenView')} />
        <QuickLink icon={<Soup size={20} color={colors.warning} />} title="Стоп-лист" text="Вимкнути страву, що закінчилась" onPress={() => nav.navigate('StopList')} />
        {isAdmin && <QuickLink icon={<ChartColumn size={20} color={colors.goldLight} />} title="Аналітика" text="Виручка, топ страв, навантаження" onPress={() => nav.navigate('Analytics')} />}
        {isAdmin && <QuickLink icon={<UsersRound size={20} color={colors.violet} />} title="Користувачі та ролі" text="Персонал, гості, доступи" onPress={() => nav.navigate('Users')} />}
      </View>
    </Screen>
  );
}

function QuickLink({ icon, title, text, onPress }: { icon: React.ReactNode; title: string; text: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.quick, pressed && { opacity: 0.8 }]}>
      <View style={styles.quickIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.text }}>{title}</Text>
        <Caption>{text}</Caption>
      </View>
      <ChevronRight size={18} color={colors.faint} />
    </Pressable>
  );
}

// ─────────────────────────────── План залу ───────────────────────────────

export function FloorScreen() {
  const { data, isLoading } = useLiveTables();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const refresh = useRefresh(['tables-live', 'orders']);
  const tables = data ?? [];
  const selected = tables.find((t) => t.id === selectedId) ?? null;
  const counts = { free: tables.filter((t) => t.state === 'FREE').length, busy: tables.filter((t) => t.state === 'OCCUPIED' || t.state === 'LATE').length, soon: tables.filter((t) => t.state === 'RESERVED_SOON').length };

  return (
    <Screen refreshControl={refresh}>
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Eyebrow>Наживо</Eyebrow>
          <Title style={{ marginTop: 6 }}>План залу</Title>
        </View>
        <LiveDot />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, marginBottom: 16 }}>
        <Badge tone="muted">Вільно {counts.free}</Badge>
        <Badge tone="gold">Зайнято {counts.busy}</Badge>
        <Badge tone="info">Скоро {counts.soon}</Badge>
      </View>
      {isLoading ? <Skeleton height={260} /> : <LiveFloorPlan tables={tables} selectedId={selectedId} onSelect={(t) => setSelectedId(t.id === selectedId ? null : t.id)} />}
      <Legend />
      {selected ? <TableDetails t={selected} /> : <Caption style={{ textAlign: 'center', marginTop: 18 }}>Торкніться столика, щоб побачити гостей, замовлення та дії</Caption>}
    </Screen>
  );
}

function TableDetails({ t }: { t: LiveTable }) {
  const orders = useStaffOrders({ reservationId: t.current?.reservationId }, Boolean(t.current));
  const action = useReservationAction();
  const state = TABLE_STATE[t.state];
  const active = (orders.data ?? []).filter((o) => o.status !== 'CANCELLED' && o.status !== 'PAID');
  return (
    <View style={{ marginTop: 20 }}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={styles.bigNum}>
            <Text style={{ fontFamily: fonts.display, fontSize: 26, color: colors.goldLight }}>{t.number}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 16, color: colors.text }}>Столик №{t.number}</Text>
            <Caption>
              {t.seats} місць · {t.zone === 'HALL' ? 'Головна зала' : t.zone === 'VIP' ? 'VIP-зала' : t.zone === 'BAR' ? 'Бар' : 'Тераса'}
            </Caption>
          </View>
          <Badge tone={state.tone}>{state.label}</Badge>
        </View>

        {t.current && (
          <View style={styles.block}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Armchair size={16} color={colors.gold} />
              <Text style={styles.blockTitle}>
                {t.current.guestName ?? 'Гості'} · {guestsLabel(t.current.guests)}
              </Text>
            </View>
            <Caption style={{ marginTop: 4 }}>
              З {fmtTime(t.current.since)} до {t.current.untilTime} · {t.current.code} · рахунок {money(t.current.ordersTotal)}
            </Caption>
            <Button
              title="Завершити візит"
              size="sm"
              variant="outline"
              style={{ marginTop: 12 }}
              icon={<DoorOpen size={16} color={colors.gold} />}
              loading={action.isPending}
              onPress={() => action.mutate({ id: t.current!.reservationId, status: 'COMPLETED' })}
            />
          </View>
        )}

        {t.next && (
          <View style={styles.block}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CalendarClock size={16} color={colors.info} />
              <Text style={styles.blockTitle}>
                Наступне: {t.next.time} · {t.next.guestName ?? 'Гість'}
              </Text>
            </View>
            <Caption style={{ marginTop: 4 }}>
              {guestsLabel(t.next.guests)} · {t.next.code} · {t.next.minutesToStart > 0 ? `через ${t.next.minutesToStart} хв` : `запізнюються на ${-t.next.minutesToStart} хв`}
            </Caption>
            {!t.current && t.next.status === 'CONFIRMED' && (
              <Button title="Посадити гостей" size="sm" variant="success" style={{ marginTop: 12 }} icon={<LogIn size={16} color={colors.success} />} loading={action.isPending} onPress={() => action.mutate({ id: t.next!.reservationId, status: 'CHECKED_IN' })} />
            )}
            {t.next.status === 'PENDING' && <Button title="Підтвердити бронювання" size="sm" style={{ marginTop: 12 }} loading={action.isPending} onPress={() => action.mutate({ id: t.next!.reservationId, status: 'CONFIRMED' })} />}
          </View>
        )}
        {!t.current && !t.next && <Caption style={{ marginTop: 14 }}>Сьогодні більше немає бронювань — столик вільний для гостей без бронювання.</Caption>}
      </Card>
      {active.length > 0 && (
        <>
          <SectionTitle title="Замовлення столика" />
          {active.map((o) => (
            <OrderTicket key={o.id} order={o} />
          ))}
        </>
      )}
    </View>
  );
}

// ─────────────────────────────── Бронювання ───────────────────────────────

type ResFilter = 'active' | 'PENDING' | 'CHECKED_IN' | 'done';
const RES_FILTER: Record<ResFilter, ReservationStatus[]> = {
  active: ['PENDING', 'CONFIRMED', 'CHECKED_IN'],
  PENDING: ['PENDING'],
  CHECKED_IN: ['CHECKED_IN'],
  done: ['COMPLETED', 'CANCELLED', 'REJECTED', 'NO_SHOW'],
};

export function StaffReservationsScreen() {
  const [date, setDate] = useState(isoDay());
  const [filter, setFilter] = useState<ResFilter>('active');
  const { data, isLoading } = useStaffReservations({ date });
  const refresh = useRefresh(['reservations']);
  const list = (data ?? []).filter((r) => RES_FILTER[filter].includes(r.status)).sort((a, b) => a.startAt.localeCompare(b.startAt));
  const count = (f: ResFilter) => (data ?? []).filter((r) => RES_FILTER[f].includes(r.status)).length;
  const days = [0, 1, 2, 3, 4, 5, 6].map((d) => addDays(isoDay(), d));

  return (
    <Screen refreshControl={refresh}>
      <Eyebrow>Бронювання</Eyebrow>
      <Title style={{ marginTop: 6 }}>{relativeDay(date)}</Title>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
        {days.map((d) => {
          const active = d === date;
          const dt = new Date(`${d}T12:00:00Z`);
          return (
            <Pressable key={d} onPress={() => setDate(d)} style={[styles.day, active && styles.dayActive]}>
              <Text style={[styles.dayWeek, active && { color: colors.gold }]}>{new Intl.DateTimeFormat('uk-UA', { weekday: 'short', timeZone: 'UTC' }).format(dt)}</Text>
              <Text style={[styles.dayNum, active && { color: colors.goldLight }]}>{dt.getUTCDate()}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ marginTop: 14, marginBottom: 16 }}>
        <Segmented
          value={filter}
          onChange={setFilter}
          items={[
            { key: 'active', label: 'Активні', count: count('active') },
            { key: 'PENDING', label: 'Нові', count: count('PENDING') },
            { key: 'CHECKED_IN', label: 'У залі', count: count('CHECKED_IN') },
            { key: 'done', label: 'Архів' },
          ]}
        />
      </View>
      {isLoading ? (
        <Skeleton height={120} />
      ) : list.length === 0 ? (
        <EmptyState icon={<ClipboardList size={30} color={colors.gold} />} title="Немає бронювань" text="За цим фільтром на обраний день нічого немає." />
      ) : (
        list.map((r) => <ReservationCard key={r.id} r={r} />)
      )}
    </Screen>
  );
}

// ─────────────────────────────── Замовлення ───────────────────────────────

type OrderFilter = 'NEW' | 'KITCHEN' | 'READY' | 'SERVED';
const ORDER_FILTER: Record<OrderFilter, OrderStatus[]> = {
  NEW: ['NEW'],
  KITCHEN: ['CONFIRMED', 'PREPARING'],
  READY: ['READY'],
  SERVED: ['SERVED'],
};

export function StaffOrdersScreen() {
  const { data, isLoading } = useStaffOrders({ status: 'NEW,CONFIRMED,PREPARING,READY,SERVED' });
  const [filter, setFilter] = useState<OrderFilter>('NEW');
  const refresh = useRefresh(['orders']);
  const count = (f: OrderFilter) => (data ?? []).filter((o) => ORDER_FILTER[f].includes(o.status)).length;
  const list = (data ?? []).filter((o) => ORDER_FILTER[filter].includes(o.status));
  const EMPTY: Record<OrderFilter, string> = {
    NEW: 'Нових замовлень немає — гості замовляють зі своїх телефонів, і вони зʼявляться тут миттєво.',
    KITCHEN: 'Кухня зараз нічого не готує.',
    READY: 'Готових до подачі страв немає.',
    SERVED: 'Усі подані замовлення оплачено.',
  };
  return (
    <Screen refreshControl={refresh}>
      <View style={styles.headRow}>
        <View style={{ flex: 1 }}>
          <Eyebrow>Замовлення</Eyebrow>
          <Title style={{ marginTop: 6 }}>Сервіс</Title>
        </View>
        <LiveDot />
      </View>
      <View style={{ marginTop: 14, marginBottom: 16 }}>
        <Segmented
          value={filter}
          onChange={setFilter}
          items={[
            { key: 'NEW', label: 'Нові', count: count('NEW') },
            { key: 'KITCHEN', label: 'Кухня', count: count('KITCHEN') },
            { key: 'READY', label: 'Готові', count: count('READY') },
            { key: 'SERVED', label: 'Подані', count: count('SERVED') },
          ]}
        />
      </View>
      {isLoading ? (
        <Skeleton height={160} />
      ) : list.length === 0 ? (
        <EmptyState icon={<Receipt size={30} color={colors.gold} />} title="Порожньо" text={EMPTY[filter]} />
      ) : (
        list.map((o) => <OrderTicket key={o.id} order={o} />)
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center' },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  quick: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  quickIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center', justifyContent: 'center' },
  bigNum: { width: 52, height: 52, borderRadius: 16, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center' },
  block: { marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: colors.border },
  blockTitle: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.text, flex: 1 },
  day: { flex: 1, height: 58, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  dayActive: { backgroundColor: colors.goldSoft, borderColor: colors.goldBorder },
  dayWeek: { fontFamily: fonts.semibold, fontSize: 10.5, color: colors.muted, textTransform: 'uppercase' },
  dayNum: { fontFamily: fonts.bold, fontSize: 17, color: colors.text, marginTop: 2 },
});
