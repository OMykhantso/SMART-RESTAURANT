import { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, Clock, Flame, Leaf, QrCode, Scale, Search, ShoppingBag, Sparkles, Star, Trash, UtensilsCrossed, X, Zap } from 'lucide-react-native';
import { Body, Button, Caption, Chip, DishImage, EmptyState, Eyebrow, Header, IconButton, Screen, Skeleton, Title } from '../components/ui';
import { AddButton, DishTile, QtyStepper, SectionTitle } from '../components/domain';
import { colors, fonts, goldGradient, radius } from '../theme';
import { api } from '../api/client';
import { useCart } from '../lib/cart';
import { useCategories, useCurrentVisit, useDishes, useRecommendations } from '../lib/queries';
import { useDeliveryInfo } from '../lib/delivery';
import { haptic } from '../lib/notify';
import { useToast } from '../lib/toast';
import { money } from '../lib/format';
import type { Dish, Order } from '../api/types';
import type { ScreenProps } from '../navigation/types';

export function CartBar() {
  const cart = useCart();
  const nav = useNavigation();
  if (cart.count === 0) return null;
  return (
    <View pointerEvents="box-none" style={styles.cartBarWrap}>
      <Pressable
        onPress={() => {
          haptic.light();
          nav.navigate('Cart');
        }}
      >
        <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cartBar}>
          <View style={styles.cartCount}>
            <Text style={{ fontFamily: fonts.bold, color: colors.goldLight, fontSize: 13 }}>{cart.count}</Text>
          </View>
          <Text style={{ flex: 1, fontFamily: fonts.bold, fontSize: 15, color: '#141008' }}>Переглянути кошик</Text>
          <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: '#141008' }}>{money(cart.total)}</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

export function MenuScreen() {
  const nav = useNavigation();
  const { width } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState<string | null>(null);
  const [veg, setVeg] = useState(false);
  const categories = useCategories();
  const visit = useCurrentVisit();
  const delivery = useDeliveryInfo();
  const dishes = useDishes({ category: cat ?? undefined, search: search || undefined, vegetarian: veg || undefined, sort: cat ? 'menu' : 'popular' });
  const tileW = (Math.min(width, 560) - 20 * 2 - 12) / 2;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <FlatList
          data={dishes.data ?? []}
          keyExtractor={(d) => String(d.id)}
          numColumns={2}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 20 }}
          contentContainerStyle={{ gap: 12, paddingBottom: 170 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <View style={{ paddingHorizontal: 20, paddingTop: 12 }}>
              <Eyebrow>Сезон осінь 2026</Eyebrow>
              <Title style={{ marginTop: 6 }}>Меню</Title>
              {visit.data?.active ? (
                <View style={styles.seated}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success }} />
                  <Text style={{ fontFamily: fonts.semibold, color: colors.success, fontSize: 13 }}>Столик №{visit.data.active.table.number} — замовлення йде прямо на кухню</Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                  <View style={[styles.hint, { flex: 1.25, marginTop: 0 }]}>
                    <Bike size={16} color={colors.gold} />
                    <Text style={{ flex: 1, fontFamily: fonts.medium, color: colors.textSoft, fontSize: 12.5 }} numberOfLines={2}>
                      Доставка додому{delivery.data?.fromPrice != null ? ` від ${money(delivery.data.fromPrice)}` : ''} · ~{delivery.data ? delivery.data.kitchenEtaMin + 15 : 45} хв
                    </Text>
                  </View>
                  <Pressable onPress={() => nav.navigate('Scan')} style={[styles.hint, { flex: 1, marginTop: 0, backgroundColor: 'rgba(255,255,255,0.04)' }]}>
                    <QrCode size={16} color={colors.gold} />
                    <Text style={{ flex: 1, fontFamily: fonts.medium, color: colors.textSoft, fontSize: 12.5 }} numberOfLines={2}>
                      Я в ресторані
                    </Text>
                  </Pressable>
                </View>
              )}
              <View style={styles.search}>
                <Search size={18} color={colors.faint} />
                <TextInput value={search} onChangeText={setSearch} placeholder="Пошук страви" placeholderTextColor={colors.faint} style={styles.searchInput} />
                {search ? (
                  <Pressable onPress={() => setSearch('')} accessibilityLabel="Очистити">
                    <X size={18} color={colors.muted} />
                  </Pressable>
                ) : null}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, marginTop: 14 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
                <Chip label="⭐ Популярне" active={cat === null} onPress={() => setCat(null)} />
                <Chip label="🌱 Veg" active={veg} onPress={() => setVeg((v) => !v)} />
                {categories.data?.map((c) => <Chip key={c.id} label={`${c.emoji ?? ''} ${c.name}`} active={cat === c.slug} onPress={() => setCat(c.slug)} />)}
              </ScrollView>
              <View style={{ height: 16 }} />
              {dishes.isLoading && (
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <Skeleton height={260} style={{ flex: 1 }} />
                  <Skeleton height={260} style={{ flex: 1 }} />
                </View>
              )}
              {!dishes.isLoading && dishes.data?.length === 0 && <EmptyState icon={<Search size={26} color={colors.gold} />} title="Нічого не знайдено" text="Спробуйте інший запит" />}
            </View>
          }
          renderItem={({ item }) => <DishTile dish={item} width={tileW} onPress={() => nav.navigate('Dish', { id: item.id })} />}
        />
        <CartBar />
      </SafeAreaView>
    </View>
  );
}

