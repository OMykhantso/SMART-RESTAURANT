import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, CircleCheck, Flashlight, Keyboard, Minus, Plus, TriangleAlert, X } from 'lucide-react-native';
import { Body, Button, Caption, Title } from '../components/ui';
import { colors, fonts, goldGradient } from '../theme';
import { api } from '../api/client';
import { haptic, notify } from '../lib/notify';
import { ZONE_LABEL } from '../lib/status';
import type { Reservation, TableZone } from '../api/types';
import type { ScreenProps } from '../navigation/types';

type ScanResult =
  | { action: 'CHECKED_IN' | 'ALREADY_CHECKED_IN'; table: { id: number; number: number; seats: number; zone: TableZone }; reservation: Reservation }
  | { action: 'WALK_IN_AVAILABLE' | 'TABLE_UNAVAILABLE'; table: { id: number; number: number; seats: number; zone: TableZone }; walkIn: { available: boolean; reason: string | null; maxDurationMin: number } };

/**
 * Сканування QR-коду на столику (камера пристрою):
 *  - є бронювання на цей столик → автоматичний check-in;
 *  - бронювання немає, але столик вільний → пропозиція сісти без бронювання (walk-in).
 */
export function ScanScreen({ navigation }: ScreenProps<'Scan'>) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guests, setGuests] = useState(2);
  const [lastQr, setLastQr] = useState('');
  const locked = useRef(false);
  const line = useRef(new Animated.Value(0)).current;
  const qc = useQueryClient();

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(line, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [line]);

  const scan = useMutation({
    mutationFn: (qr: string) => api.post<ScanResult>('/reservations/scan-table', { qr }),
    onSuccess: (r) => {
      setResult(r);
      setError(null);
      if (r.action === 'CHECKED_IN') {
        haptic.success();
        notify('Ласкаво просимо! 🍽', `Ви за столиком №${r.table.number}. Смачного!`);
      } else haptic.light();
      qc.invalidateQueries();
    },
    onError: (e) => {
      haptic.error();
      setError((e as Error).message);
      setTimeout(() => (locked.current = false), 2500);
    },
  });

  const walkIn = useMutation({
    mutationFn: () => api.post<Reservation>('/reservations/walk-in', { qr: lastQr, guests }),
    onSuccess: (r) => {
      haptic.success();
      qc.invalidateQueries();
      setResult({ action: 'CHECKED_IN', table: r.table, reservation: r });
    },
    onError: (e) => {
      haptic.error();
      setError((e as Error).message);
    },
  });

  const handle = (data: string) => {
    if (locked.current || scan.isPending) return;
    locked.current = true;
    setLastQr(data);
    scan.mutate(data);
  };

  const scanY = line.interpolate({ inputRange: [0, 1], outputRange: [0, 230] });

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {permission?.granted && !result ? (
        <CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => handle(data)} />
      ) : (
        <LinearGradient colors={['#1a1510', '#08080b']} style={StyleSheet.absoluteFill} />
      )}
      <SafeAreaView style={{ flex: 1 }}>
        <View style={styles.top}>
          <Pressable onPress={() => navigation.goBack()} style={styles.circle} accessibilityLabel="Закрити">
            <X size={22} color={colors.text} />
          </Pressable>
          <Text style={{ fontFamily: fonts.semibold, color: colors.text, fontSize: 16 }}>QR-код столика</Text>
          <Pressable onPress={() => setTorch((t) => !t)} style={[styles.circle, torch && { backgroundColor: colors.gold }]} accessibilityLabel="Ліхтарик">
            <Flashlight size={20} color={torch ? '#141008' : colors.text} />
          </Pressable>
        </View>

        {result ? (
          <ResultCard
            result={result}
            guests={guests}
            setGuests={setGuests}
            error={error}
            loading={walkIn.isPending}
            onWalkIn={() => walkIn.mutate()}
            onMenu={() => {
              navigation.goBack();
              navigation.navigate('Tabs', { screen: 'Menu' });
            }}
            onRetry={() => {
              setResult(null);
              setError(null);
              locked.current = false;
            }}
          />
        ) : !permission?.granted ? (
          <View style={styles.center}>
            <View style={styles.permIcon}>
              <Camera size={34} color={colors.gold} />
            </View>
            <Title style={{ textAlign: 'center', fontSize: 26, marginTop: 18 }}>Доступ до камери</Title>
            <Body style={{ textAlign: 'center', marginTop: 8 }}>Потрібен, щоб відсканувати QR-код на вашому столику для check-in і замовлення.</Body>
            <Button title="Дозволити камеру" style={{ alignSelf: 'stretch', marginTop: 24 }} onPress={requestPermission} />
            <Button title="Ввести код вручну" variant="glass" style={{ alignSelf: 'stretch', marginTop: 10 }} icon={<Keyboard size={18} color={colors.text} />} onPress={() => setManual(true)} />
          </View>
        ) : (
          <View style={styles.center}>
            <View style={styles.frame}>
              {['tl', 'tr', 'bl', 'br'].map((c) => (
                <View key={c} style={[styles.corner, c.includes('t') ? { top: 0, borderTopWidth: 4 } : { bottom: 0, borderBottomWidth: 4 }, c.includes('l') ? { left: 0, borderLeftWidth: 4 } : { right: 0, borderRightWidth: 4 }]} />
              ))}
              <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanY }] }]} />
            </View>
            <Text style={styles.hint}>{scan.isPending ? 'Перевіряємо…' : 'Наведіть камеру на QR-код на столику'}</Text>
            {error && (
              <View style={styles.errorBox}>
                <TriangleAlert size={18} color={colors.warning} />
                <Text style={{ flex: 1, fontFamily: fonts.medium, color: colors.text }}>{error}</Text>
              </View>
            )}
          </View>
        )}

        {!result && (
          <View style={{ padding: 20 }}>
            {manual ? (
              <View style={styles.manual}>
                <TextInput value={code} onChangeText={setCode} placeholder="smartrest://table/…" placeholderTextColor={colors.faint} autoCapitalize="none" style={styles.manualInput} />
                <Button title="OK" size="md" disabled={!code} loading={scan.isPending} onPress={() => handle(code.trim())} />
              </View>
            ) : (
              permission?.granted && (
                <Pressable onPress={() => setManual(true)} style={styles.manualLink}>
                  <Keyboard size={16} color={colors.textSoft} />
                  <Text style={{ fontFamily: fonts.medium, color: colors.textSoft }}>Ввести код вручну</Text>
                </Pressable>
              )
            )}
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

function ResultCard({
  result,
  guests,
  setGuests,
  error,
  loading,
  onWalkIn,
  onMenu,
  onRetry,
}: {
  result: ScanResult;
  guests: number;
  setGuests: (n: number) => void;
  error: string | null;
  loading: boolean;
  onWalkIn: () => void;
  onMenu: () => void;
  onRetry: () => void;
}) {
  const t = result.table;
  if (!('walkIn' in result)) {
    return (
      <View style={styles.center}>
        <LinearGradient colors={goldGradient} style={styles.okCircle}>
          <CircleCheck size={48} color="#141008" />
        </LinearGradient>
        <Title style={{ textAlign: 'center', marginTop: 22, fontSize: 32 }}>Ласкаво просимо!</Title>
        <Body style={{ textAlign: 'center', marginTop: 6 }}>
          Ви за столиком №{t.number} · {ZONE_LABEL[t.zone]}
        </Body>
        <Caption style={{ textAlign: 'center', marginTop: 4 }}>Візит до {result.reservation.endTime} · {result.reservation.code}</Caption>
        <Button title="Відкрити меню й замовити" style={{ alignSelf: 'stretch', marginTop: 28 }} onPress={onMenu} />
      </View>
    );
  }
  const walk = result.walkIn;
  return (
    <View style={styles.center}>
      <View style={styles.tableBadge}>
        <Text style={{ fontFamily: fonts.display, fontSize: 40, color: colors.goldLight }}>№{t.number}</Text>
        <Caption>
          {ZONE_LABEL[t.zone]} · {t.seats} місць
        </Caption>
      </View>
      {walk.available ? (
        <>
          <Title style={{ textAlign: 'center', marginTop: 22, fontSize: 26 }}>Столик вільний</Title>
          <Body style={{ textAlign: 'center', marginTop: 6 }}>{walk.reason ?? 'Сідайте — ми одразу відкриємо для вас меню.'}</Body>
          <View style={styles.guests}>
            <Pressable onPress={() => setGuests(Math.max(1, guests - 1))} style={styles.circle} accessibilityLabel="Менше гостей">
              <Minus size={18} color={colors.text} />
            </Pressable>
            <View style={{ alignItems: 'center', width: 90 }}>
              <Text style={{ fontFamily: fonts.display, fontSize: 36, color: colors.text }}>{guests}</Text>
              <Caption>гостей</Caption>
            </View>
            <Pressable onPress={() => setGuests(Math.min(t.seats, guests + 1))} style={styles.circle} accessibilityLabel="Більше гостей">
              <Plus size={18} color={colors.text} />
            </Pressable>
          </View>
          {error && <Text style={{ color: colors.danger, fontFamily: fonts.medium, textAlign: 'center', marginTop: 10 }}>{error}</Text>}
          <Button title="Сісти за цей столик" style={{ alignSelf: 'stretch', marginTop: 20 }} loading={loading} onPress={onWalkIn} />
        </>
      ) : (
        <>
          <Title style={{ textAlign: 'center', marginTop: 22, fontSize: 26 }}>Столик недоступний</Title>
          <Body style={{ textAlign: 'center', marginTop: 6 }}>{walk.reason}</Body>
        </>
      )}
      <Button title="Сканувати інший" variant="glass" style={{ alignSelf: 'stretch', marginTop: 10 }} onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  circle: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(20,20,25,0.7)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  frame: { width: 250, height: 250 },
  corner: { position: 'absolute', width: 44, height: 44, borderColor: colors.gold, borderRadius: 8 },
  scanLine: { position: 'absolute', left: 12, right: 12, top: 10, height: 2, backgroundColor: colors.gold, shadowColor: colors.gold, shadowOpacity: 1, shadowRadius: 10, elevation: 6 },
  hint: { marginTop: 28, fontFamily: fonts.semibold, color: colors.text, fontSize: 15, textAlign: 'center', backgroundColor: 'rgba(8,8,11,0.6)', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, overflow: 'hidden' },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, padding: 14, borderRadius: 16, backgroundColor: 'rgba(20,20,25,0.92)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)' },
  permIcon: { width: 80, height: 80, borderRadius: 26, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  manual: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  manualInput: { flex: 1, height: 46, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(20,20,25,0.9)', paddingHorizontal: 14, color: colors.text, fontFamily: fonts.medium },
  manualLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 99, backgroundColor: 'rgba(20,20,25,0.7)', alignSelf: 'center' },
  okCircle: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  tableBadge: { alignItems: 'center', paddingHorizontal: 28, paddingVertical: 16, borderRadius: 26, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.goldBorder },
  guests: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 22 },
});
