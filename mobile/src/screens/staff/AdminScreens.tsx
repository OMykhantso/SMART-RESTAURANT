import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Bike, CalendarClock, ChefHat, Clock, Receipt, Search, ShieldCheck, Star, TrendingDown, TrendingUp, Users, Wallet } from 'lucide-react-native';
import { Badge, Caption, Chip, EmptyState, Header, Screen, Skeleton } from '../../components/ui';
import { SectionTitle } from '../../components/domain';
import { StatTile } from '../../components/staff';
import { colors, fonts, radius } from '../../theme';
import { useAuth } from '../../lib/auth';
import { confirmAction } from '../../lib/confirm';
import { ROLE_LABEL, useOverview, useUpdateUser, useUsers } from '../../lib/staff';
import { money } from '../../lib/format';
import type { Role, User } from '../../api/types';

// ─────────────────────────────── Аналітика ───────────────────────────────

export function AnalyticsScreen() {
  const [days, setDays] = useState(7);
  const { data, isLoading } = useOverview(days);

  return (
    <Screen>
      <Header title="Аналітика" subtitle={data ? `${data.period.from} — ${data.period.to}` : undefined} />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        {[7, 14, 30, 90].map((d) => (
          <Chip key={d} label={`${d} днів`} active={d === days} onPress={() => setDays(d)} />
        ))}
      </View>

      {isLoading || !data ? (
        <Skeleton height={260} style={{ marginTop: 18 }} />
      ) : (
        <>
          <View style={styles.grid}>
            <StatTile label="Виручка" value={money(data.kpis.revenue)} hint={<Delta v={data.deltas.revenue} />} icon={<Wallet size={18} color={colors.goldLight} />} />
            <StatTile label="Середній чек" value={money(data.kpis.avgCheck)} hint={<Delta v={data.deltas.avgCheck} />} icon={<Receipt size={18} color={colors.orange} />} tone="orange" />
            <StatTile label="Гостей обслуговано" value={String(data.kpis.guests)} hint={<Delta v={data.deltas.guests} />} icon={<Users size={18} color={colors.success} />} tone="success" />
            <StatTile label="Бронювань" value={String(data.kpis.reservationsCount)} hint={`no-show ${data.kpis.noShowRate}% · скас. ${data.kpis.cancellationRate}%`} icon={<CalendarClock size={18} color={colors.info} />} tone="info" />
            <StatTile label="Середня оцінка" value={data.kpis.avgRating ? data.kpis.avgRating.toFixed(1) : '—'} hint={`${data.kpis.reviewsCount} відгуків`} icon={<Star size={18} color={colors.warning} />} tone="warning" />
            <StatTile label="Час на кухні" value={`${data.kpis.avgPrepMin} хв`} hint={`візит ≈ ${data.kpis.avgVisitMin} хв`} icon={<Clock size={18} color={colors.violet} />} tone="violet" />
          </View>

          {data.delivery && (
            <>
              <SectionTitle title="Доставка" />
              <View style={styles.grid}>
                <StatTile label="Доставлено" value={String(data.delivery.delivered)} hint={`${data.delivery.cancelled} скасовано`} icon={<Bike size={18} color={colors.info} />} tone="info" />
                <StatTile label="Виручка доставки" value={money(data.delivery.revenue)} hint={`${data.delivery.share}% від усієї`} icon={<Wallet size={18} color={colors.goldLight} />} />
                <StatTile label="Від замовлення до дверей" value={data.delivery.avgDeliveryMin ? `${data.delivery.avgDeliveryMin} хв` : '—'} hint={`плата за доставку ${money(data.delivery.fees)}`} icon={<Clock size={18} color={colors.violet} />} tone="violet" />
              </View>
              {data.delivery.byZone.slice(0, 6).map((z) => (
                <View key={z.zone} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>
                      {z.zone}
                    </Text>
                    <View style={styles.track}>
                      <View style={[styles.fill, { width: `${(z.orders / Math.max(1, data.delivery!.byZone[0].orders)) * 100}%`, backgroundColor: colors.info }]} />
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.rowValue}>{z.orders} дост.</Text>
                    <Caption>{money(z.revenue)}</Caption>
                  </View>
                </View>
              ))}
            </>
          )}

          <SectionTitle title="Виручка по днях" />
          <BarChart data={data.revenueByDay.map((d) => ({ label: d.date.slice(8), value: d.revenue, title: `${d.date}: ${money(d.revenue)} · ${d.orders} опл.` }))} format={money} />

          <SectionTitle title="Навантаження по годинах" />
          <BarChart data={data.ordersByHour.map((h) => ({ label: String(h.hour), value: h.orders, title: `${h.hour}:00 — ${h.orders} замовлень` }))} format={(v) => `${v}`} />

          <SectionTitle title="Топ страв" />
          {data.topDishes.length === 0 ? (
            <EmptyState icon={<ChefHat size={30} color={colors.gold} />} title="Немає оплат за період" />
          ) : (
            data.topDishes.map((d, i) => (
              <View key={d.dishId} style={styles.row}>
                <Text style={styles.rank}>{i + 1}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {d.name}
                  </Text>
                  <View style={styles.track}>
                    <View style={[styles.fill, { width: `${(d.quantity / data.topDishes[0].quantity) * 100}%` }]} />
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.rowValue}>{d.quantity} шт</Text>
                  <Caption>{money(d.revenue)}</Caption>
                </View>
              </View>
            ))
          )}
        </>
      )}
    </Screen>
  );
}

