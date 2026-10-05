import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banknote, Bike, CircleCheck, Clock, CreditCard, MapPin, MessageSquareHeart, Moon, Plus, RotateCcw, Star, Trash, Truck, XCircle } from 'lucide-react-native';
import { Body, Button, Caption, Card, Chip, DishImage, Divider, EmptyState, Eyebrow, Field, Header, Screen, Skeleton, Title } from '../components/ui';
import { AddressCard, CourierCard, DeliveryHero, DeliveryStepper, formatPhone, PaymentLine, ZonePicker } from '../components/delivery';
import { colors, fonts, radius } from '../theme';
import { useAuth } from '../lib/auth';
import { useCart } from '../lib/cart';
import { useToast } from '../lib/toast';
import { haptic } from '../lib/notify';
import { confirmAction } from '../lib/confirm';
import { fmtDateShort, fmtTime, money } from '../lib/format';
import { useAddresses, useAddressMutations, useCancelDelivery, useDelivery, useDeliveryInfo, usePlaceDelivery, useQuote } from '../lib/delivery';
import type { PayMethod } from '../api/types';
import type { ScreenProps } from '../navigation/types';

const LABELS = ['Дім', 'Робота', 'Інше'];

// ─────────────────────────────── Оформлення доставки ───────────────────────────────

