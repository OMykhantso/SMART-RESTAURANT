import { useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bike, Check, ChefHat, Clock, Flame, Play, Search, UserRound } from 'lucide-react-native';
import { Badge, Button, Caption, EmptyState, Eyebrow, Header, Screen, Skeleton, Title } from '../../components/ui';
import { Segmented } from '../../components/staff';
import { colors, fonts, radius } from '../../theme';
import { api } from '../../api/client';
import { useAuth } from '../../lib/auth';
import { useRealtime } from '../../lib/realtime';
import { useToast } from '../../lib/toast';
import { haptic } from '../../lib/notify';
import { useAllDishes, useAvailability, useItemStatus, useKitchenOrders, useTick } from '../../lib/staff';
import { useCategories } from '../../lib/queries';
import { CATEGORY_EMOJI } from '../../lib/status';
import { fmtTime } from '../../lib/format';
import type { Order, OrderItem, OrderItemStatus } from '../../api/types';

type Col = 'CONFIRMED' | 'PREPARING' | 'READY';

/** Kitchen display на телефоні / планшеті: черга, таймери, відмітка страв. Перша відмітка → «Готується», остання → «Готово». */
export function KitchenScreen({ embedded = true }: { embedded?: boolean }) {
  const { user } = useAuth();
  const { connected } = useRealtime();
  const nav = useNavigation();
  const { data, isLoading, refetch, isRefetching } = useKitchenOrders();
  const [col, setCol] = useState<Col>('CONFIRMED');
  const now = useTick(10_000);
  const canCook = user?.role === 'KITCHEN' || user?.role === 'ADMIN';
  const lists = useMemo(
    () => ({
      CONFIRMED: (data ?? []).filter((o) => o.status === 'CONFIRMED'),
      PREPARING: (data ?? []).filter((o) => o.status === 'PREPARING'),
      READY: (data ?? []).filter((o) => o.status === 'READY').reverse(),
    }),
    [data],
  );
  const list = lists[col];

  return (
    <Screen refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.gold} />}>
      {embedded ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Eyebrow>Kitchen display</Eyebrow>
            <Title style={{ marginTop: 6 }}>Кухня</Title>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: connected ? colors.success : colors.danger }} />
              <Caption>{connected ? 'Нові замовлення зʼявляються миттєво' : 'Немає real-time зʼєднання'}</Caption>
            </View>
          </View>
          <Pressable onPress={() => nav.navigate('StaffProfile')} style={styles.avatar} accessibilityLabel="Профіль">
            <UserRound size={22} color={colors.goldLight} />
          </Pressable>
        </View>
      ) : (
        <Header title="Кухня" subtitle={canCook ? undefined : 'Перегляд черги (відмічає страви кухар)'} />
      )}

      <View style={{ marginTop: 16, marginBottom: 16 }}>
        <Segmented
          value={col}
          onChange={setCol}
          items={[
            { key: 'CONFIRMED', label: 'Нові', count: lists.CONFIRMED.length },
            { key: 'PREPARING', label: 'Готуються', count: lists.PREPARING.length },
            { key: 'READY', label: 'Готові', count: lists.READY.length },
          ]}
        />
      </View>

      {isLoading ? (
        <Skeleton height={200} />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<ChefHat size={30} color={colors.gold} />}
          title={col === 'CONFIRMED' ? 'Черга порожня' : col === 'PREPARING' ? 'Нічого не готується' : 'Немає готових страв'}
          text={col === 'CONFIRMED' ? 'Щойно офіціант прийме замовлення — воно зʼявиться тут зі звуком і вібрацією.' : undefined}
        />
      ) : (
        list.map((o) => <KitchenTicket key={o.id} order={o} now={now} canCook={canCook} />)
      )}
    </Screen>
  );
}

const NEXT: Record<OrderItemStatus, OrderItemStatus> = { QUEUED: 'COOKING', COOKING: 'READY', READY: 'QUEUED' };