function Delta({ v }: { v: number }) {
  const up = v >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <Text style={{ color: up ? colors.success : colors.danger, fontFamily: fonts.semibold, fontSize: 11 }}>
      <Icon size={11} color={up ? colors.success : colors.danger} /> {up ? '+' : ''}
      {Math.round(v)}% до попереднього
    </Text>
  );
}

/** Одна серія — один відтінок бренду; підпис значення показується для обраного стовпчика. */
function BarChart({ data, format }: { data: { label: string; value: number; title: string }[]; format: (v: number) => string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.value), 1);
  const every = Math.ceil(data.length / 8);
  const shown = active ?? data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);
  return (
    <View style={styles.chart}>
      <Text style={styles.chartTitle}>{data[shown]?.title}</Text>
      <View style={styles.bars}>
        {data.map((d, i) => (
          <Pressable key={i} onPress={() => setActive(i)} style={styles.barHit} accessibilityLabel={d.title}>
            <View style={[styles.bar, { height: `${Math.max((d.value / max) * 100, d.value ? 3 : 0)}%`, opacity: i === shown ? 1 : 0.55 }]} />
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 6 }}>
        {data.map((d, i) => (
          <Text key={i} style={styles.axis}>
            {i % every === 0 ? d.label : ''}
          </Text>
        ))}
      </View>
      <Caption style={{ marginTop: 6 }}>Максимум: {format(max)} · торкніться стовпчика</Caption>
    </View>
  );
}

// ─────────────────────────────── Користувачі ───────────────────────────────

const ROLES: Role[] = ['CLIENT', 'STAFF', 'KITCHEN', 'ADMIN'];
const ROLE_TONE = { CLIENT: 'muted', STAFF: 'info', KITCHEN: 'orange', ADMIN: 'gold', COURIER: 'violet' } as const;