export function DishScreen({ route, navigation }: ScreenProps<'Dish'>) {
  const cart = useCart();
  const insets = useSafeAreaInsets();
  const { data: dish } = useQuery({ queryKey: ['dish', route.params.id], queryFn: () => api.get<Dish>(`/dishes/${route.params.id}`) });
  const recs = useRecommendations([route.params.id], 4);
  const qty = dish ? cart.qtyOf(dish.id) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} showsVerticalScrollIndicator={false}>
        {dish ? (
          <>
            <View>
              <DishImage uri={dish.imageUrl} category={dish.category?.slug} style={{ width: '100%', aspectRatio: 1.05 }} radius={0} />
              <LinearGradient colors={['transparent', colors.bg]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 }} />
              <IconButton label="Закрити" onPress={() => navigation.goBack()} style={{ position: 'absolute', top: insets.top + 8, right: 16, backgroundColor: 'rgba(8,8,11,0.6)' }}>
                <X size={20} color={colors.text} />
              </IconButton>
            </View>
            <View style={{ paddingHorizontal: 20, marginTop: -30 }}>
              <Eyebrow>
                {dish.category?.emoji} {dish.category?.name}
              </Eyebrow>
              <Title style={{ marginTop: 8 }}>{dish.name}</Title>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 24, color: colors.goldLight }}>{money(dish.price)}</Text>
                {dish.avgRating !== null && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Star size={16} color={colors.gold} fill={colors.gold} />
                    <Text style={{ fontFamily: fonts.semibold, color: colors.text }}>{dish.avgRating.toFixed(1)}</Text>
                    <Caption>· {dish.reviewsCount} оцінок</Caption>
                  </View>
                )}
              </View>
              <Body style={{ marginTop: 14 }}>{dish.description}</Body>
              <View style={styles.facts}>
                {dish.weightGrams ? <Fact icon={<Scale size={16} color={colors.gold} />} label="Вага" value={`${dish.weightGrams} г`} /> : null}
                {dish.calories ? <Fact icon={<Zap size={16} color={colors.gold} />} label="Ккал" value={String(dish.calories)} /> : null}
                <Fact icon={<Clock size={16} color={colors.gold} />} label="Готується" value={`${dish.prepTimeMin} хв`} />
                {dish.isVegetarian ? <Fact icon={<Leaf size={16} color={colors.success} />} label="Меню" value="Veg" /> : dish.isSpicy ? <Fact icon={<Flame size={16} color={colors.danger} />} label="Смак" value="Гостре" /> : null}
              </View>
              {dish.allergens.length > 0 && <Caption style={{ marginTop: 14 }}>Алергени: {dish.allergens.join(', ')}</Caption>}

              {recs.data && recs.data.length > 0 && (
                <>
                  <SectionTitle title="До цієї страви пасує" />
                  {recs.data.map((r) => (
                    <Pressable key={r.dish.id} onPress={() => navigation.push('Dish', { id: r.dish.id })} style={styles.recRow}>
                      <DishImage uri={r.dish.imageUrl} category={r.dish.category?.slug} size={56} radius={16} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontFamily: fonts.semibold, color: colors.text }}>{r.dish.name}</Text>
                        <Text style={{ fontFamily: fonts.semibold, fontSize: 11.5, color: colors.gold, marginTop: 2 }}>✦ {r.reasons[0] ?? 'Рекомендуємо'}</Text>
                      </View>
                      <AddButton disabled={!r.dish.isAvailable} onPress={() => cart.add(r.dish)} />
                    </Pressable>
                  ))}
                </>
              )}

              {dish.reviews && dish.reviews.length > 0 && (
                <>
                  <SectionTitle title="Оцінки гостей" />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                    {dish.reviews.map((r) => (
                      <View key={r.id} style={styles.review}>
                        <View style={{ flexDirection: 'row', gap: 2 }}>
                          {[1, 2, 3, 4, 5].map((i) => (
                            <Star key={i} size={12} color={colors.gold} fill={i <= r.rating ? colors.gold : 'transparent'} />
                          ))}
                        </View>
                        <Text style={{ fontFamily: fonts.semibold, color: colors.text, marginTop: 6 }}>{r.author}</Text>
                      </View>
                    ))}
                  </ScrollView>
                </>
              )}
            </View>
          </>
        ) : (
          <View style={{ padding: 20, paddingTop: insets.top + 20 }}>
            <Skeleton height={320} />
            <Skeleton height={30} style={{ marginTop: 20, width: '60%' }} />
          </View>
        )}
      </ScrollView>
      {dish && (
        <View style={[styles.dishBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {qty > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <QtyStepper value={qty} onChange={(v) => cart.setQty(dish.id, v)} />
              <Button title={`До кошика · ${money(cart.total)}`} style={{ flex: 1 }} onPress={() => navigation.navigate('Cart')} />
            </View>
          ) : (
            <Button
              title={dish.isAvailable ? `Додати · ${money(dish.price)}` : 'Тимчасово недоступно'}
              disabled={!dish.isAvailable}
              icon={<ShoppingBag size={18} color="#141008" />}
              onPress={() => {
                haptic.success();
                cart.add(dish);
              }}
            />
          )}
        </View>
      )}
    </View>
  );
}