function KitchenTicket({ order, now, canCook }: { order: Order; now: number; canCook: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const setItem = useItemStatus();
  const setStatus = useMutation({
    mutationFn: (status: 'PREPARING' | 'READY') => api.patch<Order>(`/orders/${order.id}/status`, { status }),
    onSuccess: (o) => {
      haptic.success();
      if (o.status === 'READY') toast({ title: o.table ? `#${o.id} готове — стіл №${o.table.number}` : `#${o.id} готове — передайте курʼєру`, tone: 'success' });
      ['kitchen', 'orders', 'order', 'tables-live'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => toast({ title: (e as Error).message, tone: 'danger' }),
  });
  const start = order.preparingAt ?? order.confirmedAt ?? order.createdAt;
  const elapsed = Math.max(0, Math.floor((now - new Date(start).getTime()) / 60000));
  const norm = Math.max(...order.items.map((i) => i.prepTimeMin), 1);
  const ratio = elapsed / norm;
  const done = order.items.filter((i) => i.status === 'READY').length;
  const timerColor = order.status === 'READY' ? colors.success : ratio >= 1 ? colors.danger : ratio >= 0.7 ? colors.warning : colors.textSoft;

  return (
    <View style={[styles.ticket, order.status !== 'READY' && ratio >= 1 && { borderColor: 'rgba(251,113,133,0.5)' }]}>
      <View style={styles.head}>
        {order.table ? (
          <View style={styles.table}>
            <Caption style={{ fontSize: 9.5, letterSpacing: 1 }}>СТІЛ</Caption>
            <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.goldLight, marginTop: -2 }}>{order.table.number}</Text>
          </View>
        ) : (
          <View style={[styles.table, { backgroundColor: colors.infoSoft, borderColor: 'rgba(125,211,252,0.35)' }]}>
            <Bike size={20} color={colors.info} />
            <Caption style={{ fontSize: 8.5, letterSpacing: 0.6, color: colors.info, marginTop: 2 }}>ДОСТАВКА</Caption>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: colors.text }}>#{order.id}</Text>
          <Caption>
            {order.delivery ? `${order.delivery.zone.name} · ` : ''}прийнято {fmtTime(order.confirmedAt ?? order.createdAt)} · норма {norm} хв
          </Caption>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            {ratio >= 1 && order.status !== 'READY' ? <Flame size={16} color={colors.danger} /> : <Clock size={15} color={timerColor} />}
            <Text style={{ fontFamily: fonts.bold, fontSize: 20, color: timerColor }}>{elapsed}′</Text>
          </View>
          <Caption>
            {done}/{order.items.length} готово
          </Caption>
        </View>
      </View>
      <View style={styles.progress}>
        <View style={{ width: `${(done / order.items.length) * 100}%`, height: '100%', borderRadius: 3, backgroundColor: colors.success }} />
      </View>

      <View style={{ gap: 8, marginTop: 12 }}>
        {order.items.map((i) => (
          <ItemRow key={i.id} item={i} disabled={!canCook || order.status === 'READY' || setItem.isPending} onPress={() => setItem.mutate({ orderId: order.id, itemId: i.id, status: NEXT[i.status] })} />
        ))}
      </View>
      {order.notes ? <Text style={styles.note}>💬 {order.notes}</Text> : null}

      {canCook && order.status === 'CONFIRMED' && <Button title="Почати готувати" size="md" style={{ marginTop: 14 }} icon={<Play size={16} color="#141008" />} loading={setStatus.isPending} onPress={() => setStatus.mutate('PREPARING')} />}
      {canCook && order.status === 'PREPARING' && <Button title="Усе готово" size="md" variant="success" style={{ marginTop: 14 }} icon={<Check size={16} color={colors.success} />} loading={setStatus.isPending} onPress={() => setStatus.mutate('READY')} />}
      {order.status === 'READY' && (
        <View style={{ marginTop: 12 }}>
          <Badge tone="success">Чекає на офіціанта</Badge>
        </View>
      )}
    </View>
  );
}

function ItemRow({ item, disabled, onPress }: { item: OrderItem; disabled: boolean; onPress: () => void }) {
  const ready = item.status === 'READY';
  const cooking = item.status === 'COOKING';
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.item, ready && { backgroundColor: colors.successSoft, borderColor: 'rgba(52,211,153,0.35)' }, cooking && { borderColor: 'rgba(253,186,116,0.4)' }, pressed && { opacity: 0.75 }]}
    >
      <View style={[styles.check, ready && { backgroundColor: colors.success, borderColor: colors.success }, cooking && { borderColor: colors.orange }]}>
        {ready ? <Check size={14} color="#06281c" strokeWidth={3} /> : cooking ? <Flame size={12} color={colors.orange} /> : null}
      </View>
      <Text style={styles.qty}>{item.quantity}×</Text>
      <View style={{ flex: 1 }}>
        <Text style={[styles.itemName, ready && { color: colors.muted, textDecorationLine: 'line-through' }]} numberOfLines={2}>
          {item.name}
        </Text>
        {item.notes ? <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: colors.warning }}>{item.notes}</Text> : null}
      </View>
      <Caption>{ready ? 'готово' : cooking ? 'у роботі' : `${item.prepTimeMin} хв`}</Caption>
    </Pressable>
  );
}

