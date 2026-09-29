import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/format';

type Variant = 'gold' | 'glass' | 'ghost' | 'outline' | 'danger' | 'success' | 'light';
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'icon';

const VARIANTS: Record<Variant, string> = {
  gold: 'gold-gradient text-ink-950 font-semibold shadow-[0_8px_30px_-8px_rgb(220_171_74/0.55)] hover:brightness-110 hover:shadow-[0_12px_40px_-8px_rgb(220_171_74/0.7)] active:brightness-95',
  glass: 'glass text-cream hover:bg-white/[0.08] hover:border-white/15',
  ghost: 'text-ink-200 hover:text-cream hover:bg-white/[0.06]',
  outline: 'border border-gold-400/40 text-gold-200 hover:bg-gold-400/10 hover:border-gold-300/70',
  danger: 'bg-rose-500/12 text-rose-200 border border-rose-400/25 hover:bg-rose-500/20',
  success: 'bg-emerald-500/15 text-emerald-100 border border-emerald-400/30 hover:bg-emerald-500/25',
  light: 'bg-cream text-ink-950 font-semibold hover:bg-white',
};

const SIZES: Record<Size, string> = {
  xs: 'h-7 px-2.5 text-xs gap-1 rounded-lg',
  sm: 'h-9 px-3.5 text-sm gap-1.5 rounded-xl',
  md: 'h-11 px-5 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-[15px] gap-2 rounded-2xl',
  xl: 'h-14 px-8 text-base gap-2.5 rounded-2xl',
  icon: 'h-10 w-10 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  iconRight?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'glass', size = 'md', loading, icon, iconRight, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'relative inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-all duration-200',
        'disabled:pointer-events-none disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
      {!loading && iconRight}
    </button>
  );
});