function Fact({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View style={styles.fact}>
      {icon}
      <Caption style={{ marginTop: 6 }}>{label}</Caption>
      <Text style={{ fontFamily: fonts.semibold, color: colors.text, fontSize: 13 }}>{value}</Text>
    </View>
  );
}

export function CartScreen({ navigation }: ScreenProps<'Cart'>) {
  const cart = useCart();
  const visit = useCurrentVisit();
  const qc = useQueryClient();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState('');
  const ids = useMemo(() => cart.lines.map((l) => l.dishId), [cart.lines]);
  const recs = useRecommendations(ids, 5);
  const active = visit.data?.active;

  const place = useMutation({
    mutationFn: () =>
      api.post<Order>('/orders', {
        reservationId: active?.id,
        notes: notes || undefined,
        items: cart.lines.map((l) => ({ dishId: l.dishId, quantity: l.quantity, notes: l.notes || undefined })),
      }),
    onSuccess: (o) => {
      haptic.success();
      cart.clear();
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['current-visit'] });
      toast({ title: `Замовлення #${o.id} надіслано!`, body: 'Стежте за статусом у реальному часі', tone: 'success' });
      navigation.replace('Order', { id: o.id });
    },
    onError: (e) => {
      haptic.error();
      toast({ title: 'Не вдалося замовити', body: (e as Error).message, tone: 'danger' });
    },
  });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Screen edges={['top']} contentStyle={{ paddingBottom: 200 }}>
          <Header title="Кошик" subtitle={active ? `Столик №${active.table.number} · ${active.code}` : 'Доставка додому або замовлення в ресторані'} />
          {cart.lines.length === 0 ? (
            <EmptyState icon={<UtensilsCrossed size={26} color={colors.gold} />} title="Кошик порожній" text="Додайте страви з меню" action={<Button title="До меню" variant="glass" onPress={() => navigation.navigate('Tabs', { screen: 'Menu' })} />} />
          ) : (
            <>
              {cart.lines.map((l) => (
                <View key={l.dishId} style={styles.line}>
                  <DishImage uri={l.imageUrl} category={l.category} size={64} radius={16} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <Text numberOfLines={2} style={{ flex: 1, fontFamily: fonts.semibold, color: colors.text, fontSize: 15 }}>
                        {l.name}
                      </Text>
                      <Pressable onPress={() => cart.setQty(l.dishId, 0)} accessibilityLabel="Видалити">
                        <Trash size={18} color={colors.faint} />
                      </Pressable>
                    </View>
                    <TextInput value={l.notes ?? ''} onChangeText={(t) => cart.setNotes(l.dishId, t)} placeholder="Побажання (без цибулі…)" placeholderTextColor={colors.faint} style={styles.lineNote} maxLength={255} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <QtyStepper compact value={l.quantity} onChange={(v) => cart.setQty(l.dishId, v)} />
                      <Text style={{ fontFamily: fonts.bold, color: colors.goldLight }}>{money(l.price * l.quantity)}</Text>
                    </View>
                  </View>
                </View>
              ))}

              {recs.data && recs.data.length > 0 && (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 18, marginBottom: 10 }}>
                    <Sparkles size={15} color={colors.gold} />
                    <Eyebrow>Пасує до замовлення</Eyebrow>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}>
                    {recs.data.map((r) => (
                      <Pressable key={r.dish.id} onPress={() => cart.add(r.dish)} disabled={!r.dish.isAvailable} style={styles.upsell}>
                        <DishImage uri={r.dish.imageUrl} category={r.dish.category?.slug} style={{ width: '100%', height: 84 }} radius={14} />
                        <Text numberOfLines={1} style={{ fontFamily: fonts.semibold, color: colors.text, fontSize: 13, marginTop: 8 }}>
                          {r.dish.name}
                        </Text>
                        <Text numberOfLines={1} style={{ fontFamily: fonts.medium, color: colors.gold, fontSize: 10.5, marginTop: 2 }}>
                          {r.reasons[0] ?? 'Рекомендуємо'}
                        </Text>
                        <Text style={{ fontFamily: fonts.bold, color: colors.goldLight, fontSize: 13, marginTop: 6 }}>+ {money(r.dish.price)}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </>
              )}

              <TextInput value={notes} onChangeText={setNotes} placeholder="Коментар до замовлення (алергії, подача…)" placeholderTextColor={colors.faint} style={styles.notes} multiline maxLength={500} />
            </>
          )}
        </Screen>
      </KeyboardAvoidingView>
      {cart.lines.length > 0 && (
        <View style={[styles.checkout, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
            <Caption>{cart.count} позицій</Caption>
            <Text style={{ fontFamily: fonts.display, fontSize: 28, color: colors.goldLight }}>{money(cart.total)}</Text>
          </View>
          {active ? (
            <>
              <Button title="Надіслати на кухню" loading={place.isPending} onPress={() => place.mutate()} />
              <Pressable onPress={() => navigation.navigate('Checkout')} style={styles.altCta}>
                <Bike size={15} color={colors.muted} />
                <Text style={{ fontFamily: fonts.medium, color: colors.muted, fontSize: 13 }}>Або оформити доставку додому</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Button title="Оформити доставку" icon={<Bike size={18} color="#141008" />} onPress={() => navigation.navigate('Checkout')} />
              <Pressable onPress={() => navigation.navigate('Scan')} style={styles.altCta}>
                <QrCode size={15} color={colors.muted} />
                <Text style={{ fontFamily: fonts.medium, color: colors.muted, fontSize: 13 }}>Я в ресторані — скануйте QR столика</Text>
              </Pressable>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cartBarWrap: { position: 'absolute', left: 16, right: 16, bottom: 112 },
  cartBar: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 56, borderRadius: 18, paddingHorizontal: 16, shadowColor: colors.gold, shadowOpacity: 0.5, shadowRadius: 20, elevation: 10 },
  cartCount: { width: 30, height: 30, borderRadius: 10, backgroundColor: '#141008', alignItems: 'center', justifyContent: 'center' },
  seated: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: colors.successSoft },
  hint: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, padding: 12, borderRadius: 14, backgroundColor: colors.goldSoft },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, height: 50, borderRadius: 16, paddingHorizontal: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.medium, fontSize: 15, height: '100%' },
  facts: { flexDirection: 'row', gap: 8, marginTop: 18 },
  fact: { flex: 1, padding: 12, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  recRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 8 },
  review: { width: 140, padding: 12, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  dishBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 14, backgroundColor: 'rgba(8,8,11,0.96)', borderTopWidth: 1, borderTopColor: colors.border },
  line: { flexDirection: 'row', gap: 12, padding: 10, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
  lineNote: { color: colors.muted, fontFamily: fonts.body, fontSize: 12.5, paddingVertical: 6 },
  upsell: { width: 140, padding: 8, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  notes: { marginTop: 18, minHeight: 80, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.03)', padding: 14, color: colors.text, fontFamily: fonts.medium, textAlignVertical: 'top' },
  altCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 12, paddingBottom: 2 },
  checkout: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 16, backgroundColor: 'rgba(12,12,16,0.98)', borderTopWidth: 1, borderTopColor: colors.border, borderTopLeftRadius: 26, borderTopRightRadius: 26 },
});