// ─────────────────────────────── Стоп-лист ───────────────────────────────

export function StopListScreen({ embedded = false }: { embedded?: boolean }) {
  const dishes = useAllDishes();
  const categories = useCategories();
  const availability = useAvailability();
  const [search, setSearch] = useState('');
  const [onlyStopped, setOnlyStopped] = useState(false);
  const list = (dishes.data ?? []).filter((d) => !d.isArchived && (!onlyStopped || !d.isAvailable) && d.name.toLowerCase().includes(search.trim().toLowerCase()));
  const stopped = (dishes.data ?? []).filter((d) => !d.isAvailable && !d.isArchived).length;
  const groups = (categories.data ?? []).map((c) => ({ c, items: list.filter((d) => d.categoryId === c.id) })).filter((g) => g.items.length);

  return (
    <Screen>
      {embedded ? (
        <>
          <Eyebrow>Меню</Eyebrow>
          <Title style={{ marginTop: 6 }}>Стоп-лист</Title>
        </>
      ) : (
        <Header title="Стоп-лист" subtitle="Зміни миттєво бачать гості в застосунку" />
      )}
      <View style={styles.searchBox}>
        <Search size={18} color={colors.faint} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Пошук страви" placeholderTextColor={colors.faint} style={{ flex: 1, color: colors.text, fontFamily: fonts.medium, height: 44 }} />
      </View>
      <View style={{ marginTop: 12, marginBottom: 6 }}>
        <Segmented
          value={onlyStopped ? 'stop' : 'all'}
          onChange={(k) => setOnlyStopped(k === 'stop')}
          items={[
            { key: 'all', label: 'Усі страви' },
            { key: 'stop', label: 'У стоп-листі', count: stopped },
          ]}
        />
      </View>
      {dishes.isLoading ? (
        <Skeleton height={240} style={{ marginTop: 12 }} />
      ) : groups.length === 0 ? (
        <EmptyState icon={<ChefHat size={30} color={colors.gold} />} title={onlyStopped ? 'Стоп-лист порожній' : 'Нічого не знайдено'} text={onlyStopped ? 'Усі страви доступні для замовлення.' : undefined} />
      ) : (
        groups.map(({ c, items }) => (
          <View key={c.id} style={{ marginTop: 18 }}>
            <Text style={styles.cat}>
              {c.emoji ?? CATEGORY_EMOJI[c.slug] ?? '🍽'} {c.name}
            </Text>
            {items.map((d) => (
              <View key={d.id} style={[styles.dish, !d.isAvailable && { borderColor: 'rgba(251,113,133,0.35)' }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.itemName, !d.isAvailable && { color: colors.muted }]}>{d.name}</Text>
                  <Caption>{d.isAvailable ? `${d.prepTimeMin} хв · доступна` : 'закінчилась — гості не можуть замовити'}</Caption>
                </View>
                <Switch
                  value={d.isAvailable}
                  onValueChange={(v) => availability.mutate({ id: d.id, isAvailable: v })}
                  trackColor={{ false: 'rgba(251,113,133,0.35)', true: 'rgba(52,211,153,0.45)' }}
                  thumbColor={d.isAvailable ? colors.success : colors.danger}
                />
              </View>
            ))}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center' },
  ticket: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  table: { width: 54, height: 54, borderRadius: 16, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center' },
  progress: { height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.07)', marginTop: 12, overflow: 'hidden' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.02)' },
  check: { width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  qty: { fontFamily: fonts.bold, fontSize: 15, color: colors.gold, width: 28 },
  itemName: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.text },
  note: { fontFamily: fonts.medium, fontSize: 13, color: colors.warning, marginTop: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  cat: { fontFamily: fonts.display, fontSize: 19, color: colors.text, marginBottom: 10 },
  dish: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
});
