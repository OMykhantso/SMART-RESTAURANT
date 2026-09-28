import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BellRing, CreditCard, QrCode, Sparkles } from 'lucide-react-native';
import { Body, Button, Caption, Field, Header, Title } from '../components/ui';
import { colors, fonts } from '../theme';
import { useAuth } from '../lib/auth';
import { haptic } from '../lib/notify';
import { ApiError } from '../api/client';
import type { ScreenProps } from '../navigation/types';

const HERO = 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=1200&q=80';

function Logo({ size = 64 }: { size?: number }) {
  return (
    <LinearGradient colors={['#1a1812', '#0d0d11']} style={{ width: size, height: size, borderRadius: size * 0.3, borderWidth: 1, borderColor: 'rgba(220,171,74,0.4)', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: size * 0.48 }}>🍽️</Text>
    </LinearGradient>
  );
}

export function WelcomeScreen({ navigation }: ScreenProps<'Welcome'>) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Image source={{ uri: HERO }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient colors={['rgba(8,8,11,0.35)', 'rgba(8,8,11,0.8)', '#08080b']} locations={[0, 0.45, 0.75]} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(200,147,58,0.25)', 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0.3, y: 0.5 }} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1, padding: 24, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <Logo size={48} />
          <View>
            <Text style={{ fontFamily: fonts.display, fontSize: 20, color: colors.text }}>Smart Restaurant</Text>
            <Text style={{ fontFamily: fonts.bold, fontSize: 9.5, letterSpacing: 3, color: colors.gold }}>KYIV · SINCE 2026</Text>
          </View>
        </View>
        <View>
          <Title style={{ fontSize: 44, lineHeight: 50 }}>
            Смак, що{'\n'}
            <Text style={{ fontFamily: fonts.displayItalic, color: colors.goldLight }}>передбачає</Text>
            {'\n'}ваші бажання
          </Title>
          <Body style={{ marginTop: 16, fontSize: 16, lineHeight: 24 }}>Бронюйте столик, скануйте QR на столі, замовляйте та оплачуйте — усе в одному застосунку.</Body>
          <View style={{ marginTop: 24, gap: 12 }}>
            {[
              [<Sparkles key="a" size={18} color={colors.gold} />, 'Розумний підбір столика'],
              [<QrCode key="b" size={18} color={colors.gold} />, 'Check-in за QR-кодом на столі'],
              [<BellRing key="c" size={18} color={colors.gold} />, 'Статус страв у реальному часі'],
              [<CreditCard key="d" size={18} color={colors.gold} />, 'Оплата без очікування рахунку'],
            ].map(([icon, text], i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
                <Text style={{ fontFamily: fonts.medium, fontSize: 15, color: colors.textSoft }}>{text as string}</Text>
              </View>
            ))}
          </View>
          <View style={{ marginTop: 32, gap: 10 }}>
            <Button title="Створити акаунт" onPress={() => navigation.navigate('Register')} />
            <Button title="У мене вже є акаунт" variant="glass" onPress={() => navigation.navigate('Login')} />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const DEMO = [
  { label: 'Гість', email: 'client@smartrest.ua', password: 'Client123!' },
  { label: 'Офіціант', email: 'staff@smartrest.ua', password: 'Staff123!' },
  { label: 'Кухар', email: 'kitchen@smartrest.ua', password: 'Kitchen123!' },
  { label: 'Адмін', email: 'admin@smartrest.ua', password: 'Admin123!' },
];

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e = email, p = password) => {
    setError(null);
    setLoading(true);
    try {
      await login(e.trim(), p);
      haptic.success();
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : 'Помилка входу');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="З поверненням" subtitle="Увійдіть, щоб бронювати й замовляти">
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" />
      <Field label="Пароль" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" placeholder="••••••••" onSubmitEditing={() => submit()} />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button title="Увійти" loading={loading} onPress={() => submit()} />
      <View style={styles.demo}>
        <Caption style={{ textAlign: 'center' }}>Демо-доступ для захисту</Caption>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {DEMO.map((d) => (
            <Button
              key={d.email}
              title={d.label}
              variant="outline"
              size="sm"
              style={{ flexGrow: 1, flexBasis: '46%' }}
              onPress={() => {
                setEmail(d.email);
                setPassword(d.password);
                submit(d.email, d.password);
              }}
            />
          ))}
        </View>
      </View>
    </AuthLayout>
  );
}

export function RegisterScreen() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setErrors({});
    setGeneral(null);
    setLoading(true);
    try {
      await register({ ...form, email: form.email.trim(), phone: form.phone || undefined });
      haptic.success();
    } catch (err) {
      haptic.error();
      if (err instanceof ApiError && err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
        setErrors(Object.fromEntries((err.details as { field: string; message: string }[]).map((d) => [d.field, d.message])));
      } else if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') setErrors({ email: err.message });
      else setGeneral(err instanceof Error ? err.message : 'Помилка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Новий акаунт" subtitle="Один акаунт для застосунку та сайту">
      <Field label="Імʼя" value={form.name} onChangeText={set('name')} error={errors.name} placeholder="Олександр" autoComplete="name" />
      <Field label="Email" value={form.email} onChangeText={set('email')} error={errors.email} autoCapitalize="none" keyboardType="email-address" placeholder="you@example.com" />
      <Field label="Телефон" value={form.phone} onChangeText={set('phone')} error={errors.phone} keyboardType="phone-pad" placeholder="+380 50 123 45 67" />
      <Field label="Пароль" value={form.password} onChangeText={set('password')} error={errors.password} secureTextEntry placeholder="Мінімум 8 символів, літера і цифра" />
      {general && <Text style={styles.error}>{general}</Text>}
      <Button title="Зареєструватися" loading={loading} onPress={submit} />
    </AuthLayout>
  );
}

function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient colors={['rgba(200,147,58,0.2)', 'transparent']} start={{ x: 1, y: 0 }} end={{ x: 0.2, y: 0.5 }} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <Header title="" />
            <Logo />
            <Title style={{ marginTop: 20 }}>{title}</Title>
            <Body style={{ marginTop: 6, marginBottom: 28 }}>{subtitle}</Body>
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  error: { color: colors.danger, fontFamily: fonts.medium, marginBottom: 14, backgroundColor: colors.dangerSoft, padding: 12, borderRadius: 12, overflow: 'hidden' },
  demo: { marginTop: 28, padding: 16, borderRadius: 20, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
});
