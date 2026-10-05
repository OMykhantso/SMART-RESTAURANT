import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { Bike, ChefHat, MapPin, PackageCheck, Phone, UserRound, XCircle } from 'lucide-react-native';
import { Badge, Button, Caption, Card, EmptyState, Eyebrow, Header, Screen, Skeleton } from '../../components/ui';
import { Segmented } from '../../components/staff';
import { DeliveryProgress, formatPhone } from '../../components/delivery';
import { colors, fonts, radius } from '../../theme';
import { useAuth } from '../../lib/auth';
import { confirmAction } from '../../lib/confirm';
import { fmtTime, minutesSince, money } from '../../lib/format';
import { DELIVERY_META } from '../../lib/status';
import { useAssignCourier, useCancelDelivery, useCouriers, useDispatch, useZoneUpdate, useZones } from '../../lib/delivery';
import type { DeliveryZone, Order } from '../../api/types';

type Filter = 'active' | 'done' | 'cancelled';

/** Диспетчерська доставок: усі доставки за день, курʼєри, призначення, скасування. */
export function DispatchScreen() {
  const qc = useQueryClient();
  const list = useDispatch();
  const couriers = useCouriers();
  const [filter, setFilter] = useState<Filter>('active');
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await qc.invalidateQueries({ queryKey: ['dispatch'] });
    setRefreshing(false);
  }, [qc]);

  const all = list.data ?? [];
  const groups = useMemo(
    () => ({
      active: all.filter((o) => ['NEW', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERING'].includes(o.status)),
      done: all.filter((o) => o.status === 'DELIVERED'),
      cancelled: all.filter((o) => o.status === 'CANCELLED'),
    }),
    [all],
  );
  const waiting = groups.active.filter((o) => !o.delivery?.courier && o.status !== 'NEW').length;
  const onTheWay = groups.active.filter((o) => o.status === 'DELIVERING').length;
  const revenue = groups.done.reduce((s, o) => s + o.total, 0);

  return (
    <Screen edges={['top']} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.gold} />}>
      <Header title="Доставка" subtitle="Диспетчерська · сьогодні" />
      <View style={styles.strip}>
        <StripItem icon={<ChefHat size={16} color={colors.warning} />} value={String(waiting)} label="без курʼєра" />
        <View style={styles.stripDiv} />
        <StripItem icon={<Bike size={16} color={colors.info} />} value={String(onTheWay)} label="в дорозі" />
        <View style={styles.stripDiv} />
        <StripItem icon={<PackageCheck size={16} color={colors.success} />} value={money(revenue)} label={`доставлено · ${groups.done.length}`} />
      </View>

      <Eyebrow style={{ marginTop: 20, marginBottom: 10 }}>Курʼєри на зміні</Eyebrow>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(couriers.data ?? []).map((c) => (
          <View key={c.id} style={styles.courierChip}>
            <View style={[styles.dot, { backgroundColor: c.active === 0 ? colors.success : c.active >= 2 ? colors.danger : colors.warning }]} />
            <Text style={{ fontFamily: fonts.semibold, color: colors.text, fontSize: 13 }}>{c.name}</Text>
            <Caption>{c.active === 0 ? 'вільний' : `${c.active} в роботі`}</Caption>
          </View>
        ))}
        {couriers.data?.length === 0 && <Caption>Немає активних курʼєрів — додайте їх у «Користувачі»</Caption>}
      </View>

      <View style={{ marginTop: 18 }}>
        <Segmented
          value={filter}
          onChange={setFilter}
          items={[
            { key: 'active', label: 'Активні', count: groups.active.length },
            { key: 'done', label: 'Доставлені', count: groups.done.length },
            { key: 'cancelled', label: 'Скасовані', count: groups.cancelled.length },
          ]}
        />
      </View>
      <View style={{ marginTop: 14 }}>
        {list.isLoading ? (
          <Skeleton height={240} />
        ) : groups[filter].length === 0 ? (
          <EmptyState icon={<Bike size={26} color={colors.gold} />} title="Порожньо" text="Нові доставки зʼявляться тут у реальному часі" />
        ) : (
          groups[filter].map((o) => <DispatchCard key={o.id} o={o} couriers={couriers.data ?? []} />)
        )}
      </View>
    </Screen>
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
      <Caption style={{ marginTop: 2 }} numberOfLines={1}>
        {label}
      </Caption>
    </View>
  );
}

