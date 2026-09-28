import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { motion } from 'motion/react';
import { ChefHat, Crown, KeyRound, LayoutDashboard, Mail, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, Field, Input } from '@/components/ui/primitives';
import { homeFor, useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';

const DEMO = [
  { email: 'client@smartrest.ua', password: 'Client123!', label: 'Клієнт', icon: <UserRound className="size-4" /> },
  { email: 'staff@smartrest.ua', password: 'Staff123!', label: 'Офіціант', icon: <LayoutDashboard className="size-4" /> },
  { email: 'kitchen@smartrest.ua', password: 'Kitchen123!', label: 'Кухня', icon: <ChefHat className="size-4" /> },
  { email: 'admin@smartrest.ua', password: 'Admin123!', label: 'Адмін', icon: <Crown className="size-4" /> },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const doLogin = async (e?: FormEvent, creds?: { email: string; password: string }) => {
    e?.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(creds?.email ?? email, creds?.password ?? password);
      const next = params.get('next');
      navigate(next && (user.role === 'CLIENT' || !next.startsWith('/account')) ? next : homeFor(user.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="З поверненням" subtitle="Увійдіть, щоб бронювати, замовляти та оплачувати в один дотик.">
      <form onSubmit={doLogin} className="space-y-4">
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" icon={<Mail className="size-4" />} />
        </Field>
        <Field label="Пароль">
          <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" icon={<KeyRound className="size-4" />} />
        </Field>
        {error && <div className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200 ring-1 ring-rose-400/20">{error}</div>}
        <Button type="submit" variant="gold" size="lg" className="w-full" loading={loading}>
          Увійти
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-300">
        Ще немає акаунта?{' '}
        <Link to={`/register${params.get('next') ? `?next=${params.get('next')}` : ''}`} className="text-gold-200 hover:text-gold-100">
          Зареєструватися
        </Link>
      </p>
      <div className="mt-8">
        <div className="mb-3 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-ink-500">
          <span className="hairline flex-1" /> Демо-доступ <span className="hairline flex-1" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {DEMO.map((d) => (
            <button
              key={d.email}
              type="button"
              disabled={loading}
              onClick={() => doLogin(undefined, d)}
              className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 text-left text-sm text-ink-200 transition hover:border-gold-400/30 hover:text-cream"
            >
              <span className="text-gold-300">{d.icon}</span>
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </AuthShell>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto grid min-h-dvh max-w-6xl items-center gap-12 px-4 pb-16 pt-28 lg:grid-cols-2">
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="hidden lg:block">
        <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-gold-300">Smart Restaurant</div>
        <h1 className="mt-4 font-display text-6xl leading-[1.05] tracking-tight text-cream">
          Вечір, який <span className="text-gold italic">організовує</span> себе сам
        </h1>
        <ul className="mt-10 space-y-4 text-ink-200">
          {['Бронювання з розумним підбором столика', 'Check-in одним скануванням QR', 'Статус страв у реальному часі', 'Оплата без очікування рахунку'].map((t, i) => (
            <motion.li key={t} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 + i * 0.08 }} className="flex items-center gap-3">
              <span className="gold-gradient size-1.5 rounded-full" /> {t}
            </motion.li>
          ))}
        </ul>
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="mx-auto w-full max-w-md p-8">
          <h2 className="font-display text-3xl text-cream">{title}</h2>
          <p className="mb-8 mt-2 text-sm text-ink-300">{subtitle}</p>
          {children}
        </Card>
      </motion.div>
    </div>
  );
}
