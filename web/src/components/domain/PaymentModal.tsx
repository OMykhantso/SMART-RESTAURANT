import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { Check, CreditCard, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/primitives';
import { api, errorMessage } from '@/lib/api';
import { cn, money, uid } from '@/lib/format';
import { orderPlace, TEST_CARDS } from '@/lib/constants';
import type { Order, PayResult } from '@/lib/types';

const TIPS = [0, 5, 10, 15];

function formatCard(v: string) {
  return v
    .replace(/\D/g, '')
    .slice(0, 16)
    .replace(/(\d{4})(?=\d)/g, '$1 ');
}

function brandOf(n: string) {
  const d = n.replace(/\D/g, '');
  if (d.startsWith('4')) return 'VISA';
  if (/^5[1-5]/.test(d) || /^2[2-7]/.test(d)) return 'MASTERCARD';
  return null;
}

/** Sandbox-оплата: форма картки з анімованим превʼю, чайові, 3-D Secure та екран успіху з чеком. */
export function PaymentModal({ order, open, onClose }: { order: Order; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [tipPct, setTipPct] = useState(10);
  const [number, setNumber] = useState('');
  const [exp, setExp] = useState('');
  const [cvc, setCvc] = useState('');
  const [holder, setHolder] = useState('');
  const [flipped, setFlipped] = useState(false);
  const [challenge, setChallenge] = useState<{ paymentId: number; message: string } | null>(null);
  const [otp, setOtp] = useState('');
  const [result, setResult] = useState<PayResult | null>(null);
  const idemKey = useMemo(() => `web-${order.id}-${uid()}`, [order.id, open]);

  const tip = Math.round((order.total * tipPct) / 100 / 100) * 100;
  const brand = brandOf(number);

  const done = (r: PayResult) => {
    setResult(r);
    setChallenge(null);
    qc.invalidateQueries({ queryKey: ['order', order.id] });
    qc.invalidateQueries({ queryKey: ['my-orders'] });
    qc.invalidateQueries({ queryKey: ['current-visit'] });
  };

  const pay = useMutation({
    mutationFn: () => {
      const [mm, yy] = exp.split('/');
      return api.post<PayResult>(
        '/payments/card',
        { orderId: order.id, tip, card: { number, expMonth: Number(mm), expYear: Number(yy), cvc, holder: holder || undefined } },
        { 'Idempotency-Key': `${idemKey}-${number.slice(-4)}` },
      );
    },
    onSuccess: (r) => {
      if (r.requiresAction) setChallenge({ paymentId: r.payment.id, message: r.challenge?.message ?? 'Підтвердіть оплату' });
      else done(r);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const confirm = useMutation({
    mutationFn: () => api.post<PayResult>(`/payments/${challenge!.paymentId}/confirm`, { otp }),
    onSuccess: done,
    onError: (e) => {
      toast.error(errorMessage(e));
      setChallenge(null);
      setOtp('');
    },
  });

  const close = () => {
    onClose();
    setTimeout(() => {
      setResult(null);
      setChallenge(null);
      setOtp('');
    }, 300);
  };

  const valid = number.replace(/\s/g, '').length >= 15 && /^\d{2}\/\d{2}$/.test(exp) && /^\d{3,4}$/.test(cvc);

  return (
    <Modal open={open} onClose={close} size="md" title={result ? undefined : 'Оплата замовлення'} subtitle={result ? undefined : `#${order.id} · ${orderPlace(order)}`} hideClose={Boolean(result)}>
      <AnimatePresence mode="wait">
        {result ? (
          <motion.div key="ok" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="py-4 text-center">
            <motion.div initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 14 }} className="gold-gradient mx-auto grid size-20 place-items-center rounded-full text-ink-950 shadow-[var(--shadow-glow)]">
              <Check className="size-10" strokeWidth={3} />
            </motion.div>
            <h3 className="mt-6 font-display text-3xl text-cream">Оплачено!</h3>
            <p className="mt-2 text-sm text-ink-300">Дякуємо, що обрали Smart Restaurant</p>
            <div className="mx-auto mt-6 max-w-xs rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-4 text-left font-mono text-xs text-ink-200">
              <Row k="Замовлення" v={`#${order.id}`} />
              <Row k="Сума" v={money(result.payment.amount)} />
              <Row k="Чайові" v={money(result.payment.tip)} />
              <div className="my-2 border-t border-dashed border-white/15" />
              <Row k="Разом" v={money(result.payment.total)} bold />
              <Row k="Картка" v={`${result.payment.cardBrand} •• ${result.payment.cardLast4}`} />
              <Row k="Транзакція" v={result.payment.providerRef.slice(0, 18)} />
            </div>
            <Button variant="gold" size="lg" className="mt-8 w-full" onClick={close}>
              Готово
            </Button>
          </motion.div>
        ) : challenge ? (
          <motion.div key="3ds" initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} className="py-2">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-center">
              <ShieldCheck className="mx-auto size-10 text-gold-300" />
              <h4 className="mt-3 font-display text-2xl text-cream">3-D Secure</h4>
              <p className="mt-2 text-sm text-ink-300">{challenge.message}</p>
              <input
                autoFocus
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="mx-auto mt-6 block w-48 rounded-2xl border border-white/10 bg-ink-900 py-3 text-center font-mono text-2xl tracking-[0.5em] text-cream outline-none focus:border-gold-400/60"
                placeholder="••••••"
              />
              <Button variant="gold" size="lg" className="mt-6 w-full" disabled={otp.length < 4} loading={confirm.isPending} onClick={() => confirm.mutate()}>
                Підтвердити
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -30 }} className="space-y-5">
            {/* Превʼю картки */}
            <div className="mx-auto h-44 w-full max-w-[21rem] [perspective:1200px]">
              <motion.div animate={{ rotateY: flipped ? 180 : 0 }} transition={{ type: 'spring', stiffness: 200, damping: 22 }} className="relative size-full [transform-style:preserve-3d]">
                <div className="absolute inset-0 overflow-hidden rounded-3xl p-6 shadow-2xl shadow-black/60 [backface-visibility:hidden]" style={{ background: 'linear-gradient(135deg,#2e2718 0%,#101015 55%,#3a2815 100%)' }}>
                  <div className="absolute -right-12 -top-12 size-48 rounded-full bg-gold-400/25 blur-3xl" />
                  <div className="flex items-start justify-between">
                    <div className="h-8 w-11 rounded-md bg-gradient-to-br from-gold-100 via-gold-300 to-gold-600" />
                    <span className="text-sm font-bold italic tracking-wider text-cream/90">{brand ?? <CreditCard className="size-6 text-ink-400" />}</span>
                  </div>
                  <div className="mt-7 font-mono text-xl tracking-[0.15em] text-cream">{number || '•••• •••• •••• ••••'}</div>
                  <div className="mt-4 flex justify-between text-[11px] uppercase tracking-wider text-ink-300">
                    <span className="truncate pr-4">{holder || 'Ім’я власника'}</span>
                    <span>{exp || 'MM/YY'}</span>
                  </div>
                </div>
                <div className="absolute inset-0 overflow-hidden rounded-3xl bg-ink-800 shadow-2xl [backface-visibility:hidden] [transform:rotateY(180deg)]">
                  <div className="mt-8 h-10 bg-black/80" />
                  <div className="mx-6 mt-5 flex h-9 items-center justify-end rounded bg-cream/90 px-3 font-mono text-ink-950">{cvc ? '•'.repeat(cvc.length) : '•••'}</div>
                </div>
              </motion.div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Номер картки" className="col-span-2">
                <Input inputMode="numeric" value={number} onChange={(e) => setNumber(formatCard(e.target.value))} placeholder="4242 4242 4242 4242" autoComplete="cc-number" />
              </Field>
              <Field label="Термін">
                <Input
                  inputMode="numeric"
                  value={exp}
                  onChange={(e) => {
                    const d = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setExp(d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d);
                  }}
                  placeholder="12/29"
                  autoComplete="cc-exp"
                />
              </Field>
              <Field label="CVC">
                <Input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  name="cc-csc"
                  value={cvc}
                  onFocus={() => setFlipped(true)}
                  onBlur={() => setFlipped(false)}
                  onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="•••"
                  autoComplete="cc-csc"
                  aria-label="CVC — три цифри на звороті картки"
                />
              </Field>
              <Field label="Власник картки" className="col-span-2">
                <Input value={holder} onChange={(e) => setHolder(e.target.value.toUpperCase())} placeholder="OLEKSANDR MELNYK" autoComplete="cc-name" />
              </Field>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-ink-300">
                <Sparkles className="size-3.5 text-gold-300" /> Чайові для команди
              </div>
              <div className="grid grid-cols-4 gap-2">
                {TIPS.map((p) => (
                  <button key={p} onClick={() => setTipPct(p)} className={cn('rounded-xl border py-2.5 text-sm transition', tipPct === p ? 'border-gold-300/60 bg-gold-400/15 text-gold-100' : 'border-white/8 text-ink-300 hover:border-white/20')}>
                    {p === 0 ? 'Без' : `${p}%`}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-white/[0.03] p-4 text-sm">
              <Row k="Замовлення" v={money(order.total)} />
              <Row k="Чайові" v={money(tip)} />
              <div className="mt-2 flex items-end justify-between border-t border-white/8 pt-2">
                <span className="text-ink-200">До сплати</span>
                <span className="font-display text-2xl text-gold-100">{money(order.total + tip)}</span>
              </div>
            </div>

            <Button variant="gold" size="lg" className="w-full" disabled={!valid} loading={pay.isPending} onClick={() => pay.mutate()} icon={<Lock className="size-4" />}>
              Сплатити {money(order.total + tip)}
            </Button>
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-400">
              <ShieldCheck className={cn('size-3.5', window.location.protocol === 'https:' ? 'text-emerald-300' : 'text-ink-400')} />
              {window.location.protocol === 'https:' ? 'Захищене зʼєднання HTTPS · ' : ''}номер картки й CVC не зберігаються — лише останні 4 цифри
            </p>

            <details className="rounded-2xl border border-white/6 bg-white/[0.02] p-3 text-xs text-ink-300">
              <summary className="cursor-pointer select-none text-ink-200">Тестові картки sandbox</summary>
              <div className="mt-3 grid gap-1.5">
                {TEST_CARDS.map((c) => (
                  <button
                    key={c.number}
                    onClick={() => {
                      setNumber(c.number);
                      setExp('12/29');
                      setCvc('123');
                    }}
                    className="flex justify-between rounded-lg px-2 py-1.5 text-left hover:bg-white/5"
                  >
                    <span className="font-mono text-cream">{c.number}</span>
                    <span>{c.label}</span>
                  </button>
                ))}
              </div>
            </details>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={cn('flex justify-between py-0.5', bold && 'font-semibold text-cream')}>
      <span className="text-ink-400">{k}</span>
      <span>{v}</span>
    </div>
  );
}
