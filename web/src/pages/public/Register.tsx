import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { KeyRound, Mail, Phone, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/primitives';
import { useAuth } from '@/lib/auth';
import { toApiError } from '@/lib/api';
import { AuthShell } from './Login';
import { cn } from '@/lib/format';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const strength = [/.{8,}/, /[A-Za-zА-Яа-яІіЇїЄєҐґ]/, /\d/, /[^A-Za-z0-9А-Яа-я]/].filter((r) => r.test(form.password)).length;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setGeneral(null);
    setLoading(true);
    try {
      await register({ ...form, phone: form.phone || undefined });
      navigate(params.get('next') ?? '/account', { replace: true });
    } catch (err) {
      const apiErr = toApiError(err);
      if (apiErr.code === 'VALIDATION_ERROR' && Array.isArray(apiErr.details)) {
        setErrors(Object.fromEntries((apiErr.details as { field: string; message: string }[]).map((d) => [d.field, d.message])));
      } else if (apiErr.code === 'EMAIL_TAKEN') {
        setErrors({ email: apiErr.message });
      } else setGeneral(apiErr.message);
    } finally {
      setLoading(false);
    }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <AuthShell title="Створити акаунт" subtitle="Одна реєстрація — для сайту та мобільного застосунку.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Імʼя" error={errors.name}>
          <Input required value={form.name} onChange={set('name')} placeholder="Олександр" icon={<UserRound className="size-4" />} autoComplete="name" />
        </Field>
        <Field label="Email" error={errors.email}>
          <Input type="email" required value={form.email} onChange={set('email')} placeholder="you@example.com" icon={<Mail className="size-4" />} autoComplete="email" />
        </Field>
        <Field label="Телефон (необовʼязково)" error={errors.phone}>
          <Input type="tel" value={form.phone} onChange={set('phone')} placeholder="+380 50 123 45 67" icon={<Phone className="size-4" />} autoComplete="tel" />
        </Field>
        <Field label="Пароль" error={errors.password} hint="Мінімум 8 символів, літера та цифра">
          <Input type="password" required value={form.password} onChange={set('password')} placeholder="••••••••" icon={<KeyRound className="size-4" />} autoComplete="new-password" />
          <div className="mt-2 flex gap-1">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cn('h-1 flex-1 rounded-full transition-colors', i < strength ? (strength >= 3 ? 'bg-emerald-400' : 'bg-amber-400') : 'bg-white/10')} />
            ))}
          </div>
        </Field>
        {general && <div className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200 ring-1 ring-rose-400/20">{general}</div>}
        <Button type="submit" variant="gold" size="lg" className="w-full" loading={loading}>
          Зареєструватися
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-ink-300">
        Вже маєте акаунт?{' '}
        <Link to="/login" className="text-gold-200 hover:text-gold-100">
          Увійти
        </Link>
      </p>
    </AuthShell>
  );
}