export function CheckoutScreen({ navigation }: ScreenProps<'Checkout'>) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const cart = useCart();
  const toast = useToast();
  const info = useDeliveryInfo();
  const addresses = useAddresses();
  const place = usePlaceDelivery();

  const [mode, setMode] = useState<'saved' | 'new'>('saved');
  const [addressId, setAddressId] = useState<number | null>(null);
  const [zoneId, setZoneId] = useState<number | null>(null);
  const [street, setStreet] = useState('');
  const [house, setHouse] = useState('');
  const [apartment, setApartment] = useState('');
  const [entrance, setEntrance] = useState('');
  const [floor, setFloor] = useState('');
  const [comment, setComment] = useState('');
  const [saveAs, setSaveAs] = useState<string | null>('Дім');
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [method, setMethod] = useState<PayMethod>('CARD');
  const [changeFrom, setChangeFrom] = useState('');
  const [notes, setNotes] = useState('');
  const [touched, setTouched] = useState(false);

  // типова адреса: основна збережена, інакше — форма нової
  useEffect(() => {
    if (!addresses.data) return;
    if (addresses.data.length === 0) setMode('new');
    else if (addressId === null) setAddressId((addresses.data.find((a) => a.isDefault) ?? addresses.data[0]).id);
  }, [addresses.data, addressId]);

  const selected = addresses.data?.find((a) => a.id === addressId) ?? null;
  const activeZone = mode === 'saved' ? (selected?.zoneId ?? null) : zoneId;
  const items = useMemo(() => cart.lines.map((l) => ({ dishId: l.dishId, quantity: l.quantity })), [cart.lines]);
  const quote = useQuote(activeZone, items);
  const window = info.data?.window;
  const q = quote.data;

  const phoneOk = phone.replace(/\D/g, '').length >= 9;
  const addressOk = mode === 'saved' ? Boolean(selected && selected.zone.isActive) : Boolean(zoneId && street.trim().length >= 2 && house.trim());
  const changeKop = changeFrom ? Math.round(Number(changeFrom.replace(',', '.')) * 100) : undefined;
  const changeOk = method !== 'CASH' || !changeKop || (q ? changeKop >= q.total : true);
  const canSubmit = Boolean(q?.canOrder) && phoneOk && addressOk && changeOk && cart.lines.length > 0 && !place.isPending;

  const submit = () => {
    setTouched(true);
    if (!canSubmit) return;
    place.mutate(
      {
        items: cart.lines.map((l) => ({ dishId: l.dishId, quantity: l.quantity, notes: l.notes || undefined })),
        ...(mode === 'saved' && selected
          ? { addressId: selected.id }
          : {
              address: {
                zoneId: zoneId!,
                street: street.trim(),
                house: house.trim(),
                apartment: apartment.trim() || undefined,
                entrance: entrance.trim() || undefined,
                floor: floor.trim() || undefined,
                comment: comment.trim() || undefined,
              },
              saveAddressAs: saveAs ?? undefined,
            }),
        recipientName: name.trim() || undefined,
        phone,
        paymentMethod: method,
        changeFrom: method === 'CASH' ? changeKop : undefined,
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: (o) => {
          cart.clear();
          if (o.status === 'NEW') navigation.replace('Payment', { orderId: o.id, delivery: true });
          else {
            toast({ title: `Замовлення #${o.id} прийнято!`, body: 'Кухня вже отримала його. Оплата — готівкою курʼєру', tone: 'success' });
            navigation.replace('DeliveryOrder', { id: o.id, justCreated: true });
          }
        },
        onError: (e) => toast({ title: 'Не вдалося оформити', body: (e as Error).message, tone: 'danger' }),
      },
    );
  };

  if (cart.lines.length === 0) {
    return (
      <Screen edges={['top']}>
        <Header title="Доставка" />
        <EmptyState icon={<Bike size={26} color={colors.gold} />} title="Кошик порожній" text="Додайте страви з меню — і ми привеземо їх гарячими" action={<Button title="До меню" onPress={() => navigation.navigate('Tabs', { screen: 'Menu' })} />} />
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Screen edges={['top']} contentStyle={{ paddingBottom: 230 }}>
          <Header title="Доставка" subtitle={`${cart.count} поз. · ${money(cart.total)}`} />

          {window && !window.isOpen && (
            <View style={styles.closed}>
              <Moon size={20} color={colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.semibold, color: colors.text }}>Доставка зараз не працює</Text>
                <Caption>
                  Приймаємо замовлення з {window.opensAt} до {window.lastOrderAt}
                  {window.nextOpenLabel ? ` · відкриємось ${window.nextOpenLabel}` : ''}
                </Caption>
              </View>
            </View>
          )}

          <Eyebrow style={styles.section}>Куди привезти</Eyebrow>
          {addresses.isLoading ? (
            <Skeleton height={140} />
          ) : (
            <>
              {mode === 'saved' &&
                addresses.data?.map((a) => <AddressCard key={a.id} address={a} selected={a.id === addressId} onPress={() => setAddressId(a.id)} />)}
              {addresses.data && addresses.data.length > 0 && (
                <Pressable
                  onPress={() => {
                    haptic.tap();
                    setMode(mode === 'saved' ? 'new' : 'saved');
                  }}
                  style={styles.toggleAddr}
                >
                  {mode === 'saved' ? <Plus size={16} color={colors.gold} /> : <MapPin size={16} color={colors.gold} />}
                  <Text style={{ fontFamily: fonts.semibold, color: colors.goldLight }}>{mode === 'saved' ? 'Інша адреса' : 'Обрати збережену адресу'}</Text>
                </Pressable>
              )}
              {mode === 'new' && (
                <Card style={{ marginTop: 4 }}>
                  <Text style={styles.fieldLabel}>Район</Text>
                  {info.data ? <ZonePicker zones={info.data.zones} value={zoneId} onChange={setZoneId} /> : <Skeleton height={90} />}
                  {touched && !zoneId ? <Text style={styles.err}>Оберіть район</Text> : null}
                  <View style={{ height: 14 }} />
                  <Field label="Вулиця" value={street} onChangeText={setStreet} placeholder="вул. Мечникова" error={touched && street.trim().length < 2 ? 'Вкажіть вулицю' : null} />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Field label="Будинок" value={house} onChangeText={setHouse} placeholder="12" error={touched && !house.trim() ? 'Обовʼязково' : null} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field label="Квартира" value={apartment} onChangeText={setApartment} placeholder="5" />
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Field label="Підʼїзд" value={entrance} onChangeText={setEntrance} placeholder="1" keyboardType="number-pad" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Field label="Поверх" value={floor} onChangeText={setFloor} placeholder="2" keyboardType="number-pad" />
                    </View>
                  </View>
                  <Field label="Коментар курʼєру" value={comment} onChangeText={setComment} placeholder="Домофон, орієнтир…" />
                  <Text style={styles.fieldLabel}>Зберегти адресу як</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {LABELS.map((l) => (
                      <Chip key={l} label={l} active={saveAs === l} onPress={() => setSaveAs(saveAs === l ? null : l)} />
                    ))}
                    <Chip label="Не зберігати" active={saveAs === null} onPress={() => setSaveAs(null)} />
                  </View>
                </Card>
              )}
            </>
          )}

          <Eyebrow style={styles.section}>Отримувач</Eyebrow>
          <Card>
            <Field label="Імʼя" value={name} onChangeText={setName} />
            <Field label="Телефон" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+380 50 123 45 67" error={touched && !phoneOk ? 'Вкажіть номер, щоб курʼєр міг подзвонити' : null} />
          </Card>

          <Eyebrow style={styles.section}>Оплата</Eyebrow>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <PayOption icon={<CreditCard size={20} color={method === 'CARD' ? '#141008' : colors.gold} />} title="Карткою онлайн" text="Apple Pay / Visa / Mastercard" active={method === 'CARD'} onPress={() => setMethod('CARD')} />
            <PayOption icon={<Banknote size={20} color={method === 'CASH' ? '#141008' : colors.gold} />} title="Готівкою" text="курʼєру при отриманні" active={method === 'CASH'} onPress={() => setMethod('CASH')} />
          </View>
          {method === 'CASH' && (
            <View style={{ marginTop: 12 }}>
              <Field
                label="Решта з суми (необовʼязково)"
                value={changeFrom}
                onChangeText={(t) => setChangeFrom(t.replace(/[^\d]/g, '').slice(0, 6))}
                keyboardType="number-pad"
                placeholder={q ? `${Math.ceil(q.total / 50000) * 500}` : '1000'}
                error={!changeOk ? `Сума має бути не меншою за ${q ? money(q.total) : 'суму замовлення'}` : null}
              />
            </View>
          )}

          <TextInput value={notes} onChangeText={setNotes} placeholder="Коментар до замовлення (прибори, алергії…)" placeholderTextColor={colors.faint} style={styles.notes} multiline maxLength={500} />
        </Screen>
      </KeyboardAvoidingView>

      <View style={[styles.checkout, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        {q ? (
          <>
            <SumRow k="Страви" v={money(q.subtotal)} />
            <SumRow k={`Доставка · ${q.zone.name}`} v={q.fee === 0 ? 'Безкоштовно' : money(q.fee)} accent={q.fee === 0} />
            {q.missingToMin > 0 ? (
              <Text style={styles.warn}>До мінімального замовлення бракує {money(q.missingToMin)}</Text>
            ) : q.missingToFree ? (
              <Text style={styles.hint}>Ще {money(q.missingToFree)} — і доставка безкоштовна</Text>
            ) : null}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 6, marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Clock size={14} color={colors.gold} />
                <Caption style={{ color: colors.goldLight }}>≈ {q.etaMinutes} хв</Caption>
              </View>
              <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.goldLight }}>{money(q.total)}</Text>
            </View>
          </>
        ) : (
          <Caption style={{ marginBottom: 12 }}>{activeZone ? 'Розраховуємо вартість…' : 'Оберіть адресу, щоб побачити вартість доставки'}</Caption>
        )}
        {q && q.missingToMin > 0 ? (
          <Button title="Додати ще страв" variant="outline" onPress={() => navigation.navigate('Tabs', { screen: 'Menu' })} />
        ) : (
          <Button
            title={method === 'CARD' ? `До оплати${q ? ` · ${money(q.total)}` : ''}` : `Замовити${q ? ` · ${money(q.total)}` : ''}`}
            icon={method === 'CARD' ? <CreditCard size={18} color="#141008" /> : <Truck size={18} color="#141008" />}
            loading={place.isPending}
            disabled={!q?.canOrder}
            onPress={submit}
          />
        )}
      </View>
    </View>
  );
}

