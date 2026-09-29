import { useEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/format';
import type { Table, TableZone } from '@/lib/types';

export type TableTone = 'free' | 'selected' | 'recommended' | 'busy' | 'disabled' | 'occupied' | 'soon' | 'late';

export interface TableVisual {
  tone: TableTone;
  label?: ReactNode;
  sublabel?: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
}

const ZONE_AREAS: Record<TableZone, { x: number; y: number; w: number; h: number; label: string }> = {
  HALL: { x: 1, y: 2, w: 66, h: 58, label: 'Головна зала' },
  VIP: { x: 69, y: 2, w: 30, h: 58, label: 'VIP' },
  BAR: { x: 1, y: 63, w: 32, h: 35, label: 'Бар' },
  TERRACE: { x: 35, y: 63, w: 64, h: 35, label: 'Тераса' },
};

const TONES: Record<TableTone, string> = {
  free: 'bg-ink-800 border-white/15 text-ink-100 hover:border-gold-300/70 hover:shadow-[0_0_30px_-6px_rgb(220_171_74/0.6)]',
  recommended: 'bg-gold-400/15 border-gold-300/80 text-gold-50 shadow-[0_0_36px_-4px_rgb(220_171_74/0.65)]',
  selected: 'gold-gradient border-gold-100 text-ink-950 shadow-[0_0_44px_-2px_rgb(220_171_74/0.85)]',
  busy: 'bg-ink-850 border-white/5 text-ink-500 [background-image:repeating-linear-gradient(135deg,rgba(255,255,255,0.04)_0_6px,transparent_6px_12px)]',
  disabled: 'bg-ink-900 border-white/5 text-ink-600 opacity-60',
  occupied: 'bg-gradient-to-br from-gold-500/35 to-gold-800/40 border-gold-300/60 text-gold-50',
  soon: 'bg-sky-400/12 border-sky-300/50 text-sky-50',
  late: 'bg-rose-500/15 border-rose-300/60 text-rose-50 animate-pulse',
};

function tableSize(t: Pick<Table, 'seats' | 'shape'>) {
  if (t.shape === 'ROUND') return t.seats <= 2 ? { w: 64, h: 64 } : { w: 78, h: 78 };
  if (t.shape === 'SQUARE') return t.seats <= 2 ? { w: 62, h: 62 } : { w: 76, h: 76 };
  const w = t.seats >= 8 ? 150 : t.seats >= 6 ? 124 : 100;
  return { w, h: 70 };
}

function chairs(t: Pick<Table, 'seats' | 'shape'>, w: number, h: number) {
  const pts: { x: number; y: number; r: number }[] = [];
  if (t.shape === 'ROUND') {
    for (let i = 0; i < t.seats; i++) {
      const a = (i / t.seats) * Math.PI * 2 - Math.PI / 2;
      pts.push({ x: w / 2 + Math.cos(a) * (w / 2 + 9), y: h / 2 + Math.sin(a) * (h / 2 + 9), r: (a * 180) / Math.PI + 90 });
    }
    return pts;
  }
  const perSide = t.shape === 'SQUARE' ? Math.max(1, Math.round(t.seats / 4)) : Math.ceil(t.seats / 2);
  const sides = t.shape === 'SQUARE' && t.seats >= 4 ? ['top', 'bottom', 'left', 'right'] : ['top', 'bottom'];
  let left = t.seats;
  for (const side of sides) {
    const n = Math.min(left, perSide);
    left -= n;
    for (let i = 0; i < n; i++) {
      const f = (i + 1) / (n + 1);
      if (side === 'top') pts.push({ x: w * f, y: -9, r: 0 });
      if (side === 'bottom') pts.push({ x: w * f, y: h + 9, r: 0 });
      if (side === 'left') pts.push({ x: -9, y: h * f, r: 90 });
      if (side === 'right') pts.push({ x: w + 9, y: h * f, r: 90 });
    }
  }
  return pts;
}

interface FloorPlanProps<T extends Table> {
  tables: T[];
  visual: (t: T) => TableVisual;
  onSelect?: (t: T) => void;
  editable?: boolean;
  onMove?: (t: T, posX: number, posY: number) => void;
  className?: string;
  legend?: ReactNode;
}

export function FloorPlan<T extends Table>({ tables, visual, onSelect, editable, onMove, className, legend }: FloorPlanProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [drag, setDrag] = useState<{ id: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setScale(Math.max(0.55, Math.min(1.3, entry.contentRect.width / 820))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const toPercent = (clientX: number, clientY: number) => {
    const rect = ref.current!.getBoundingClientRect();
    return {
      x: Math.round(Math.max(3, Math.min(97, ((clientX - rect.left) / rect.width) * 100)) * 10) / 10,
      y: Math.round(Math.max(4, Math.min(96, ((clientY - rect.top) / rect.height) * 100)) * 10) / 10,
    };
  };

  return (
    <div className={cn('relative', className)}>
      <div
        ref={ref}
        className="noise relative aspect-[16/10] w-full select-none overflow-hidden rounded-3xl border border-white/8 bg-ink-900"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)',
          backgroundSize: `${24 * scale}px ${24 * scale}px`,
        }}
        onPointerMove={(e) => {
          if (!drag) return;
          const p = toPercent(e.clientX, e.clientY);
          setDrag({ ...drag, x: p.x, y: p.y });
        }}
        onPointerUp={() => {
          if (!drag) return;
          const t = tables.find((x) => x.id === drag.id);
          if (t && (t.posX !== drag.x || t.posY !== drag.y)) onMove?.(t, drag.x, drag.y);
          setDrag(null);
        }}
        onPointerLeave={() => setDrag(null)}
      >
        {Object.entries(ZONE_AREAS).map(([zone, a]) => (
          <div key={zone} className="absolute rounded-2xl border border-dashed border-white/[0.07] bg-white/[0.015]" style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%` }}>
            <span className="absolute left-3 top-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-ink-500" style={{ fontSize: Math.max(8, 10 * scale) }}>
              {a.label}
            </span>
          </div>
        ))}
        {/* декор: вхід і барна стійка */}
        <div className="absolute bottom-[4%] left-[3%] h-[5%] w-[27%] rounded-full bg-gradient-to-r from-gold-700/30 to-gold-500/20" />
        <div className="absolute left-1/2 top-0 h-1 w-[10%] -translate-x-1/2 rounded-b-full bg-gold-400/40" />

        {tables.map((t) => {
          const v = visual(t);
          const size = tableSize(t);
          const w = size.w * scale;
          const h = size.h * scale;
          const isDragging = drag?.id === t.id;
          const x = isDragging ? drag.x : t.posX;
          const y = isDragging ? drag.y : t.posY;
          const clickable = !v.disabled && (onSelect || editable);
          return (
            <motion.div
              key={t.id}
              layout={!isDragging}
              className="absolute"
              style={{ left: `${x}%`, top: `${y}%`, width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2, zIndex: isDragging ? 20 : 1 }}
            >
              {chairs(t, w, h).map((c, i) => (
                <span
                  key={i}
                  className={cn('absolute rounded-full transition-colors', v.tone === 'selected' || v.tone === 'occupied' ? 'bg-gold-300/70' : v.tone === 'busy' || v.tone === 'disabled' ? 'bg-white/8' : 'bg-white/20')}
                  style={{ left: c.x - 7 * scale, top: c.y - 3.5 * scale, width: 14 * scale, height: 7 * scale, transform: `rotate(${c.r}deg)` }}
                />
              ))}
              <button
                type="button"
                disabled={!clickable}
                onPointerDown={(e) => {
                  if (!editable) return;
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                  setDrag({ id: t.id, x: t.posX, y: t.posY });
                  onSelect?.(t);
                }}
                onClick={() => !editable && onSelect?.(t)}
                className={cn(
                  'relative flex size-full flex-col items-center justify-center border-2 transition-all duration-300',
                  t.shape === 'ROUND' ? 'rounded-full' : 'rounded-2xl',
                  TONES[v.tone],
                  editable && 'cursor-grab active:cursor-grabbing',
                  !clickable && 'cursor-default',
                )}
              >
                <span className="font-display font-semibold leading-none" style={{ fontSize: Math.max(12, 18 * scale) }}>
                  {v.label ?? t.number}
                </span>
                {v.sublabel && (
                  <span className="mt-0.5 whitespace-nowrap leading-none opacity-80" style={{ fontSize: Math.max(8, 10 * scale) }}>
                    {v.sublabel}
                  </span>
                )}
                {v.badge && <span className="absolute -right-2 -top-2">{v.badge}</span>}
              </button>
            </motion.div>
          );
        })}
      </div>
      {legend && <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-300">{legend}</div>}
    </div>
  );
}

export function LegendDot({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn('size-3 rounded-full border', className)} /> {children}
    </span>
  );
}
