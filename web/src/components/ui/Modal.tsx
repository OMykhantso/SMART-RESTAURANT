import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/format';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  side?: boolean;
  className?: string;
  hideClose?: boolean;
}

const SIZES = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

/** Доступне модальне вікно / бокова панель: Esc, клік поза вікном, повернення фокусу. */
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', side, className, hideClose }: ModalProps) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    setTimeout(() => panel.current?.focus(), 30);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={cn('fixed inset-0 z-50 flex', side ? 'justify-end' : 'items-end justify-center sm:items-center sm:p-6')}>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            initial={side ? { x: '100%' } : { opacity: 0, y: 40, scale: 0.97 }}
            animate={side ? { x: 0 } : { opacity: 1, y: 0, scale: 1 }}
            exit={side ? { x: '100%' } : { opacity: 0, y: 30, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className={cn(
              'glass-strong relative flex max-h-[92dvh] w-full flex-col overflow-hidden outline-none',
              side ? 'h-dvh max-h-dvh max-w-md border-l border-white/10' : cn('rounded-t-3xl sm:rounded-3xl', SIZES[size]),
              className,
            )}
          >
            {(title || !hideClose) && (
              <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-6">
                <div>
                  {title && <h3 className="font-display text-2xl text-cream">{title}</h3>}
                  {subtitle && <p className="mt-1 text-sm text-ink-300">{subtitle}</p>}
                </div>
                {!hideClose && (
                  <button onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-full bg-white/5 text-ink-300 transition hover:bg-white/10 hover:text-cream" aria-label="Закрити">
                    <X className="size-4" />
                  </button>
                )}
              </div>
            )}
            <div className="flex-1 overflow-y-auto px-6 pb-6 pt-2">{children}</div>
            {footer && <div className="border-t border-white/8 bg-black/20 px-6 py-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