function PayOption({ icon, title, text, active, onPress }: { icon: React.ReactNode; title: string; text: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={[styles.pay, active && { borderColor: colors.goldBorder, backgroundColor: colors.goldSoft }]}
    >
      <View style={[styles.payIcon, active && { backgroundColor: colors.gold }]}>{icon}</View>
      <Text style={{ fontFamily: fonts.semibold, color: active ? colors.goldLight : colors.text, marginTop: 10 }}>{title}</Text>
      <Caption style={{ marginTop: 2 }}>{text}</Caption>
    </Pressable>
  );
}

function SumRow({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
      <Text style={{ fontFamily: fonts.medium, color: colors.muted, fontSize: 13.5 }}>{k}</Text>
      <Text style={{ fontFamily: fonts.semibold, color: accent ? colors.success : colors.textSoft, fontSize: 13.5 }}>{v}</Text>
    </View>
  );
}

// ─────────────────────────────── Відстеження доставки ───────────────────────────────

export function DeliveryOrderScreen({ route, navigation }: ScreenProps<'DeliveryOrder'>) {
  const { data: o, isLoading } = useDelivery(route.params.id);
  const cancel = useCancelDelivery();
  const cart = useCart();
  const toast = useToast();
  const pop = useRef(new Animated.Value(route.params.justCreated ? 0 : 1)).current;
  useEffect(() => {
    if (route.params.justCreated) Animated.spring(pop, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  }, [pop, route.params.justCreated]);

  if (isLoading || !o) {
    return (
      <Screen edges={['top']}>
        <Header title={`Доставка #${route.params.id}`} />
        <Skeleton height={180} />
        <Skeleton height={120} style={{ marginTop: 14 }} />
        <Skeleton height={260} style={{ marginTop: 14 }} />
      </Screen>
    );
  }
  const d = o.delivery!;
  const tip = o.payment?.tip ?? 0;

  const repeat = () => {
    for (const i of o.items) for (let k = 0; k < i.quantity; k++)
      cart.add({ id: i.dishId, name: i.name, price: i.unitPrice, imageUrl: i.imageUrl, category: { id: 0, name: i.category.name, slug: i.category.slug, emoji: i.category.emoji } } as never);
    haptic.success();
    toast({ title: 'Страви додано в кошик', body: 'Перевірте наявність і оформіть доставку', tone: 'gold' });
    navigation.navigate('Cart');
  };

  return (
    <Screen edges={['top']}>
      <Header title={`Доставка #${o.id}`} subtitle={`${fmtDateShort(o.createdAt)}, ${fmtTime(o.createdAt)} · ${d.zone.name}`} />
      {route.params.justCreated && (
        <Animated.View style={[styles.created, { transform: [{ scale: pop }], opacity: pop }]}>
          <CircleCheck size={22} color={colors.success} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.semibold, color: colors.text }}>Замовлення прийнято!</Text>
            <Caption>Стежте за статусом — ми повідомимо про кожен крок</Caption>
          </View>
        </Animated.View>
      )}

      <DeliveryHero order={o} />

      {o.status === 'NEW' && o.actions.canPay && (
        <Card style={{ marginTop: 14, borderColor: 'rgba(251,191,36,0.35)' }}>
          <Text style={{ fontFamily: fonts.semibold, color: colors.text, fontSize: 15 }}>Залишилось оплатити</Text>
          <Caption style={{ marginTop: 2 }}>Неоплачене замовлення скасується через 15 хвилин після оформлення</Caption>
          <Button title={`Оплатити ${money(o.total)}`} style={{ marginTop: 14 }} icon={<CreditCard size={18} color="#141008" />} onPress={() => navigation.navigate('Payment', { orderId: o.id, delivery: true })} />
        </Card>
      )}

      {!['NEW', 'CANCELLED'].includes(o.status) && (
        <Card style={{ marginTop: 14, paddingHorizontal: 8 }}>
          <DeliveryStepper order={o} />
        </Card>
      )}

      {d.courier && o.status !== 'CANCELLED' && (
        <View style={{ marginTop: 14 }}>
          <CourierCard courier={d.courier} status={o.status} />
        </View>
      )}

      <Card style={{ marginTop: 14 }}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={styles.pin}>
            <MapPin size={18} color={colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.semibold, color: colors.text, fontSize: 15 }}>{d.addressLine}</Text>
            <Caption style={{ marginTop: 2 }}>
              {d.recipientName} · {formatPhone(d.phone)}
            </Caption>
            {d.comment ? <Caption style={{ marginTop: 4, fontStyle: 'italic' }}>«{d.comment}»</Caption> : null}
          </View>
        </View>
      </Card>

      <Card style={{ marginTop: 14 }}>
        <Eyebrow style={{ marginBottom: 6 }}>Замовлення</Eyebrow>
        {o.items.map((i) => (
          <View key={i.id} style={styles.item}>
            <DishImage uri={i.imageUrl} category={i.category.slug} size={46} radius={14} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.semibold, color: colors.text }}>
                {i.quantity} × {i.name}
              </Text>
              {['PREPARING', 'CONFIRMED'].includes(o.status) ? <Caption>{i.status === 'READY' ? '✓ готово' : i.status === 'COOKING' ? '● готується' : '○ у черзі'}</Caption> : null}
              {i.notes ? <Caption style={{ fontStyle: 'italic' }}>«{i.notes}»</Caption> : null}
            </View>
            <Text style={{ fontFamily: fonts.semibold, color: colors.textSoft }}>{money(i.lineTotal)}</Text>
          </View>
        ))}
        {o.notes ? <Caption style={{ marginTop: 6 }}>💬 {o.notes}</Caption> : null}
        <Divider />
        <SumRow k="Страви" v={money(o.subtotal)} />
        <SumRow k="Доставка" v={d.fee ? money(d.fee) : 'Безкоштовно'} accent={!d.fee} />
        {tip ? <SumRow k="Чайові курʼєру" v={money(tip)} /> : null}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 6 }}>
          <Body>Разом</Body>
          <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.goldLight }}>{money(o.total + tip)}</Text>
        </View>
        <PaymentLine order={o} />
      </Card>

      <View style={{ gap: 10, marginTop: 16 }}>
        {o.actions.canReview && <Button title="Оцінити доставку" icon={<MessageSquareHeart size={18} color="#141008" />} onPress={() => navigation.navigate('Review', { orderId: o.id })} />}
        {o.hasReview && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
            <Star size={14} color={colors.gold} fill={colors.gold} />
            <Caption>Дякуємо за відгук!</Caption>
          </View>
        )}
        {['DELIVERED', 'CANCELLED'].includes(o.status) && <Button title="Повторити замовлення" variant="outline" icon={<RotateCcw size={18} color={colors.goldLight} />} onPress={repeat} />}
        {o.actions.canCancel && (
          <Button
            title="Скасувати замовлення"
            variant="danger"
            icon={<XCircle size={18} color={colors.danger} />}
            loading={cancel.isPending}
            onPress={() =>
              confirmAction('Скасувати доставку?', o.payment ? 'Кошти повернуться на картку' : 'Кухня ще не почала готувати', 'Скасувати', () => cancel.mutate({ id: o.id }))
            }
          />
        )}
        {['PREPARING', 'READY'].includes(o.status) && <Caption style={{ textAlign: 'center' }}>Кухня вже готує — скасувати замовлення неможливо</Caption>}
      </View>
    </Screen>
  );
}

