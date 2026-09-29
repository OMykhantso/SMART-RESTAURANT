import { Link } from 'react-router';
import { cn } from '@/lib/format';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={cn('size-9', className)} aria-hidden>
      <defs>
        <linearGradient id="lg-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f8e4ae" />
          <stop offset="0.55" stopColor="#dcab4a" />
          <stop offset="1" stopColor="#a7752c" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="18" fill="#101015" stroke="url(#lg-gold)" strokeOpacity="0.35" />
      <path d="M15 41h34M19 41a13 13 0 0 1 26 0" stroke="url(#lg-gold)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <circle cx="32" cy="24.5" r="2.6" fill="url(#lg-gold)" />
      <path d="M18 47h28" stroke="url(#lg-gold)" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
    </svg>
  );
}

export function Logo({ to = '/', compact }: { to?: string; compact?: boolean }) {
  return (
    <Link to={to} className="group flex items-center gap-3">
      <LogoMark className="transition-transform duration-500 group-hover:rotate-[8deg]" />
      {!compact && (
        <span className="leading-none">
          <span className="block font-display text-lg tracking-wide text-cream">Smart Restaurant</span>
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.32em] text-gold-300/80">Kyiv · since 2026</span>
        </span>
      )}
    </Link>
  );
}
