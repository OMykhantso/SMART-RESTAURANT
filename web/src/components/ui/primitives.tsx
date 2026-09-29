import { forwardRef, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { cn, initials } from '@/lib/format';
import { TONE_CLASSES } from '@/lib/constants';

export function Card({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('glass rounded-3xl shadow-[var(--shadow-card)]', className)} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, subtitle, action, className }: { eyebrow?: string; title: ReactNode; subtitle?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div>
        {eyebrow && <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-gold-300/90">{eyebrow}</div>}
        <h2 className="font-display text-3xl font-medium tracking-tight text-cream md:text-4xl">{title}</h2>
        {subtitle && <p className="mt-2 max-w-2xl text-ink-300">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Badge({ tone = 'zinc', children, dot = true, pulse, className }: { tone?: keyof typeof TONE_CLASSES; children: ReactNode; dot?: boolean; pulse?: boolean; className?: string }) {
  const t = TONE_CLASSES[tone];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset', t.badge, className)}>
      {dot && (
        <span className="relative flex size-1.5">
          {pulse && <span className={cn('absolute inline-flex size-full animate-ping rounded-full opacity-70', t.dot)} />}
          <span className={cn('relative inline-flex size-1.5 rounded-full', t.dot)} />
        </span>
      )}
      {children}
    </span>
  );
}

export function Chip({ active, children, onClick, className, icon }: { active?: boolean; children: ReactNode; onClick?: () => void; className?: string; icon?: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition-all',
        active
          ? 'border-gold-300/60 bg-gold-400/15 text-gold-100 shadow-[0_0_20px_-6px_rgb(220_171_74/0.6)]'
          : 'border-white/8 bg-white/[0.03] text-ink-200 hover:border-white/20 hover:text-cream',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function Field({ label, error, hint, children, className }: { label?: string; error?: string | null; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      {label && <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-ink-300">{label}</span>}
      {children}
      {error ? <span className="mt-1.5 block text-xs text-rose-300">{error}</span> : hint ? <span className="mt-1.5 block text-xs text-ink-400">{hint}</span> : null}
    </label>
  );
}

const inputBase =
  'w-full rounded-xl border border-white/8 bg-white/[0.035] px-4 text-[15px] text-cream placeholder:text-ink-400 outline-none transition-all focus:border-gold-400/50 focus:bg-white/[0.06] focus:shadow-[0_0_0_4px_rgb(220_171_74/0.12)] disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }>(function Input({ className, icon, ...rest }, ref) {
  if (icon) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400">{icon}</span>
        <input ref={ref} className={cn(inputBase, 'h-11 pl-10', className)} {...rest} />
      </div>
    );
  }
  return <input ref={ref} className={cn(inputBase, 'h-11', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(inputBase, 'min-h-24 resize-none py-3', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={cn(inputBase, 'h-11 appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-10', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239d9daa' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
});

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group inline-flex items-center gap-3 disabled:opacity-50"
    >
      <span className={cn('relative h-6 w-11 rounded-full border transition-colors', checked ? 'border-gold-300/50 bg-gold-400/80' : 'border-white/10 bg-white/10')}>
        <motion.span layout transition={{ type: 'spring', stiffness: 600, damping: 35 }} className={cn('absolute top-0.5 size-[18px] rounded-full shadow', checked ? 'left-[22px] bg-ink-950' : 'left-0.5 bg-ink-200')} />
      </span>
      {label && <span className="text-sm text-ink-200">{label}</span>}
    </button>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-2xl', className)} />;
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-5 animate-spin text-gold-300', className)} />;
}

export function EmptyState({ icon, title, text, action, className }: { icon: ReactNode; title: string; text?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/10 px-6 py-14 text-center', className)}>
      <div className="mb-4 grid size-16 place-items-center rounded-2xl bg-gold-400/10 text-gold-300 ring-1 ring-gold-400/20">{icon}</div>
      <h3 className="font-display text-xl text-cream">{title}</h3>
      {text && <p className="mt-2 max-w-sm text-sm text-ink-300">{text}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <div className={cn('inline-flex rounded-2xl border border-white/8 bg-white/[0.03] p-1', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn('relative rounded-xl font-medium transition-colors', size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm', value === o.value ? 'text-ink-950' : 'text-ink-300 hover:text-cream')}
        >
          {value === o.value && <motion.span layoutId={`seg-${options.map((x) => x.value).join('')}`} className="gold-gradient absolute inset-0 rounded-xl" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span className="relative z-10 inline-flex items-center gap-1.5">
            {o.label}
            {o.count !== undefined && (
              <span className={cn('rounded-full px-1.5 text-[10px] leading-4', value === o.value ? 'bg-ink-950/20' : 'bg-white/10')}>{o.count}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name, className }: { name: string | null | undefined; className?: string }) {
  return (
    <span className={cn('grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-gold-300/30 to-gold-700/30 text-xs font-semibold text-gold-100 ring-1 ring-gold-300/25', className)}>
      {initials(name)}
    </span>
  );
}

export function Stat({ label, value, delta, icon, hint, className }: { label: string; value: ReactNode; delta?: number; icon?: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <Card className={cn('relative overflow-hidden p-5', className)}>
      <div className="pointer-events-none absolute -right-8 -top-8 size-32 rounded-full bg-gold-400/10 blur-2xl" />
      <div className="flex items-start justify-between gap-3">
        <div className="text-xs font-medium uppercase tracking-wider text-ink-300">{label}</div>
        {icon && <div className="grid size-9 place-items-center rounded-xl bg-white/5 text-gold-300 ring-1 ring-white/10">{icon}</div>}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-cream">{value}</div>
      <div className="mt-1.5 flex items-center gap-2 text-xs">
        {delta !== undefined && (
          <span className={cn('rounded-full px-1.5 py-0.5 font-semibold', delta >= 0 ? 'bg-emerald-400/10 text-emerald-300' : 'bg-rose-400/10 text-rose-300')}>
            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
          </span>
        )}
        {hint && <span className="text-ink-400">{hint}</span>}
      </div>
    </Card>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-white/15 bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-ink-200">{children}</kbd>;
}