function DispatchCard({ o, couriers }: { o: Order; couriers: { id: number; name: string; active: number }[] }) {
  const { user } = useAuth();
  const assign = useAssignCourier();
  const cancel = useCancelDelivery();
  const [picking, setPicking] = useState(false);
  const d = o.delivery!;
  const meta = DELIVERY_META[o.status];
  const canAssign = ['CONFIRMED', 'PREPARING', 'READY'].includes(o.status);
  const canCancel = o.status === 'NEW' || o.status === 'CONFIRMED' || (user?.role === 'ADMIN' && ['PREPARING', 'READY', 'DELIVERING'].includes(o.status));
  const late = o.status === 'READY' && minutesSince(o.readyAt) >= 10;
  return (
    <View style={[styles.card, late && { borderColor: 'rgba(251,113,133,0.5)' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.bold, color: colors.text, fontSize: 15 }}>
            #{o.id} · {money(o.total)}
          </Text>
          <Caption>
            {fmtTime(o.createdAt)} · {d.paymentMethod === 'CARD' ? (o.payment ? 'оплачено онлайн' : 'очікує оплати') : 'готівка'}
          </Caption>
        </View>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
        <MapPin size={15} color={colors.gold} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.medium, color: colors.textSoft, fontSize: 13.5 }}>{d.addressLine}</Text>
          <Caption>
            {d.zone.name} · {d.recipientName} · {formatPhone(d.phone)}
          </Caption>
        </View>
      </View>
      {['CONFIRMED', 'PREPARING', 'READY', 'DELIVERING'].includes(o.status) && (
        <View style={{ marginTop: 12 }}>
          <DeliveryProgress status={o.status} />
        </View>
      )}
      {late && <Text style={{ fontFamily: fonts.semibold, color: colors.danger, fontSize: 12.5, marginTop: 8 }}>Готове вже {minutesSince(o.readyAt)} хв — терміново призначте курʼєра</Text>}

      <View style={styles.courierRow}>
        <UserRound size={15} color={d.courier ? colors.info : colors.faint} />
        <Text style={{ flex: 1, fontFamily: fonts.medium, color: d.courier ? colors.text : colors.faint, fontSize: 13 }}>{d.courier ? d.courier.name : 'Курʼєра не призначено'}</Text>
        {d.courier?.phone ? <Phone size={14} color={colors.faint} /> : null}
        {canAssign && (
          <Pressable onPress={() => setPicking((v) => !v)} style={styles.assignBtn}>
            <Text style={{ fontFamily: fonts.semibold, color: colors.goldLight, fontSize: 12.5 }}>{d.courier ? 'Змінити' : 'Призначити'}</Text>
          </Pressable>
        )}
      </View>
      {picking && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {couriers.map((c) => (
            <Pressable
              key={c.id}
              onPress={() => assign.mutate({ id: o.id, courierId: c.id }, { onSuccess: () => setPicking(false) })}
              style={[styles.pick, c.id === d.courier?.id && { borderColor: colors.goldBorder, backgroundColor: colors.goldSoft }]}
            >
              <Text style={{ fontFamily: fonts.semibold, color: colors.text, fontSize: 13 }}>{c.name.split(' ')[0]}</Text>
              <Caption>{c.active} в роботі</Caption>
            </Pressable>
          ))}
          {d.courier && (
            <Pressable onPress={() => assign.mutate({ id: o.id, courierId: null }, { onSuccess: () => setPicking(false) })} style={styles.pick}>
              <Text style={{ fontFamily: fonts.semibold, color: colors.danger, fontSize: 13 }}>Зняти</Text>
            </Pressable>
          )}
        </View>
      )}
      {canCancel && (
        <Pressable
          onPress={() =>
            confirmAction('Скасувати доставку?', o.payment ? 'Клієнту автоматично повернуться кошти' : `Замовлення #${o.id}`, 'Скасувати', () =>
              cancel.mutate({ id: o.id, reason: 'Скасовано рестораном' }),
            )
          }
          style={styles.cancel}
        >
          <XCircle size={14} color={colors.danger} />
          <Text style={{ fontFamily: fonts.medium, color: colors.danger, fontSize: 12.5 }}>Скасувати</Text>
        </Pressable>
      )}
      {o.status === 'CANCELLED' && o.cancelReason ? <Caption style={{ marginTop: 8 }}>Причина: {o.cancelReason}</Caption> : null}
    </View>
  );
}

