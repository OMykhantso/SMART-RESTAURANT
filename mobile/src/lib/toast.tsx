import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, radius, tones, type Tone } from '../theme';

interface ToastItem {
  id: number;
  title: string;
  body?: string;
  tone: Tone;
}

const Ctx = createContext<(t: Omit<ToastItem, 'id'>) => void>(() => undefined);

/** In-app банер сповіщень (Animated, без сторонніх бібліотек). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ToastItem | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const hide = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setItem(null));
  }, [anim]);

  const show = useCallback(
    (t: Omit<ToastItem, 'id'>) => {
      if (timer.current) clearTimeout(timer.current);
      setItem({ ...t, id: Date.now() });
      anim.setValue(0);
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8, tension: 80 }).start();
      timer.current = setTimeout(hide, 3800);
    },
    [anim, hide],
  );

  const tone = item ? tones[item.tone] : tones.gold;
  return (
    <Ctx.Provider value={show}>
      {children}
      {item && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.wrap,
            { top: insets.top + 8, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }) }] },
          ]}
        >
          <Pressable onPress={hide} style={styles.toast}>
            <View style={[styles.dot, { backgroundColor: tone.fg }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{item.title}</Text>
              {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
            </View>
          </Pressable>
        </Animated.View>
      )}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, zIndex: 1000 },
  toast: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
    backgroundColor: 'rgba(24,24,30,0.97)',
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  title: { color: colors.text, fontFamily: fonts.semibold, fontSize: 15 },
  body: { color: colors.muted, fontFamily: fonts.body, fontSize: 13, marginTop: 2 },
});