// ─────────────────────────────── Мої адреси ───────────────────────────────

export function AddressesScreen({ navigation }: ScreenProps<'Addresses'>) {
  const addresses = useAddresses();
  const m = useAddressMutations();
  return (
    <Screen edges={['top']}>
      <Header title="Мої адреси" subtitle="Для швидкої доставки" />
      {addresses.isLoading ? (
        <Skeleton height={200} />
      ) : !addresses.data?.length ? (
        <EmptyState icon={<MapPin size={26} color={colors.gold} />} title="Адрес ще немає" text="Збережіть адресу — і оформлення доставки займе кілька секунд" />
      ) : (
        addresses.data.map((a) => (
          <AddressCard
            key={a.id}
            address={a}
            onPress={() => navigation.navigate('AddressForm', { id: a.id })}
            right={
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {!a.isDefault && (
                  <Pressable accessibilityLabel="Зробити основною" onPress={() => m.update.mutate({ id: a.id, isDefault: true })} style={styles.iconBtn}>
                    <Star size={16} color={colors.gold} />
                  </Pressable>
                )}
                <Pressable accessibilityLabel="Видалити адресу" onPress={() => confirmAction('Видалити адресу?', `${a.label}: ${a.street}, ${a.house}`, 'Видалити', () => m.remove.mutate(a.id))} style={styles.iconBtn}>
                  <Trash size={16} color={colors.danger} />
                </Pressable>
              </View>
            }
          />
        ))
      )}
      <Button title="Додати адресу" style={{ marginTop: 10 }} icon={<Plus size={18} color="#141008" />} onPress={() => navigation.navigate('AddressForm', {})} />
    </Screen>
  );
}