export function UsersScreen() {
  const [role, setRole] = useState<Role | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const { data, isLoading } = useUsers({ role: role === 'ALL' ? undefined : role, search: search.trim() || undefined });
  return (
    <Screen>
      <Header title="Користувачі" subtitle={data ? `Знайдено: ${data.total}` : undefined} />
      <View style={styles.searchBox}>
        <Search size={18} color={colors.faint} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Імʼя або email" placeholderTextColor={colors.faint} autoCapitalize="none" style={{ flex: 1, color: colors.text, fontFamily: fonts.medium, height: 44 }} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 14 }}>
        <Chip label="Усі" active={role === 'ALL'} onPress={() => setRole('ALL')} />
        {ROLES.map((r) => (
          <Chip key={r} label={ROLE_LABEL[r]} active={role === r} onPress={() => setRole(r)} />
        ))}
      </View>
      {isLoading ? <Skeleton height={200} /> : (data?.items ?? []).map((u) => <UserCard key={u.id} u={u} />)}
    </Screen>
  );
}

function UserCard({ u }: { u: User }) {
  const { user: me } = useAuth();
  const update = useUpdateUser();
  const [open, setOpen] = useState(false);
  const self = me?.id === u.id;
  return (
    <View style={[styles.userCard, !u.isActive && { opacity: 0.6 }]}>
      <Pressable onPress={() => setOpen((o) => !o)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={styles.initials}>
          <Text style={{ fontFamily: fonts.bold, color: colors.goldLight }}>
            {u.name
              .split(' ')
              .map((p) => p[0])
              .slice(0, 2)
              .join('')}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {u.name} {self ? '(ви)' : ''}
          </Text>
          <Caption numberOfLines={1}>{u.email}</Caption>
        </View>
        <Badge tone={u.isActive ? ROLE_TONE[u.role] : 'danger'}>{u.isActive ? ROLE_LABEL[u.role] : 'Вимкнено'}</Badge>
      </Pressable>
      {open && !self && (
        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Caption style={{ marginBottom: 8 }}>Роль</Caption>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {ROLES.map((r) => (
              <Chip
                key={r}
                label={ROLE_LABEL[r]}
                active={u.role === r}
                icon={r === 'ADMIN' ? <ShieldCheck size={14} color={u.role === r ? colors.goldLight : colors.textSoft} /> : undefined}
                onPress={() => r !== u.role && confirmAction('Змінити роль?', `${u.name}: ${ROLE_LABEL[u.role]} → ${ROLE_LABEL[r]}`, 'Змінити', () => update.mutate({ id: u.id, role: r }))}
              />
            ))}
          </View>
          <Pressable
            onPress={() => confirmAction(u.isActive ? 'Деактивувати акаунт?' : 'Активувати акаунт?', u.isActive ? 'Користувач одразу втратить доступ до системи.' : 'Користувач знову зможе входити.', u.isActive ? 'Деактивувати' : 'Активувати', () => update.mutate({ id: u.id, isActive: !u.isActive }))}
            style={[styles.toggle, { borderColor: u.isActive ? 'rgba(251,113,133,0.35)' : 'rgba(52,211,153,0.35)' }]}
          >
            <Text style={{ fontFamily: fonts.semibold, color: u.isActive ? colors.danger : colors.success }}>{u.isActive ? 'Деактивувати' : 'Активувати'}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 18 },
  chart: { padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chartTitle: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text, marginBottom: 10 },
  bars: { height: 130, flexDirection: 'row', alignItems: 'flex-end', gap: 2, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  barHit: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  bar: { backgroundColor: colors.gold, borderTopLeftRadius: 4, borderTopRightRadius: 4, minHeight: 0 },
  axis: { flex: 1, textAlign: 'center', fontFamily: fonts.medium, fontSize: 9.5, color: colors.faint },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  rank: { width: 22, fontFamily: fonts.display, fontSize: 18, color: colors.gold, textAlign: 'center' },
  rowTitle: { fontFamily: fonts.semibold, fontSize: 14.5, color: colors.text },
  rowValue: { fontFamily: fonts.bold, fontSize: 14, color: colors.text },
  track: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.07)', marginTop: 6 },
  fill: { height: '100%', borderRadius: 2, backgroundColor: colors.gold },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, paddingHorizontal: 14, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  userCard: { padding: 14, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  initials: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  toggle: { marginTop: 12, height: 42, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
