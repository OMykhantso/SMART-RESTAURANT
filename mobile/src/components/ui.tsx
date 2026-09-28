import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ChevronLeft } from 'lucide-react-native';
import { colors, fonts, goldGradient, radius, tones, type Tone } from '../theme';
import { CATEGORY_EMOJI, CATEGORY_TINT } from '../lib/status';
import { imageUrl } from '../api/client';
import { haptic } from '../lib/notify';

// ─────────────────────────────── Типографіка ───────────────────────────────

export function Title({ style, ...p }: TextProps & { style?: StyleProp<TextStyle> }) {
  return <Text {...p} style={[{ fontFamily: fonts.display, fontSize: 30, color: colors.text, letterSpacing: -0.4 }, style]} />;
}
export function Heading({ style, ...p }: TextProps) {
  return <Text {...p} style={[{ fontFamily: fonts.display, fontSize: 22, color: colors.text }, style]} />;
}
export function Body({ style, ...p }: TextProps) {
  return <Text {...p} style={[{ fontFamily: fonts.body, fontSize: 15, color: colors.textSoft, lineHeight: 22 }, style]} />;
}
export function Caption({ style, ...p }: TextProps) {
  return <Text {...p} style={[{ fontFamily: fonts.medium, fontSize: 12, color: colors.muted }, style]} />;
}
export function Eyebrow({ style, ...p }: TextProps) {
  return <Text {...p} style={[{ fontFamily: fonts.bold, fontSize: 11, color: colors.gold, letterSpacing: 2.4, textTransform: 'uppercase' }, style]} />;
}
export function Strong({ style, ...p }: TextProps) {
  return <Text {...p} style={[{ fontFamily: fonts.semibold, fontSize: 15, color: colors.text }, style]} />;
}

// ─────────────────────────────── Кнопки ───────────────────────────────

type Variant = 'gold' | 'glass' | 'outline' | 'danger' | 'success' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'gold',
  icon,
  loading,
  disabled,
  size = 'lg',
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}) {
  const h = size === 'sm' ? 38 : size === 'md' ? 46 : 54;
  const inactive = disabled || loading;
  const content = (
    <View style={[styles.btnInner, { height: h, paddingHorizontal: size === 'sm' ? 14 : 20 }]}>
      {loading ? <ActivityIndicator color={variant === 'gold' ? colors.bg : colors.gold} /> : icon}
      <Text
        style={{
          fontFamily: fonts.bold,
          fontSize: size === 'sm' ? 13 : 15,
          color: variant === 'gold' ? '#141008' : variant === 'danger' ? colors.danger : variant === 'success' ? colors.success : variant === 'outline' ? colors.goldLight : colors.text,
        }}
      >
        {title}
      </Text>
    </View>
  );
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      disabled={inactive}
      style={({ pressed }) => [{ opacity: inactive ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }, style]}
    >
      {variant === 'gold' ? (
        <LinearGradient colors={goldGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.btn, styles.goldShadow]}>
          {content}
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.btn,
            variant === 'glass' && { backgroundColor: colors.surfaceHigh, borderColor: colors.border, borderWidth: 1 },
            variant === 'outline' && { borderColor: colors.goldBorder, borderWidth: 1 },
            variant === 'danger' && { backgroundColor: colors.dangerSoft, borderColor: 'rgba(251,113,133,0.3)', borderWidth: 1 },
            variant === 'success' && { backgroundColor: colors.successSoft, borderColor: 'rgba(52,211,153,0.3)', borderWidth: 1 },
          ]}
        >
          {content}
        </View>
      )}
    </Pressable>
  );
}

export function IconButton({ children, onPress, style, label }: { children: ReactNode; onPress?: () => void; style?: StyleProp<ViewStyle>; label: string }) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.7 : 1 }, style]}
    >
      {children}
    </Pressable>
  );
}

// ─────────────────────────────── Контейнери ───────────────────────────────

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }, style]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Badge({ tone = 'gold', children }: { tone?: Tone; children: ReactNode }) {
  const t = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <View style={[styles.badgeDot, { backgroundColor: t.fg }]} />
      <Text style={{ color: t.fg, fontFamily: fonts.semibold, fontSize: 12 }}>{children}</Text>
    </View>
  );
}

export function Chip({ active, label, onPress, icon }: { active?: boolean; label: string; onPress?: () => void; icon?: ReactNode }) {
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      style={[styles.chip, active && styles.chipActive]}
    >
      {icon}
      <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: active ? colors.goldLight : colors.textSoft }}>{label}</Text>
    </Pressable>
  );
}