/** Зони доставки (адміністратор): вартість, мінімальна сума, час, увімкнення. */
export function ZonesScreen() {
  const zones = useZones(true);
  return (
    <Screen edges={['top']}>
      <Header title="Зони доставки" subtitle="Тарифи та райони обслуговування" />
      {zones.isLoading ? <Skeleton height={300} /> : (zones.data ?? []).map((z) => <ZoneEditor key={`${z.id}-${z.fee}-${z.minOrder}-${z.travelMin}`} z={z} />)}
    </Screen>
  );
}

function ZoneEditor({ z }: { z: DeliveryZone }) {
  const update = useZoneUpdate();
  const [fee, setFee] = useState(String(z.fee / 100));
  const [min, setMin] = useState(String(z.minOrder / 100));
  const [free, setFree] = useState(z.freeFrom ? String(z.freeFrom / 100) : '');
  const [travel, setTravel] = useState(String(z.travelMin));
  const dirty = fee !== String(z.fee / 100) || min !== String(z.minOrder / 100) || free !== (z.freeFrom ? String(z.freeFrom / 100) : '') || travel !== String(z.travelMin);
  const n = (v: string) => Math.round(Number(v.replace(',', '.')) * 100);
  return (
    <Card style={{ marginBottom: 12, opacity: z.isActive ? 1 : 0.75 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.semibold, color: colors.text, fontSize: 16 }}>{z.name}</Text>
          {z.description ? <Caption>{z.description}</Caption> : null}
        </View>
        <Switch value={z.isActive} onValueChange={(v) => update.mutate({ id: z.id, isActive: v })} trackColor={{ true: colors.gold, false: colors.surfaceHigh }} thumbColor={colors.text} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Num label="Доставка, ₴" value={fee} onChange={setFee} />
        <Num label="Мінімум, ₴" value={min} onChange={setMin} />
        <Num label="Безкошт. від" value={free} onChange={setFree} />
        <Num label="Дорога, хв" value={travel} onChange={setTravel} />
      </View>
      {dirty && (
        <Button
          title="Зберегти тариф"
          size="sm"
          style={{ marginTop: 12 }}
          loading={update.isPending}
          onPress={() => update.mutate({ id: z.id, fee: n(fee), minOrder: n(min), freeFrom: free ? n(free) : null, travelMin: Math.round(Number(travel)) })}
        />
      )}
    </Card>
  );
}

function Num({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontFamily: fonts.medium, color: colors.muted, fontSize: 10.5, marginBottom: 4 }} numberOfLines={1}>
        {label}
      </Text>
      <TextInput value={value} onChangeText={(t) => onChange(t.replace(/[^\d.,]/g, ''))} keyboardType="decimal-pad" style={styles.num} placeholder="—" placeholderTextColor={colors.faint} />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  stripDiv: { width: 1, height: 28, backgroundColor: colors.border },
  courierChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  dot: { width: 8, height: 8, borderRadius: 4 },
  card: { padding: 16, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  courierRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 10, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)' },
  assignBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: colors.goldBorder },
  pick: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.03)' },
  cancel: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', marginTop: 10, paddingVertical: 4 },
  num: { height: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.03)', paddingHorizontal: 10, color: colors.text, fontFamily: fonts.semibold, fontSize: 14 },
});
