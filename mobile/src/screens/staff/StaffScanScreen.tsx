import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, CircleCheck, Flashlight, Keyboard, TriangleAlert, X } from 'lucide-react-native';
import { Body, Button, Caption, Title } from '../../components/ui';
import { colors, fonts, goldGradient } from '../../theme';
import { api } from '../../api/client';
import { haptic } from '../../lib/notify';
import { guestsLabel } from '../../lib/format';
import { ZONE_LABEL } from '../../lib/status';
import type { Reservation } from '../../api/types';
import type { ScreenProps } from '../../navigation/types';

/**
 * Сканер хостес: QR-код бронювання з телефона гостя (smartrest://reservation/…) або код R-XXXXXX вручну →
 * check-in з перевіркою підпису, статусу та вікна часу на сервері.
 */
export function StaffScanScreen({ navigation }: ScreenProps<'StaffScan'>) {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<Reservation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locked = useRef(false);
  const line = useRef(new Animated.Value(0)).current;
  const qc = useQueryClient();

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(line, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [line]);

  const checkIn = useMutation({
    mutationFn: (input: { qr?: string; code?: string }) => api.post<Reservation>('/reservations/check-in', input),
    onSuccess: (r) => {
      haptic.success();
      setResult(r);
      setError(null);
      qc.invalidateQueries();
    },
    onError: (e) => {
      haptic.error();
      setError((e as Error).message);
      setTimeout(() => (locked.current = false), 2500);
    },
  });

  const handle = (data: string) => {
    if (locked.current || checkIn.isPending) return;
    locked.current = true;
    const v = data.trim();
    checkIn.mutate(/^R-[A-Z0-9]{6}$/i.test(v) ? { code: v.toUpperCase() } : { qr: v });
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
          <Text style={{ fontFamily: fonts.semibold, color: colors.text, fontSize: 16 }}>Check-in гостей</Text>
          <Pressable onPress={() => setTorch((t) => !t)} style={[styles.circle, torch && { backgroundColor: colors.gold }]} accessibilityLabel="Ліхтарик">
            <Flashlight size={20} color={torch ? '#141008' : colors.text} />
          </Pressable>
        </View>

        {result ? (
          <View style={styles.center}>
            <LinearGradient colors={goldGradient} style={styles.okCircle}>
              <CircleCheck size={48} color="#141008" />
            </LinearGradient>
            <Title style={{ textAlign: 'center', marginTop: 22, fontSize: 30 }}>Гостей посаджено</Title>
            <Body style={{ textAlign: 'center', marginTop: 6 }}>
              {result.user?.name ?? result.guestName ?? 'Гість'} · {guestsLabel(result.guests)}
            </Body>
            <View style={styles.tableBadge}>
              <Text style={{ fontFamily: fonts.display, fontSize: 40, color: colors.goldLight }}>№{result.table.number}</Text>
              <Caption>
                {ZONE_LABEL[result.table.zone]} · до {result.endTime}
              </Caption>
            </View>
            <Caption style={{ marginTop: 10, letterSpacing: 2 }}>{result.code}</Caption>
            <Button
              title="Сканувати наступного"
              style={{ alignSelf: 'stretch', marginTop: 26 }}
              onPress={() => {
                setResult(null);
                setCode('');
                locked.current = false;
              }}
            />
            <Button title="Готово" variant="glass" style={{ alignSelf: 'stretch', marginTop: 10 }} onPress={() => navigation.goBack()} />
          </View>
        ) : !permission?.granted ? (
          <View style={styles.center}>
            <View style={styles.permIcon}>
              <Camera size={34} color={colors.gold} />
            </View>
            <Title style={{ textAlign: 'center', fontSize: 26, marginTop: 18 }}>Доступ до камери</Title>
            <Body style={{ textAlign: 'center', marginTop: 8 }}>Скануйте QR-код бронювання з телефона гостя — check-in за секунду.</Body>
            <Button title="Дозволити камеру" style={{ alignSelf: 'stretch', marginTop: 24 }} onPress={requestPermission} />
            <Button title="Ввести код R-XXXXXX" variant="glass" style={{ alignSelf: 'stretch', marginTop: 10 }} icon={<Keyboard size={18} color={colors.text} />} onPress={() => setManual(true)} />
          </View>
        ) : (
          <View style={styles.center}>
            <View style={styles.frame}>
              {['tl', 'tr', 'bl', 'br'].map((c) => (
                <View key={c} style={[styles.corner, c.includes('t') ? { top: 0, borderTopWidth: 4 } : { bottom: 0, borderBottomWidth: 4 }, c.includes('l') ? { left: 0, borderLeftWidth: 4 } : { right: 0, borderRightWidth: 4 }]} />
              ))}
              <Animated.View style={[styles.scanLine, { transform: [{ translateY: scanY }] }]} />
            </View>
            <Text style={styles.hint}>{checkIn.isPending ? 'Перевіряємо…' : 'QR-код бронювання з телефона гостя'}</Text>
          </View>
        )}

        {!result && (
          <View style={{ padding: 20 }}>
            {error && (
              <View style={styles.errorBox}>
                <TriangleAlert size={18} color={colors.warning} />
                <Text style={{ flex: 1, fontFamily: fonts.medium, color: colors.text }}>{error}</Text>
              </View>
            )}
            {manual || !permission?.granted ? (
              manual && (
                <View style={styles.manual}>
                  <TextInput value={code} onChangeText={setCode} placeholder="R-XXXXXX" placeholderTextColor={colors.faint} autoCapitalize="characters" autoCorrect={false} style={styles.manualInput} />
                  <Button
                    title="Check-in"
                    size="md"
                    disabled={!code}
                    loading={checkIn.isPending}
                    onPress={() => {
                      locked.current = false;
                      handle(code);
                    }}
                  />
                </View>
              )
            ) : (
              <Pressable onPress={() => setManual(true)} style={styles.manualLink}>
                <Keyboard size={16} color={colors.textSoft} />
                <Text style={{ fontFamily: fonts.medium, color: colors.textSoft }}>Ввести код бронювання</Text>
              </Pressable>
            )}
          </View>
        )}
      </SafeAreaView>
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
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, padding: 14, borderRadius: 16, backgroundColor: 'rgba(20,20,25,0.92)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.35)' },
  permIcon: { width: 80, height: 80, borderRadius: 26, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  manual: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  manualInput: { flex: 1, height: 46, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(20,20,25,0.9)', paddingHorizontal: 14, color: colors.text, fontFamily: fonts.bold, letterSpacing: 2 },
  manualLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, borderRadius: 99, backgroundColor: 'rgba(20,20,25,0.7)', alignSelf: 'center' },
  okCircle: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center' },
  tableBadge: { alignItems: 'center', marginTop: 20, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 26, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.goldBorder },
});
