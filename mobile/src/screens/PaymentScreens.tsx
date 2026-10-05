import { useMemo, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, Check, Lock, ShieldCheck, Star } from 'lucide-react-native';
import { Body, Button, Caption, DishImage, Eyebrow, Field, Header, Screen, Skeleton, Title } from '../components/ui';
import { colors, fonts, goldGradient, radius } from '../theme';
import { api, dapi } from '../api/client';
import { haptic } from '../lib/notify';
import { useToast } from '../lib/toast';
import { money } from '../lib/format';
import type { Order, PayResult } from '../api/types';
import type { ScreenProps } from '../navigation/types';

const TEST_CARDS = [
  { n: '4242 4242 4242 4242', l: 'Успіх' },
  { n: '4000 0000 0000 3220', l: '3-D Secure' },
  { n: '4000 0000 0000 0002', l: 'Відмова' },
];

const fmtCard = (v: string) =>
  v
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, '$1 ');

export function PaymentScreen({ route, navigation }: ScreenProps<'Payment'>) {
  const qc = useQueryClient();
  const toast = useToast();
  const isDelivery = Boolean(route.params.delivery);
  // доставку оплачуємо через Delivery API, замовлення в залі — через Restaurant API
  const { data: order } = useQuery({
    queryKey: isDelivery ? ['delivery', 'order', route.params.orderId] : ['order', route.params.orderId],
    queryFn: () => (isDelivery ? dapi.get<Order>(`/delivery/orders/${route.params.orderId}`) : api.get<Order>(`/orders/${route.params.orderId}`)),
  });
  const [number, setNumber] = useState('');
  const [exp, setExp] = useState('');
  const [cvc, setCvc] = useState('');
  const [tipPct, setTipPct] = useState(isDelivery ? 0 : 10);
  const [otp, setOtp] = useState('');
  const [challenge, setChallenge] = useState<number | null>(null);
  const [result, setResult] = useState<PayResult | null>(null);
  const idem = useMemo(() => `app-${route.params.orderId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, [route.params.orderId]);
  const pop = useRef(new Animated.Value(0)).current;

  const tip = order ? Math.round((order.total * tipPct) / 100 / 100) * 100 : 0;
  const brand = number.startsWith('4') ? 'VISA' : /^5[1-5]/.test(number) ? 'MASTERCARD' : '';
  const valid = number.replace(/\s/g, '').length >= 15 && /^\d{2}\/\d{2}$/.test(exp) && /^\d{3,4}$/.test(cvc);

  const success = (r: PayResult) => {
    haptic.success();
    setResult(r);
    setChallenge(null);
    qc.invalidateQueries();
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  };

  const pay = useMutation({
    mutationFn: () => {
      const [mm, yy] = exp.split('/');
      const card = { number, expMonth: Number(mm), expYear: Number(yy), cvc };
      const headers = { 'Idempotency-Key': `${idem}-${number.slice(-4)}` };
      return isDelivery
        ? dapi.post<PayResult>(`/delivery/orders/${route.params.orderId}/pay`, { tip, card }, headers)
        : api.post<PayResult>('/payments/card', { orderId: route.params.orderId, tip, card }, headers);
    },
    onSuccess: (r) => {
      if (r.requiresAction) {
        haptic.light();
        setChallenge(r.payment.id);
      } else success(r);
    },
    onError: (e) => {
      haptic.error();
      toast({ title: 'Оплату відхилено', body: (e as Error).message, tone: 'danger' });
    },
  });
  const confirm = useMutation({
    mutationFn: () => (isDelivery ? dapi.post<PayResult>(`/delivery/payments/${challenge}/confirm`, { otp }) : api.post<PayResult>(`/payments/${challenge}/confirm`, { otp })),
    onSuccess: success,
    onError: (e) => {
      haptic.error();
      setChallenge(null);
      setOtp('');
      toast({ title: 'Не підтверджено', body: (e as Error).message, tone: 'danger' });
    },
  });

  if (result) {
    return (
      <Screen edges={['top', 'bottom']} contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
        <Animated.View style={{ alignItems: 'center', transform: [{ scale: pop }] }}>
          <LinearGradient colors={goldGradient} style={styles.okCircle}>
            <Check size={46} color="#141008" strokeWidth={3} />
          </LinearGradient>
        </Animated.View>
        <Title style={{ textAlign: 'center', marginTop: 24, fontSize: 34 }}>Оплачено!</Title>
        <Body style={{ textAlign: 'center', marginTop: 6 }}>{isDelivery ? 'Замовлення вже на кухні — стежте за доставкою' : 'Дякуємо, що обрали Smart Restaurant'}</Body>
        <View style={styles.receipt}>
          <Row k="Замовлення" v={`#${result.order.id}`} />
          <Row k="Сума" v={money(result.payment.amount)} />
          <Row k="Чайові" v={money(result.payment.tip)} />
          <View style={{ borderTopWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.18)', marginVertical: 8 }} />
          <Row k="Разом" v={money(result.payment.total)} bold />
          <Row k="Картка" v={`${result.payment.cardBrand} •• ${result.payment.cardLast4}`} />
          <Row k="Транзакція" v={result.payment.providerRef.slice(0, 16)} />
        </View>
        {isDelivery ? (
          <Button title="Стежити за доставкою" style={{ marginTop: 20 }} icon={<Bike size={18} color="#141008" />} onPress={() => navigation.replace('DeliveryOrder', { id: result.order.id, justCreated: true })} />
        ) : (
          <>
            <Button title="Оцінити візит" variant="outline" style={{ marginTop: 20 }} onPress={() => navigation.replace('Review', { orderId: result.order.id })} />
            <Button title="Готово" style={{ marginTop: 10 }} onPress={() => navigation.goBack()} />
          </>
        )}
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen edges={['top']} contentStyle={{ paddingBottom: 60 }}>
        <Header title="Оплата" subtitle={order ? `Замовлення #${order.id} · ${order.table ? `столик №${order.table.number}` : `доставка · ${order.delivery?.zone.name ?? ''}`}` : undefined} />
        {!order ? (
          <Skeleton height={400} />
        ) : challenge ? (
          <View style={styles.challenge}>
            <ShieldCheck size={44} color={colors.gold} />
            <Title style={{ fontSize: 26, marginTop: 12 }}>3-D Secure</Title>
            <Body style={{ textAlign: 'center', marginTop: 6 }}>Банк надіслав код підтвердження.{'\n'}Sandbox-код: 123456</Body>
            <TextInput value={otp} onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" autoFocus placeholder="••••••" placeholderTextColor={colors.faint} style={styles.otp} />
            <Button title="Підтвердити" style={{ alignSelf: 'stretch', marginTop: 20 }} disabled={otp.length < 4} loading={confirm.isPending} onPress={() => confirm.mutate()} />
          </View>
        ) : (
          <>
            <LinearGradient colors={['#2e2718', '#101015', '#3a2815']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <LinearGradient colors={['#f9ecc9', '#dcab4a', '#a7752c']} style={styles.chip} />
                <Text style={{ fontFamily: fonts.bold, fontStyle: 'italic', color: colors.text, fontSize: 16 }}>{brand}</Text>
              </View>
              <Text style={styles.cardNumber}>{number || '•••• •••• •••• ••••'}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={styles.cardSmall}>SMART RESTAURANT</Text>
                <Text style={styles.cardSmall}>{exp || 'MM/YY'}</Text>
              </View>
            </LinearGradient>

            <Field label="Номер картки" value={number} onChangeText={(t) => setNumber(fmtCard(t))} keyboardType="number-pad" placeholder="4242 4242 4242 4242" />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Термін"
                  value={exp}
                  onChangeText={(t) => {
                    const d = t.replace(/\D/g, '').slice(0, 4);
                    setExp(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                  }}
                  keyboardType="number-pad"
                  placeholder="12/29"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="CVC" value={cvc} onChangeText={(t) => setCvc(t.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" placeholder="123" secureTextEntry />
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
              {TEST_CARDS.map((c) => (
                <Pressable
                  key={c.n}
                  onPress={() => {
                    haptic.tap();
                    setNumber(c.n);
                    setExp('12/29');
                    setCvc('123');
                  }}
                  style={styles.testCard}
                >
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 11, color: colors.textSoft }}>
                    {c.l} ·{c.n.slice(-4)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Eyebrow style={{ marginBottom: 10 }}>{isDelivery ? 'Чайові курʼєру' : 'Чайові для команди'}</Eyebrow>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[0, 5, 10, 15].map((p) => (
                <Pressable
                  key={p}
                  onPress={() => {
                    haptic.tap();
                    setTipPct(p);
                  }}
                  style={[styles.tip, tipPct === p && { borderColor: colors.goldBorder, backgroundColor: colors.goldSoft }]}
                >
                  <Text style={{ fontFamily: fonts.bold, color: tipPct === p ? colors.goldLight : colors.muted }}>{p === 0 ? 'Без' : `${p}%`}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.summary}>
              <Row k="Замовлення" v={money(order.total)} />
              <Row k="Чайові" v={money(tip)} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 8 }}>
                <Body>До сплати</Body>
                <Text style={{ fontFamily: fonts.display, fontSize: 30, color: colors.goldLight }}>{money(order.total + tip)}</Text>
              </View>
            </View>
            <Button title={`Сплатити ${money(order.total + tip)}`} icon={<Lock size={18} color="#141008" />} disabled={!valid} loading={pay.isPending} onPress={() => pay.mutate()} />
            <Caption style={{ textAlign: 'center', marginTop: 12 }}>Sandbox-платіж · номер картки й CVC не зберігаються</Caption>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={{ fontFamily: fonts.medium, color: colors.muted, fontSize: 13.5 }}>{k}</Text>
      <Text style={{ fontFamily: bold ? fonts.bold : fonts.medium, color: bold ? colors.text : colors.textSoft, fontSize: 13.5 }}>{v}</Text>
    </View>
  );
}

const LABELS = ['', 'Погано', 'Так собі', 'Добре', 'Дуже добре', 'Неймовірно!'];

function Stars({ value, onChange, size = 36 }: { value: number; onChange: (v: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable
          key={i}
          onPress={() => {
            haptic.tap();
            onChange(i);
          }}
          accessibilityLabel={`${i} зірок`}
        >
          <Star size={size} color={colors.gold} fill={i <= value ? colors.gold : 'transparent'} strokeWidth={1.6} />
        </Pressable>
      ))}
    </View>
  );
}

export function ReviewScreen({ route, navigation }: ScreenProps<'Review'>) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: order } = useQuery({ queryKey: ['order', route.params.orderId], queryFn: () => api.get<Order>(`/orders/${route.params.orderId}`) });
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [dishes, setDishes] = useState<Record<number, number>>({});
  const submit = useMutation({
    mutationFn: () => api.post(`/orders/${route.params.orderId}/review`, { rating, comment: comment || undefined, dishes: Object.entries(dishes).map(([dishId, r]) => ({ dishId: Number(dishId), rating: r })) }),
    onSuccess: () => {
      haptic.success();
      qc.invalidateQueries();
      toast({ title: 'Дякуємо за відгук! ❤️', tone: 'gold' });
      navigation.goBack();
    },
    onError: (e) => toast({ title: (e as Error).message, tone: 'danger' }),
  });
  const unique = order ? [...new Map(order.items.map((i) => [i.dishId, i])).values()] : [];

  return (
    <Screen edges={['top']}>
      <Header title="Ваш відгук" subtitle={order ? `Замовлення #${order.id}` : undefined} />
      <View style={{ alignItems: 'center', marginTop: 10 }}>
        <Title style={{ fontSize: 26 }}>{order?.type === 'DELIVERY' ? 'Як вам доставка?' : 'Як вам візит?'}</Title>
        <View style={{ marginTop: 18 }}>
          <Stars value={rating} onChange={setRating} size={42} />
        </View>
        <Text style={{ fontFamily: fonts.display, fontSize: 18, color: colors.goldLight, marginTop: 10 }}>{LABELS[rating]}</Text>
      </View>
      <Field label="Коментар" value={comment} onChangeText={setComment} placeholder={order?.type === 'DELIVERY' ? 'Гаряча? Вчасно? Курʼєр ввічливий?' : 'Що сподобалось найбільше?'} multiline style={{ height: 96, paddingTop: 14, textAlignVertical: 'top' }} />
      <Eyebrow style={{ marginBottom: 10 }}>Оцініть страви</Eyebrow>
      {unique.map((i) => (
        <View key={i.dishId} style={styles.dishRate}>
          <DishImage uri={i.imageUrl} category={i.category.slug} size={44} radius={12} />
          <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.semibold, color: colors.text }}>
            {i.name}
          </Text>
          <Stars size={18} value={dishes[i.dishId] ?? 0} onChange={(v) => setDishes((d) => ({ ...d, [i.dishId]: v }))} />
        </View>
      ))}
      <Button title="Надіслати відгук" style={{ marginTop: 18 }} loading={submit.isPending} onPress={() => submit.mutate()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { height: 190, borderRadius: 24, padding: 22, justifyContent: 'space-between', marginBottom: 22, borderWidth: 1, borderColor: 'rgba(220,171,74,0.25)' },
  chip: { width: 44, height: 32, borderRadius: 7 },
  cardNumber: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }), fontSize: 20, letterSpacing: 2, color: colors.text },
  cardSmall: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 1.5, color: colors.muted },
  testCard: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.03)' },
  tip: { flex: 1, height: 46, borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  summary: { marginVertical: 20, padding: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  challenge: { alignItems: 'center', padding: 24, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginTop: 20 },
  otp: { marginTop: 22, width: 220, height: 64, borderRadius: 18, borderWidth: 1, borderColor: colors.goldBorder, backgroundColor: colors.bgElevated, textAlign: 'center', fontSize: 28, letterSpacing: 10, color: colors.text, fontFamily: fonts.bold },
  okCircle: { width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center', shadowColor: colors.gold, shadowOpacity: 0.6, shadowRadius: 30, elevation: 12 },
  receipt: { marginTop: 26, padding: 18, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.18)' },
  dishRate: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 16, backgroundColor: colors.surface, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
});