export function Screen({ children, scroll = true, edges = ['top'], contentStyle, refreshControl }: { children: ReactNode; scroll?: boolean; edges?: Edge[]; contentStyle?: StyleProp<ViewStyle>; refreshControl?: React.ReactElement<any> }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={['rgba(200,147,58,0.16)', 'rgba(8,8,11,0)']} style={StyleSheet.absoluteFill} start={{ x: 1, y: 0 }} end={{ x: 0.2, y: 0.45 }} />
      <SafeAreaView edges={edges} style={{ flex: 1 }}>
        {scroll ? (
          <ScrollView contentContainerStyle={[{ padding: 20, paddingBottom: 140 }, contentStyle]} showsVerticalScrollIndicator={false} refreshControl={refreshControl} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
        )}
      </SafeAreaView>
    </View>
  );
}

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const nav = useNavigation();
  return (
    <View style={styles.header}>
      {nav.canGoBack() && (
        <IconButton label="Назад" onPress={() => nav.goBack()}>
          <ChevronLeft color={colors.text} size={22} />
        </IconButton>
      )}
      <View style={{ flex: 1 }}>
        <Heading numberOfLines={1}>{title}</Heading>
        {subtitle ? <Caption>{subtitle}</Caption> : null}
      </View>
      {right}
    </View>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label?: string; error?: string | null }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={styles.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={colors.faint}
        {...props}
        onFocus={(e) => {
          setFocus(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          props.onBlur?.(e);
        }}
        style={[styles.input, focus && { borderColor: colors.goldBorder, backgroundColor: 'rgba(255,255,255,0.06)' }, error ? { borderColor: 'rgba(251,113,133,0.6)' } : null, props.style]}
      />
      {error ? <Text style={{ color: colors.danger, fontSize: 12, marginTop: 6, fontFamily: fonts.medium }}>{error}</Text> : null}
    </View>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>{icon}</View>
      <Heading style={{ fontSize: 20, textAlign: 'center' }}>{title}</Heading>
      {text ? <Body style={{ textAlign: 'center', marginTop: 6, color: colors.muted }}>{text}</Body> : null}
      {action ? <View style={{ marginTop: 18, alignSelf: 'stretch' }}>{action}</View> : null}
    </View>
  );
}

export function Skeleton({ height = 80, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  const a = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(a, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(a, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);
  return <Animated.View style={[{ height, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.06)', opacity: a }, style]} />;
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 14 }} />;
}

// ─────────────────────────────── Фото страви ───────────────────────────────

export function DishImage({ uri, category, size, style, radius: r = radius.lg }: { uri: string | null | undefined; category?: string; size?: number; style?: StyleProp<ViewStyle>; radius?: number }) {
  const [failed, setFailed] = useState(false);
  const tint = CATEGORY_TINT[category ?? ''] ?? ['#6a4a18', '#1a1206'];
  const src = imageUrl(uri);
  return (
    <View style={[{ overflow: 'hidden', borderRadius: r, backgroundColor: colors.surfaceHigh }, size ? { width: size, height: size } : null, style]}>
      <LinearGradient colors={tint} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontSize: size ? Math.max(14, size * 0.42) : 44 }}>{CATEGORY_EMOJI[category ?? ''] ?? '🍽️'}</Text>
      </View>
      {src && !failed ? (
        <Image source={{ uri: src }} style={StyleSheet.absoluteFill} contentFit="cover" transition={400} onError={() => setFailed(true)} cachePolicy="memory-disk" />
      ) : null}
    </View>
  );
}

export function PressableScale({ children, style, ...rest }: PressableProps & { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <Pressable {...rest} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.97 : 1 }], opacity: pressed ? 0.9 : 1 }, style]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { borderRadius: radius.md, overflow: 'hidden' },
  btnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  goldShadow: { shadowColor: colors.gold, shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  iconBtn: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceHigh, borderWidth: 1, borderColor: colors.border },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: 18 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  badgeDot: { width: 6, height: 6, borderRadius: 3 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 38, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.03)' },
  chipActive: { borderColor: colors.goldBorder, backgroundColor: colors.goldSoft },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  fieldLabel: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.2, color: colors.muted, textTransform: 'uppercase', marginBottom: 8 },
  input: { height: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: 'rgba(255,255,255,0.035)', paddingHorizontal: 16, color: colors.text, fontFamily: fonts.medium, fontSize: 16 },
  empty: { alignItems: 'center', paddingVertical: 36, paddingHorizontal: 20, borderRadius: radius.xl, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong },
  emptyIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.goldSoft, marginBottom: 14 },
});
