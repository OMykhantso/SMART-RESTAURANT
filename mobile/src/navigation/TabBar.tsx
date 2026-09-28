import { Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { CalendarDays, House, ScanLine, UserRound, UtensilsCrossed } from 'lucide-react-native';
import { colors, fonts, goldGradient } from '../theme';
import { haptic } from '../lib/notify';

const ICONS = { Home: House, Menu: UtensilsCrossed, Visits: CalendarDays, Profile: UserRound } as const;
const LABELS = { Home: 'Головна', Menu: 'Меню', Visits: 'Візити', Profile: 'Профіль' } as const;

/** Плаваючий «скляний» таб-бар з центральною кнопкою QR-сканера. */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const root = useNavigation();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.bar}>
        {Platform.OS === 'ios' ? <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} /> : null}
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          if (route.name === 'ScanTab') {
            return (
              <Pressable
                key={route.key}
                accessibilityLabel="Сканувати QR столика"
                onPress={() => {
                  haptic.light();
                  root.navigate('Scan');
                }}
                style={styles.scanWrap}
              >
                <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.scan}>
                  <ScanLine size={26} color="#141008" strokeWidth={2.4} />
                </LinearGradient>
              </Pressable>
            );
          }
          const Icon = ICONS[route.name as keyof typeof ICONS];
          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              onPress={() => {
                haptic.tap();
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={styles.tab}
            >
              <Icon size={22} color={focused ? colors.gold : colors.faint} strokeWidth={focused ? 2.4 : 2} />
              <Text style={[styles.label, { color: focused ? colors.goldLight : colors.faint }]}>{LABELS[route.name as keyof typeof LABELS]}</Text>
              {focused && <View style={styles.dot} />}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 70,
    borderRadius: 26,
    overflow: 'visible',
    backgroundColor: Platform.OS === 'ios' ? 'rgba(20,20,25,0.72)' : 'rgba(20,20,25,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, height: '100%' },
  label: { fontFamily: fonts.semibold, fontSize: 10.5 },
  dot: { position: 'absolute', bottom: 6, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.gold },
  scanWrap: { flex: 1, alignItems: 'center', marginTop: -30 },
  scan: {
    width: 62,
    height: 62,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.bg,
    shadowColor: colors.gold,
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
});
