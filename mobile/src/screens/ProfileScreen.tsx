import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bike, ChevronLeft, ChevronRight, LogOut, MapPin, Receipt, Server, UserRound, Wifi, WifiOff } from 'lucide-react-native';
import { Badge, Button, Caption, Card, Eyebrow, Field, IconButton, Screen, Title } from '../components/ui';
import { ROLE_LABEL } from '../lib/staff';
import { colors, fonts } from '../theme';
import { api } from '../api/client';
import { apiConfig } from '../config';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import { useMyOrders, useMyReservations } from '../lib/queries';
import { useAddresses, useMyDeliveries } from '../lib/delivery';
import { useToast } from '../lib/toast';
import { moneyShort } from '../lib/format';
import { useNavigation, useRoute } from '@react-navigation/native';

export function ProfileScreen() {
  const { user, logout, reload } = useAuth();
  const { connected } = useRealtime();
  const nav = useNavigation();
  const route = useRoute();
  const toast = useToast();
  const qc = useQueryClient();
  const isClient = user?.role === 'CLIENT';
  const orders = useMyOrders(isClient);
  const reservations = useMyReservations(isClient);
  const deliveries = useMyDeliveries(isClient);
  const addresses = useAddresses(isClient);
  const { deliveryConnected } = useRealtime();
  const [name, setName] = useState(user?.name ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [server, setServer] = useState(apiConfig.baseUrl);
  const [deliveryServer, setDeliveryServer] = useState(apiConfig.deliveryUrl);
  const visits = (reservations.data ?? []).filter((r) => r.status === 'COMPLETED').length;
  const delivered = (deliveries.data ?? []).filter((o) => o.status === 'DELIVERED');
  const spent =
    (orders.data ?? []).filter((o) => o.status === 'PAID').reduce((s, o) => s + o.total, 0) + delivered.reduce((s, o) => s + o.total, 0);

  const save = useMutation({
    mutationFn: () => api.patch('/auth/me', { name, phone: phone || null }),
    onSuccess: async () => {
      await reload();
      toast({ title: 'Профіль оновлено', tone: 'success' });
    },
    onError: (e) => toast({ title: (e as Error).message, tone: 'danger' }),
  });

  return (
    <Screen>
      {route.name === 'StaffProfile' && (
        <View style={{ marginBottom: 14 }}>
          <IconButton label="Назад" onPress={() => nav.goBack()}>
            <ChevronLeft color={colors.text} size={22} />
          </IconButton>
        </View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View style={styles.avatar}>
          <Text style={{ fontFamily: fonts.display, fontSize: 24, color: colors.goldLight }}>
            {user?.name
              .split(' ')
              .map((p) => p[0])
              .slice(0, 2)
              .join('')}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Title style={{ fontSize: 26 }}>{user?.name}</Title>
          <Caption>{user?.email}</Caption>
          {!isClient && user && (
            <View style={{ flexDirection: 'row', marginTop: 6 }}>
              <Badge tone={user.role === 'ADMIN' ? 'gold' : user.role === 'KITCHEN' ? 'orange' : user.role === 'COURIER' ? 'violet' : 'info'}>{ROLE_LABEL[user.role]}</Badge>
            </View>
          )}
        </View>
      </View>

      {isClient && (
      <>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
        <Stat label="Візитів" value={String(visits)} />
        <Stat label="Доставок" value={String(delivered.length)} />
        <Stat label="Витрачено, ₴" value={moneyShort(spent).replace(' ₴', '')} />
      </View>

      <Pressable onPress={() => nav.navigate('Addresses')} style={styles.link}>
        <MapPin size={20} color={colors.gold} />
        <View style={{ flex: 1 }}>
          <Text style={styles.linkText}>Мої адреси</Text>
          <Caption>{addresses.data?.length ? `${addresses.data.length} збережено · основна: ${addresses.data.find((a) => a.isDefault)?.label ?? '—'}` : 'Додайте адресу для швидкої доставки'}</Caption>
        </View>
        <ChevronRight size={18} color={colors.faint} />
      </Pressable>
      <Pressable onPress={() => nav.navigate('Tabs', { screen: 'Visits', params: { tab: 'deliveries' } })} style={styles.link}>
        <Bike size={20} color={colors.gold} />
        <Text style={styles.linkText}>Історія доставок</Text>
        <ChevronRight size={18} color={colors.faint} />
      </Pressable>
      <Pressable onPress={() => nav.navigate('Tabs', { screen: 'Visits', params: { tab: 'orders' } })} style={styles.link}>
        <Receipt size={20} color={colors.gold} />
        <Text style={styles.linkText}>Замовлення в ресторані</Text>
        <ChevronRight size={18} color={colors.faint} />
      </Pressable>
      </>
      )}

      <Eyebrow style={{ marginTop: 26, marginBottom: 12 }}>Особисті дані</Eyebrow>
      <Card>
        <Field label="Імʼя" value={name} onChangeText={setName} />
        <Field label="Телефон" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+380…" />
        <Button title="Зберегти" size="md" icon={<UserRound size={18} color="#141008" />} loading={save.isPending} onPress={() => save.mutate()} />
      </Card>

      <Eyebrow style={{ marginTop: 26, marginBottom: 12 }}>Підключення</Eyebrow>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          {connected ? <Wifi size={18} color={colors.success} /> : <WifiOff size={18} color={colors.danger} />}
          <Text style={{ fontFamily: fonts.semibold, color: connected ? colors.success : colors.danger }}>{connected ? 'Real-time зʼєднання активне' : 'Немає real-time зʼєднання'}</Text>
        </View>
        {user?.role !== 'KITCHEN' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: -6, marginBottom: 14 }}>
            <Bike size={18} color={deliveryConnected ? colors.success : colors.danger} />
            <Text style={{ fontFamily: fonts.semibold, color: deliveryConnected ? colors.success : colors.danger }}>
              {deliveryConnected ? 'Сервіс доставки на звʼязку' : 'Сервіс доставки недоступний'}
            </Text>
          </View>
        )}
        <Text style={styles.label}>Адреса сервера (backend)</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Server size={18} color={colors.faint} />
          <TextInput value={server} onChangeText={setServer} autoCapitalize="none" autoCorrect={false} style={styles.input} placeholder="http://192.168.0.10:4000" placeholderTextColor={colors.faint} />
        </View>
        <Caption style={{ marginTop: 8 }}>Типово визначається автоматично: {apiConfig.defaultUrl}</Caption>
        <Text style={[styles.label, { marginTop: 14 }]}>Сервіс доставки (Delivery API)</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <Bike size={18} color={colors.faint} />
          <TextInput value={deliveryServer} onChangeText={setDeliveryServer} autoCapitalize="none" autoCorrect={false} style={styles.input} placeholder="http://192.168.0.10:4100" placeholderTextColor={colors.faint} />
        </View>
        <Caption style={{ marginTop: 8 }}>Окрема система на тій самій базі даних · типово той самий хост, порт 4100</Caption>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
          <Button
            title="Застосувати"
            size="sm"
            variant="outline"
            style={{ flex: 1 }}
            onPress={async () => {
              await apiConfig.set(server.trim() || null);
              await apiConfig.setDelivery(deliveryServer.trim() || null);
              setDeliveryServer(apiConfig.deliveryUrl);
              await qc.invalidateQueries();
              toast({ title: 'Адреси серверів збережено', body: `${apiConfig.baseUrl} · ${apiConfig.deliveryUrl}`, tone: 'success' });
            }}
          />
          <Button
            title="Скинути"
            size="sm"
            variant="glass"
            style={{ flex: 1 }}
            onPress={async () => {
              await apiConfig.set(null);
              await apiConfig.setDelivery(null);
              setServer(apiConfig.baseUrl);
              setDeliveryServer(apiConfig.deliveryUrl);
            }}
          />
        </View>
      </Card>

      <Button title="Вийти з акаунта" variant="danger" style={{ marginTop: 26 }} icon={<LogOut size={18} color={colors.danger} />} onPress={logout} />
      <Caption style={{ textAlign: 'center', marginTop: 16 }}>Smart Restaurant · v1.0.0</Caption>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={{ fontFamily: fonts.bold, fontSize: 18, color: colors.text }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Caption style={{ marginTop: 2 }}>{label}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.goldSoft, borderWidth: 1, borderColor: colors.goldBorder, alignItems: 'center', justifyContent: 'center' },
  stat: { flex: 1, padding: 14, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12, padding: 16, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  linkText: { flex: 1, fontFamily: fonts.semibold, color: colors.text, fontSize: 15 },
  label: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.2, color: colors.muted, textTransform: 'uppercase', marginBottom: 8 },
  input: { flex: 1, height: 46, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.03)', paddingHorizontal: 12, color: colors.text, fontFamily: fonts.medium },
});
