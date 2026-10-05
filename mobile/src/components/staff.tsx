import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ban, Banknote, BellRing, Bike, Check, CheckCheck, Clock, DoorOpen, HandPlatter, LogIn, UserX, Users, X } from 'lucide-react-native';
import { Badge, Button } from './ui';
import { colors, fonts, goldGradient, radius, tones, type Tone } from '../theme';
import { ORDER_META, RESERVATION_META, ZONE_LABEL, placeOf } from '../lib/status';
import { fmtTime, guestsLabel, minutesSince, money } from '../lib/format';
import { confirmAction } from '../lib/confirm';
import { useCashPayment, useOrderAction, useReservationAction } from '../lib/staff';
import type { LiveTable, Order, Reservation, TableShape } from '../api/types';
import { haptic } from '../lib/notify';

// ─────────────────────────────── Плитки та перемикачі ───────────────────────────────

export function StatTile({ label, value, hint, icon, tone = 'gold' }: { label: string; value: string; hint?: ReactNode; icon: ReactNode; tone?: Tone }) {
  return (
    <View style={styles.stat}>
      <View style={[styles.statIcon, { backgroundColor: tones[tone].bg }]}>{icon}</View>
      <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
      {hint ? (
        <Text style={styles.statHint} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function Segmented<K extends string>({ value, onChange, items }: { value: K; onChange: (k: K) => void; items: { key: K; label: string; count?: number }[] }) {
  return (
    <View style={styles.segment}>
      {items.map((it) => {
        const active = it.key === value;
        return (
          <Pressable
            key={it.key}
            onPress={() => {
              haptic.tap();
              onChange(it.key);
            }}
            style={[styles.segItem, active && styles.segActive]}
          >
            <Text style={[styles.segText, active && { color: colors.goldLight }]} numberOfLines={1}>
              {it.label}
            </Text>
            {it.count ? (
              <View style={[styles.segCount, active && { backgroundColor: colors.gold }]}>
                <Text style={[styles.segCountText, active && { color: '#141008' }]}>{it.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─────────────────────────────── Замовлення ───────────────────────────────

/** Картка замовлення для офіціанта: позиції, сума, таймер і лише ті дії, які дозволяє сервер (order.actions). */
export function OrderTicket({ order, compact }: { order: Order; compact?: boolean }) {
  const action = useOrderAction();
  const cash = useCashPayment();
  const meta = ORDER_META[order.status];
  const since = minutesSince(order.confirmedAt ?? order.createdAt);
  const busy = action.isPending || cash.isPending;
  const a = order.actions;
  return (
    <View style={[styles.ticket, order.status === 'READY' && { borderColor: 'rgba(52,211,153,0.45)' }, order.status === 'NEW' && { borderColor: 'rgba(251,191,36,0.4)' }]}>
      <View style={styles.ticketHead}>
        {order.table ? (
          <View style={styles.tableBadge}>
            <Text style={styles.tableBadgeText}>{order.table.number}</Text>
          </View>
        ) : (
          <View style={[styles.tableBadge, { backgroundColor: colors.infoSoft, borderColor: 'rgba(125,211,252,0.35)' }]}>
            <Bike size={20} color={colors.info} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.ticketTitle}>
            #{order.id} · {order.user?.name ?? order.createdBy.name}
            {order.delivery ? ` · ${order.delivery.zone.name}` : ''}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Clock size={12} color={colors.faint} />
            <Text style={styles.ticketSub}>
              {fmtTime(order.createdAt)} · {since} хв тому · {order.itemsCount} поз.
            </Text>
          </View>
        </View>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </View>

      {!compact && (
        <View style={{ marginTop: 10, gap: 6 }}>
          {order.items.map((i) => (
            <View key={i.id} style={styles.itemRow}>
              <Text style={styles.itemQty}>{i.quantity}×</Text>
              <Text style={styles.itemName} numberOfLines={1}>
                {i.category.emoji ?? ''} {i.name}
              </Text>
              {i.status === 'READY' ? <Check size={14} color={colors.success} /> : i.status === 'COOKING' ? <Clock size={14} color={colors.orange} /> : null}
            </View>
          ))}
          {order.notes ? <Text style={styles.note}>💬 {order.notes}</Text> : null}
        </View>
      )}

      <View style={styles.ticketFoot}>
        <Text style={styles.total}>{money(order.total)}</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexShrink: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {a.canCancel && order.status === 'NEW' && (
            <Button
              title=""
              size="sm"
              variant="glass"
              icon={<X size={16} color={colors.danger} />}
              disabled={busy}
              onPress={() => confirmAction('Скасувати замовлення?', `#${order.id} · ${placeOf(order)}`, 'Скасувати', () => action.mutate({ id: order.id, status: 'CANCELLED', reason: 'Скасовано офіціантом' }))}
            />
          )}
          {a.canConfirm && <Button title="Прийняти" size="sm" icon={<Check size={16} color="#141008" />} loading={busy} onPress={() => action.mutate({ id: order.id, status: 'CONFIRMED' })} />}
          {a.canServe && <Button title="Подати" size="sm" variant="success" icon={<HandPlatter size={16} color={colors.success} />} loading={busy} onPress={() => action.mutate({ id: order.id, status: 'SERVED' })} />}
          {a.canPay && order.status === 'SERVED' && (
            <Button
              title="Готівка"
              size="sm"
              variant="outline"
              icon={<Banknote size={16} color={colors.gold} />}
              loading={busy}
              onPress={() => confirmAction('Оплата готівкою', `Отримано ${money(order.total)} за замовлення #${order.id}?`, 'Так, оплачено', () => cash.mutate({ orderId: order.id, tip: 0 }))}
            />
          )}
        </View>
      </View>
      {order.status === 'READY' && !order.delivery && (
        <View style={styles.readyStrip}>
          <BellRing size={14} color={colors.success} />
          <Text style={{ fontFamily: fonts.semibold, color: colors.success, fontSize: 12.5 }}>Готово на кухні — віднесіть гостям</Text>
        </View>
      )}
      {order.delivery && ['CONFIRMED', 'PREPARING', 'READY', 'DELIVERING'].includes(order.status) && (
        <View style={[styles.readyStrip, { backgroundColor: colors.infoSoft }]}>
          <Bike size={14} color={colors.info} />
          <Text style={{ fontFamily: fonts.semibold, color: colors.info, fontSize: 12.5 }}>
            {order.status === 'DELIVERING'
              ? `В дорозі · ${order.delivery.courier?.name ?? 'курʼєр'}`
              : order.delivery.courier
                ? `Курʼєр: ${order.delivery.courier.name}`
                : 'Доставка — шукаємо курʼєра'}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────── Бронювання ───────────────────────────────

export function ReservationCard({ r }: { r: Reservation }) {
  const action = useReservationAction();
  const meta = RESERVATION_META[r.status];
  const a = r.actions;
  const busy = action.isPending;
  const name = r.user?.name ?? r.guestName ?? 'Гість';
  const SHORT: Partial<Record<Reservation['status'], string>> = { PENDING: 'Нове', CONFIRMED: 'Чекаємо', CHECKED_IN: 'У залі', NO_SHOW: 'Не прийшли' };
  const label = SHORT[r.status] ?? meta.label;
  return (
    <View style={[styles.ticket, r.status === 'PENDING' && { borderColor: 'rgba(251,191,36,0.4)' }]}>
      <View style={styles.ticketHead}>
        <View style={styles.timeBox}>
          <Text style={styles.timeText}>{r.time}</Text>
          <Text style={styles.timeSub}>{r.endTime}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.ticketTitle} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.ticketSub} numberOfLines={1}>
            {guestsLabel(r.guests)} · стіл №{r.table.number} · {ZONE_LABEL[r.table.zone]}
          </Text>
          <Text style={[styles.ticketSub, { fontFamily: fonts.bold, letterSpacing: 1, color: colors.faint }]}>{r.code}</Text>
        </View>
        <Badge tone={r.status === 'CHECKED_IN' ? 'success' : meta.tone}>{label}</Badge>
      </View>
      {r.notes ? <Text style={[styles.note, { marginTop: 8 }]}>💬 {r.notes}</Text> : null}
      {(a.canConfirm || a.canReject || a.canCheckIn || a.canComplete || a.canMarkNoShow) && (
        <View style={styles.actions}>
          {a.canReject && (
            <Button title="Відхилити" size="sm" variant="glass" icon={<Ban size={15} color={colors.danger} />} disabled={busy} onPress={() => confirmAction('Відхилити бронювання?', `${r.code} · ${name}`, 'Відхилити', () => action.mutate({ id: r.id, status: 'REJECTED', reason: 'Немає можливості прийняти в цей час' }))} />
          )}
          {a.canMarkNoShow && <Button title="Не прийшов" size="sm" variant="glass" icon={<UserX size={15} color={colors.warning} />} disabled={busy} onPress={() => action.mutate({ id: r.id, status: 'NO_SHOW' })} />}
          {a.canConfirm && <Button title="Підтвердити" size="sm" icon={<CheckCheck size={16} color="#141008" />} loading={busy} onPress={() => action.mutate({ id: r.id, status: 'CONFIRMED' })} />}
          {a.canCheckIn && <Button title="Посадити" size="sm" variant="success" icon={<LogIn size={15} color={colors.success} />} loading={busy} onPress={() => action.mutate({ id: r.id, status: 'CHECKED_IN' })} />}
          {a.canComplete && <Button title="Завершити" size="sm" variant="outline" icon={<DoorOpen size={15} color={colors.gold} />} loading={busy} onPress={() => action.mutate({ id: r.id, status: 'COMPLETED' })} />}
        </View>
      )}
      {r.status === 'CHECKED_IN' && r.unpaidOrdersCount > 0 && <Text style={[styles.ticketSub, { marginTop: 8 }]}>Неоплачених замовлень: {r.unpaidOrdersCount} · {money(r.ordersTotal)}</Text>}
    </View>
  );
}

// ─────────────────────────────── Живий план залу ───────────────────────────────

export const TABLE_STATE: Record<LiveTable['state'], { label: string; tone: Tone }> = {
  FREE: { label: 'Вільний', tone: 'muted' },
  OCCUPIED: { label: 'Гості за столом', tone: 'gold' },
  RESERVED_SOON: { label: 'Скоро бронювання', tone: 'info' },
  LATE: { label: 'Гості запізнюються', tone: 'danger' },
};

const SHAPE = (seats: number, shape: TableShape) => {
  if (shape === 'ROUND') return { w: seats <= 2 ? 34 : 42, h: seats <= 2 ? 34 : 42, r: 99 };
  if (shape === 'SQUARE') return { w: 40, h: 40, r: 10 };
  return { w: seats >= 8 ? 72 : 60, h: 36, r: 10 };
};

export function LiveFloorPlan({ tables, selectedId, onSelect }: { tables: LiveTable[]; selectedId: number | null; onSelect: (t: LiveTable) => void }) {
  const { width } = useWindowDimensions();
  const w = Math.min(width - 40, 560);
  const h = w * 0.7;
  const zones: [string, number, number, number, number][] = [
    ['ЗАЛА', 1, 2, 66, 58],
    ['VIP', 69, 2, 30, 58],
    ['БАР', 1, 63, 32, 35],
    ['ТЕРАСА', 35, 63, 64, 35],
  ];
  return (
    <View style={{ width: w, height: h, borderRadius: 22, backgroundColor: colors.bgElevated, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', alignSelf: 'center' }}>
      {zones.map(([label, x, y, zw, zh]) => (
        <View key={label} style={{ position: 'absolute', left: (x / 100) * w, top: (y / 100) * h, width: (zw / 100) * w, height: (zh / 100) * h, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.07)' }}>
          <Text style={{ position: 'absolute', left: 8, top: 5, fontSize: 8, letterSpacing: 1.5, color: colors.faint, fontFamily: fonts.bold }}>{label}</Text>
        </View>
      ))}
      {tables.map((t) => {
        const s = SHAPE(t.seats, t.shape);
        const selected = t.id === selectedId;
        const tone = tones[TABLE_STATE[t.state].tone];
        const alert = t.signals.readyToServe > 0 ? colors.success : t.signals.newOrders > 0 ? colors.warning : t.signals.awaitingPayment > 0 ? colors.violet : null;
        return (
          <Pressable
            key={t.id}
            onPress={() => {
              haptic.tap();
              onSelect(t);
            }}
            accessibilityLabel={`Столик ${t.number}: ${TABLE_STATE[t.state].label}`}
            style={{ position: 'absolute', left: (t.posX / 100) * w - s.w / 2, top: (t.posY / 100) * h - s.h / 2, width: s.w, height: s.h }}
          >
            {selected ? (
              <LinearGradient colors={goldGradient} style={{ flex: 1, borderRadius: s.r, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: '#141008' }}>{t.number}</Text>
              </LinearGradient>
            ) : (
              <View
                style={{
                  flex: 1,
                  borderRadius: s.r,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1.5,
                  borderColor: t.state === 'FREE' ? 'rgba(255,255,255,0.22)' : tone.fg,
                  backgroundColor: t.state === 'FREE' ? colors.surfaceHigh : tone.bg,
                }}
              >
                <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: t.state === 'FREE' ? colors.text : tone.fg }}>{t.number}</Text>
              </View>
            )}
            {alert && <View style={[styles.signal, { backgroundColor: alert }]} />}
          </Pressable>
        );
      })}
    </View>
  );
}

export function Legend() {
  const items: [string, string][] = [
    [TABLE_STATE.FREE.label, 'rgba(255,255,255,0.4)'],
    [TABLE_STATE.OCCUPIED.label, colors.gold],
    [TABLE_STATE.RESERVED_SOON.label, colors.info],
    [TABLE_STATE.LATE.label, colors.danger],
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12, justifyContent: 'center' }}>
      {items.map(([l, c]) => (
        <View key={l} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 9, height: 9, borderRadius: 3, backgroundColor: c }} />
          <Text style={{ fontFamily: fonts.medium, fontSize: 11.5, color: colors.muted }}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

export function GuestsPill({ n }: { n: number }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Users size={13} color={colors.muted} />
      <Text style={{ fontFamily: fonts.medium, fontSize: 12.5, color: colors.muted }}>{n}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stat: { flexBasis: '47%', flexGrow: 1, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  statIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontFamily: fonts.bold, fontSize: 22, color: colors.text },
  statLabel: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted, marginTop: 2 },
  statHint: { fontFamily: fonts.medium, fontSize: 11, color: colors.faint, marginTop: 2 },
  segment: { flexDirection: 'row', padding: 4, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 4 },
  segItem: { flex: 1, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6, paddingHorizontal: 4 },
  segActive: { backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.goldBorder },
  segText: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.textSoft },
  segCount: { minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  segCountText: { fontFamily: fonts.bold, fontSize: 10.5, color: colors.text },
  ticket: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 12 },
  ticketHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tableBadge: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center' },
  tableBadgeText: { fontFamily: fonts.display, fontSize: 20, color: colors.goldLight },
  ticketTitle: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  ticketSub: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted, marginTop: 1 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemQty: { fontFamily: fonts.bold, fontSize: 13, color: colors.gold, width: 26 },
  itemName: { flex: 1, fontFamily: fonts.medium, fontSize: 13.5, color: colors.textSoft },
  note: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.warning, marginTop: 4 },
  ticketFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  total: { fontFamily: fonts.bold, fontSize: 16, color: colors.goldLight },
  readyStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, padding: 10, borderRadius: 12, backgroundColor: colors.successSoft },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border, justifyContent: 'flex-end' },
  timeBox: { width: 56, height: 56, borderRadius: 16, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center' },
  timeText: { fontFamily: fonts.bold, fontSize: 15, color: colors.goldLight },
  timeSub: { fontFamily: fonts.medium, fontSize: 10.5, color: colors.gold, marginTop: 1 },
  signal: { position: 'absolute', top: -3, right: -3, width: 11, height: 11, borderRadius: 6, borderWidth: 2, borderColor: colors.bgElevated },
});
