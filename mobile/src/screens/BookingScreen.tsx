import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Minus, Plus, Wand2 } from 'lucide-react-native';
import { Button, Caption, Card, Chip, Eyebrow, Header, Screen, Skeleton } from '../components/ui';
import { MiniFloorPlan } from '../components/domain';
import { colors, fonts, goldGradient, radius } from '../theme';
import { api, ApiError } from '../api/client';
import { haptic } from '../lib/notify';
import { useToast } from '../lib/toast';
import { addDays, guestsLabel, isoDay, relativeDay } from '../lib/format';
import { ZONE_LABEL } from '../lib/status';
import type { Availability, Reservation, Slot, TableZone, TablesAvailability } from '../api/types';
import type { ScreenProps } from '../navigation/types';

export function BookingScreen({ navigation }: ScreenProps<'Booking'>) {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const toast = useToast();
  const [date, setDate] = useState(isoDay());
  const [guests, setGuests] = useState(2);
  const [zone, setZone] = useState<TableZone | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [tableId, setTableId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => addDays(isoDay(), i)), []);

  const availability = useQuery({
    queryKey: ['availability', date, guests, zone],
    queryFn: () => api.get<Availability>('/booking/availability', { date, guests, zone: zone ?? undefined }),
  });
  const tables = useQuery({
    queryKey: ['booking-tables', slot?.startAt, guests, zone],
    queryFn: () => api.get<TablesAvailability>('/booking/tables', { startAt: slot!.startAt, guests, zone: zone ?? undefined }),
    enabled: Boolean(slot),
  });
  useEffect(() => {
    setSlot(null);
    setTableId(null);
  }, [date, guests, zone]);
  useEffect(() => {
    if (tables.data) setTableId(tables.data.recommendedTableId);
  }, [tables.data]);
  const selected = tables.data?.tables.find((t) => t.id === tableId);

  const book = useMutation({
    mutationFn: () => api.post<Reservation>('/reservations', { startAt: slot!.startAt, guests, tableId: tableId ?? undefined, zone: zone ?? undefined, notes: notes || undefined, source: 'APP' }),
    onSuccess: (r) => {
      haptic.success();
      qc.invalidateQueries({ queryKey: ['reservations'] });
      qc.invalidateQueries({ queryKey: ['current-visit'] });
      navigation.replace('Reservation', { id: r.id, justCreated: true });
    },
    onError: (e) => {
      haptic.error();
      const alts = e instanceof ApiError ? (e.details as { alternatives?: { time: string }[] } | undefined)?.alternatives : undefined;
      toast({ title: (e as Error).message, body: alts?.length ? `Вільно: ${alts.map((a) => a.time).join(', ')}` : undefined, tone: 'danger' });
      qc.invalidateQueries({ queryKey: ['availability'] });
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen edges={['top']} contentStyle={{ paddingBottom: 170 }}>
        <Header title="Бронювання" subtitle="Booking engine підбере найкращий столик" />

        <Eyebrow style={styles.step}>Дата</Eyebrow>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
          {days.map((d) => {
            const active = d === date;
            const dt = new Date(`${d}T12:00:00Z`);
            const inner = (
              <>
                <Text style={[styles.dayW, active && { color: '#141008' }]}>{d === isoDay() ? 'Сьог.' : new Intl.DateTimeFormat('uk-UA', { weekday: 'short', timeZone: 'UTC' }).format(dt)}</Text>
                <Text style={[styles.dayN, active && { color: '#141008' }]}>{dt.getUTCDate()}</Text>
                <Text style={[styles.dayM, active && { color: '#141008' }]}>{new Intl.DateTimeFormat('uk-UA', { month: 'short', timeZone: 'UTC' }).format(dt)}</Text>
              </>
            );
            return (
              <Pressable
                key={d}
                onPress={() => {
                  haptic.tap();
                  setDate(d);
                }}
              >
                {active ? (
                  <LinearGradient colors={goldGradient} style={styles.day}>
                    {inner}
                  </LinearGradient>
                ) : (
                  <View style={[styles.day, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}>{inner}</View>
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
          <Card style={{ flex: 1, padding: 14 }}>
            <Eyebrow style={{ color: colors.muted }}>Гості</Eyebrow>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <Pressable onPress={() => setGuests((g) => Math.max(1, g - 1))} style={styles.round} accessibilityLabel="Менше гостей">
                <Minus size={18} color={colors.text} />
              </Pressable>
              <Text style={{ fontFamily: fonts.display, fontSize: 32, color: colors.text }}>{guests}</Text>
              <Pressable onPress={() => setGuests((g) => Math.min(12, g + 1))} style={styles.round} accessibilityLabel="Більше гостей">
                <Plus size={18} color={colors.text} />
              </Pressable>
            </View>
            <Caption style={{ marginTop: 8, textAlign: 'center' }}>{availability.data ? `${availability.data.durationMin} хв візиту` : ' '}</Caption>
          </Card>
        </View>

        <Eyebrow style={styles.step}>Зона</Eyebrow>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
          <Chip label="Будь-яка" active={zone === null} onPress={() => setZone(null)} />
          {(Object.keys(ZONE_LABEL) as TableZone[]).map((z) => (
            <Chip key={z} label={ZONE_LABEL[z]} active={zone === z} onPress={() => setZone(z)} />
          ))}
        </ScrollView>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <Eyebrow style={styles.step}>Час · {relativeDay(date)}</Eyebrow>
          {availability.data && <Caption>вільно {availability.data.availableCount}</Caption>}
        </View>
        {availability.isLoading ? (
          <Skeleton height={140} />
        ) : availability.error ? (
          <Text style={styles.error}>{(availability.error as Error).message}</Text>
        ) : availability.data && availability.data.slots.length === 0 ? (
          <Text style={styles.muted}>На цю дату слотів не залишилось — оберіть інший день.</Text>
        ) : (
          <View style={styles.slots}>
            {availability.data?.slots.map((s) => {
              const active = slot?.startAt === s.startAt;
              return (
                <Pressable
                  key={s.startAt}
                  disabled={!s.available}
                  onPress={() => {
                    haptic.tap();
                    setSlot(s);
                  }}
                  style={{ width: '23%' }}
                >
                  {active ? (
                    <LinearGradient colors={goldGradient} style={styles.slot}>
                      <Text style={[styles.slotT, { color: '#141008' }]}>{s.time}</Text>
                    </LinearGradient>
                  ) : (
                    <View style={[styles.slot, { backgroundColor: s.available ? colors.surface : 'transparent', borderWidth: 1, borderColor: s.available ? colors.border : 'rgba(255,255,255,0.04)' }]}>
                      <Text style={[styles.slotT, !s.available && { color: colors.faint, textDecorationLine: 'line-through' }]}>{s.time}</Text>
                      {s.available && s.tablesLeft <= 2 && <Text style={{ fontFamily: fonts.semibold, fontSize: 9, color: colors.warning }}>останні</Text>}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        )}

        {slot && (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 26, marginBottom: 12 }}>
              <Wand2 size={16} color={colors.gold} />
              <Eyebrow>Ваш столик</Eyebrow>
            </View>
            {tables.data ? (
              <>
                <MiniFloorPlan tables={tables.data.tables} selectedId={tableId} onSelect={(t) => setTableId(t.id)} />
                <Caption style={{ marginTop: 8 }}>Натисніть на вільний столик, щоб обрати інший</Caption>
                {selected && (
                  <Card style={{ marginTop: 14, borderColor: colors.goldBorder }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontFamily: fonts.display, fontSize: 22, color: colors.text }}>Столик №{selected.number}</Text>
                      <Caption>
                        {ZONE_LABEL[selected.zone]} · {selected.seats} місць
                      </Caption>
                    </View>
                    {(selected.recommended ? selected.reasons : ['Ваш вибір']).map((r) => (
                      <View key={r} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <Check size={14} color={colors.gold} />
                        <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.textSoft }}>{r}</Text>
                      </View>
                    ))}
                  </Card>
                )}
              </>
            ) : (
              <Skeleton height={200} />
            )}
            <TextInput value={notes} onChangeText={setNotes} placeholder="Побажання: день народження, біля вікна…" placeholderTextColor={colors.faint} style={styles.notes} multiline maxLength={500} />
          </>
        )}
      </Screen>
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
          <Caption>
            {relativeDay(date)}
            {slot ? `, ${slot.time}` : ''} · {guestsLabel(guests)}
          </Caption>
          {selected && <Caption style={{ color: colors.gold }}>столик №{selected.number}</Caption>}
        </View>
        <Button title={slot ? 'Забронювати' : 'Оберіть час'} disabled={!slot} loading={book.isPending} onPress={() => book.mutate()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  step: { marginTop: 24, marginBottom: 12 },
  day: { width: 58, height: 76, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dayW: { fontFamily: fonts.semibold, fontSize: 10, color: colors.muted, textTransform: 'uppercase' },
  dayN: { fontFamily: fonts.display, fontSize: 22, color: colors.text, marginVertical: 1 },
  dayM: { fontFamily: fonts.medium, fontSize: 10, color: colors.muted },
  round: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center' },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' },
  slot: { height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  slotT: { fontFamily: fonts.bold, fontSize: 15, color: colors.text },
  error: { color: colors.danger, fontFamily: fonts.medium },
  muted: { color: colors.muted, fontFamily: fonts.medium },
  notes: { marginTop: 16, minHeight: 70, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.03)', padding: 14, color: colors.text, fontFamily: fonts.medium, textAlignVertical: 'top' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 14, backgroundColor: 'rgba(12,12,16,0.98)', borderTopWidth: 1, borderTopColor: colors.border, borderTopLeftRadius: 26, borderTopRightRadius: 26 },
});
