import { Pressable, StyleSheet, Text, View, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { CalendarDays, ChefHat, ClipboardList, House, LayoutGrid, Receipt, ScanLine, Soup, UserRound, UtensilsCrossed } from 'lucide-react-native';
import { colors, fonts, goldGradient } from '../theme';
import { haptic } from '../lib/notify';

const ICONS = {
  Home: House,
  Menu: UtensilsCrossed,
  Visits: CalendarDays,
  Profile: UserRound,
  Shift: House,
  Floor: LayoutGrid,
  StaffReservations: ClipboardList,
  StaffOrders: Receipt,
  KitchenBoard: ChefHat,
  StopListTab: Soup,
  KitchenProfile: UserRound,
} as const;
const LABELS: Record<keyof typeof ICONS, string> = {
  Home: 'Головна',
  Menu: 'Меню',
  Visits: 'Візити',
  Profile: 'Профіль',
  Shift: 'Зміна',
  Floor: 'Зал',
  StaffReservations: 'Бронювання',
  StaffOrders: 'Замовлення',
  KitchenBoard: 'Кухня',
  StopListTab: 'Стоп-лист',
  KitchenProfile: 'Профіль',
};
/** Центральна кнопка сканера: гість сканує QR столика, офіціант — QR бронювання гостя. */
const SCAN_TARGET = { ScanTab: 'Scan', StaffScanTab: 'StaffScan' } as const;

/** Плаваючий «скляний» таб-бар з центральною кнопкою QR-сканера (спільний для всіх ролей). */
export function TabBar({ state, navigation, badges }: BottomTabBarProps & { badges?: Partial<Record<string, number>> }) {
  const insets = useSafeAreaInsets();
  const root = useNavigation();
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <View style={styles.bar}>
        {Platform.OS === 'ios' ? <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} /> : null}
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          if (route.name in SCAN_TARGET) {
            return (
              <Pressable
                key={route.key}
                accessibilityLabel={route.name === 'ScanTab' ? 'Сканувати QR столика' : 'Сканувати QR гостя'}
                onPress={() => {
                  haptic.light();
                  root.navigate(SCAN_TARGET[route.name as keyof typeof SCAN_TARGET]);
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
              <Text style={[styles.label, { color: focused ? colors.goldLight : colors.faint }]} numberOfLines={1}>
                {LABELS[route.name as keyof typeof LABELS]}
              </Text>
              {badges?.[route.name] ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{badges[route.name]! > 9 ? '9+' : badges[route.name]}</Text>
                </View>
              ) : null}
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
  badge: { position: 'absolute', top: 9, left: '56%', minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#141419' },
  badgeText: { fontFamily: fonts.bold, fontSize: 9.5, color: '#fff' },
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
