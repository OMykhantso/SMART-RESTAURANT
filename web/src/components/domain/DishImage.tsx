import { useState } from 'react';
import { cn } from '@/lib/format';

const PALETTE: Record<string, [string, string]> = {
  breakfast: ['#f5b54a', '#7a3e10'],
  starters: ['#e6874a', '#5a2410'],
  salads: ['#8fcf6a', '#1f4a1c'],
  soups: ['#e0584a', '#4a1210'],
  main: ['#c9713c', '#3a1608'],
  pasta: ['#efc75e', '#5c3b0c'],
  pizza: ['#f0703c', '#5a1a08'],
  desserts: ['#f08fb0', '#4a1430'],
  drinks: ['#c79a6a', '#2e1a0c'],
  cocktails: ['#c78af0', '#2a1048'],
};

const EMOJI: Record<string, string> = {
  breakfast: '🍳',
  starters: '🥟',
  salads: '🥗',
  soups: '🍲',
  main: '🥩',
  pasta: '🍝',
  pizza: '🍕',
  desserts: '🍰',
  drinks: '☕',
  cocktails: '🍸',
};

/** Фото страви з елегантним запасним варіантом (градієнт + емодзі), якщо зображення недоступне офлайн. */
export function DishImage({
  src,
  alt,
  category,
  emoji,
  className,
  rounded = 'rounded-2xl',
  zoom = true,
}: {
  src: string | null | undefined;
  alt: string;
  category?: string;
  emoji?: string | null;
  className?: string;
  rounded?: string;
  zoom?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [c1, c2] = PALETTE[category ?? ''] ?? ['#dcab4a', '#3a2815'];
  const showImage = src && !failed;

  return (
    <div className={cn('relative overflow-hidden bg-ink-800', rounded, className)} style={{ containerType: 'size' }}>
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(120% 90% at 30% 20%, ${c1}55 0%, ${c2}cc 55%, #0d0d11 100%)` }}
      >
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1px, transparent 0)',
            backgroundSize: '14px 14px',
          }}
        />
        {!loaded && (
          <div className="absolute inset-0 grid place-items-center">
            <span className="select-none leading-none drop-shadow-[0_8px_24px_rgba(0,0,0,0.6)]" style={{ fontSize: 'clamp(12px, 42cqmin, 72px)' }} aria-hidden>
              {emoji ?? EMOJI[category ?? ''] ?? '🍽️'}
            </span>
          </div>
        )}
      </div>
      {showImage && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onError={() => setFailed(true)}
          onLoad={() => setLoaded(true)}
          className={cn(
            'absolute inset-0 size-full object-cover transition-all duration-700',
            loaded ? 'opacity-100' : 'opacity-0',
            zoom && 'group-hover:scale-[1.06]',
          )}
        />
      )}
    </div>
  );
}