export function AddressFormScreen({ route, navigation }: ScreenProps<'AddressForm'>) {
  const info = useDeliveryInfo();
  const addresses = useAddresses();
  const m = useAddressMutations();
  const existing = addresses.data?.find((a) => a.id === route.params.id) ?? null;
  const [label, setLabel] = useState(existing?.label ?? 'Дім');
  const [zoneId, setZoneId] = useState<number | null>(existing?.zoneId ?? null);
  const [street, setStreet] = useState(existing?.street ?? '');
  const [house, setHouse] = useState(existing?.house ?? '');
  const [apartment, setApartment] = useState(existing?.apartment ?? '');
  const [entrance, setEntrance] = useState(existing?.entrance ?? '');
  const [floor, setFloor] = useState(existing?.floor ?? '');
  const [comment, setComment] = useState(existing?.comment ?? '');
  const [isDefault, setIsDefault] = useState(existing?.isDefault ?? false);
  const [touched, setTouched] = useState(false);
  const valid = zoneId && street.trim().length >= 2 && house.trim() && label.trim();
  const save = () => {
    setTouched(true);
    if (!valid) return;
    const body = {
      label: label.trim(),
      zoneId: zoneId!,
      street: street.trim(),
      house: house.trim(),
      apartment: apartment.trim() || undefined,
      entrance: entrance.trim() || undefined,
      floor: floor.trim() || undefined,
      comment: comment.trim() || undefined,
      isDefault,
    };
    const opts = { onSuccess: () => navigation.goBack() };
    if (existing) m.update.mutate({ id: existing.id, ...body }, opts);
    else m.create.mutate(body, opts);
  };
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <Screen edges={['top']}>
        <Header title={existing ? 'Редагувати адресу' : 'Нова адреса'} />
        <Text style={styles.fieldLabel}>Назва</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {LABELS.map((l) => (
            <Chip key={l} label={l} active={label === l} onPress={() => setLabel(l)} />
          ))}
        </View>
        <Text style={styles.fieldLabel}>Район</Text>
        {info.data ? <ZonePicker zones={info.data.zones} value={zoneId} onChange={setZoneId} /> : <Skeleton height={90} />}
        {touched && !zoneId ? <Text style={styles.err}>Оберіть район</Text> : null}
        <View style={{ height: 14 }} />
        <Field label="Вулиця" value={street} onChangeText={setStreet} placeholder="вул. Мечникова" error={touched && street.trim().length < 2 ? 'Вкажіть вулицю' : null} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Будинок" value={house} onChangeText={setHouse} placeholder="12" error={touched && !house.trim() ? 'Обовʼязково' : null} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Квартира" value={apartment} onChangeText={setApartment} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Підʼїзд" value={entrance} onChangeText={setEntrance} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Поверх" value={floor} onChangeText={setFloor} keyboardType="number-pad" />
          </View>
        </View>
        <Field label="Коментар курʼєру" value={comment} onChangeText={setComment} placeholder="Домофон, орієнтир…" />
        <Pressable
          onPress={() => {
            haptic.tap();
            setIsDefault((v) => !v);
          }}
          style={[styles.toggleAddr, { justifyContent: 'flex-start' }]}
        >
          <Star size={16} color={colors.gold} fill={isDefault ? colors.gold : 'transparent'} />
          <Text style={{ fontFamily: fonts.semibold, color: colors.text }}>Основна адреса</Text>
        </Pressable>
        <Button title="Зберегти" style={{ marginTop: 18 }} loading={m.create.isPending || m.update.isPending} onPress={save} />
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 22, marginBottom: 10 },
  closed: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: 'rgba(251,191,36,0.3)' },
  toggleAddr: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.goldBorder },
  fieldLabel: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.2, color: colors.muted, textTransform: 'uppercase', marginBottom: 8 },
  err: { color: colors.danger, fontSize: 12, marginTop: 6, fontFamily: fonts.medium },
  pay: { flex: 1, padding: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  payIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  notes: { marginTop: 18, minHeight: 72, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.03)', padding: 14, color: colors.text, fontFamily: fonts.medium, textAlignVertical: 'top' },
  checkout: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 16, backgroundColor: 'rgba(12,12,16,0.98)', borderTopWidth: 1, borderTopColor: colors.border, borderTopLeftRadius: 26, borderTopRightRadius: 26 },
  warn: { fontFamily: fonts.semibold, color: colors.warning, fontSize: 12.5, marginTop: 4 },
  hint: { fontFamily: fonts.semibold, color: colors.success, fontSize: 12.5, marginTop: 4 },
  created: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 18, backgroundColor: colors.successSoft, borderWidth: 1, borderColor: 'rgba(52,211,153,0.3)', marginBottom: 14 },
  pin: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.surfaceHigh, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
});
