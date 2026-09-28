import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, Keyboard, XCircle } from 'lucide-react';
import { Card, Input, SectionTitle } from '@/components/ui/primitives';
import { Button } from '@/components/ui/Button';
import { QrScanner } from '@/components/domain/QrScanner';
import { api, errorMessage } from '@/lib/api';
import { chime } from '@/lib/sound';
import { guestsLabel } from '@/lib/format';
import { ZONES } from '@/lib/constants';
import type { Reservation } from '@/lib/types';

export default function Scan() {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<{ ok: true; r: Reservation } | { ok: false; message: string } | null>(null);

  const checkIn = useMutation({
    mutationFn: (body: { qr?: string; code?: string }) => api.post<Reservation>('/reservations/check-in', body),
    onSuccess: (r) => {
      setResult({ ok: true, r });
      chime('ready');
      ['reservations', 'tables-live', 'today'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => {
      setResult({ ok: false, message: errorMessage(e) });
      chime('soft');
    },
  });

  const submitCode = (e: FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (!c) return;
    checkIn.mutate({ code: c.startsWith('R-') ? c : `R-${c}` });
  };

  return (
    <div className="space-y-6">
      <SectionTitle eyebrow="QR check-in" title="Сканер гостей" subtitle="Відскануйте QR-код із застосунку гостя або введіть код бронювання вручну." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <QrScanner paused={checkIn.isPending} onScan={(text) => checkIn.mutate({ qr: text })} />
          <form onSubmit={submitCode} className="mx-auto mt-6 flex max-w-md gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Код: R-7K2F9Q" icon={<Keyboard className="size-4" />} className="font-mono uppercase tracking-widest" />
            <Button type="submit" variant="outline" loading={checkIn.isPending && !!code}>
              Check-in
            </Button>
          </form>
        </Card>
        <AnimatePresence mode="wait">
          {result ? (
            <motion.div key={result.ok ? result.r.id : result.message} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
              {result.ok ? (
                <Card className="relative overflow-hidden p-8 text-center ring-1 ring-emerald-400/30">
                  <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto size-72 rounded-full bg-emerald-400/15 blur-3xl" />
                  <CheckCircle2 className="mx-auto size-16 text-emerald-300" />
                  <h3 className="mt-4 font-display text-3xl text-cream">Ласкаво просимо!</h3>
                  <p className="mt-2 text-lg text-ink-100">{result.r.guestName}</p>
                  <div className="mx-auto mt-6 grid max-w-sm grid-cols-3 gap-3">
                    <Big label="Столик" value={`№${result.r.table.number}`} />
                    <Big label="Зона" value={ZONES[result.r.table.zone].short} />
                    <Big label="Гості" value={String(result.r.guests)} />
                  </div>
                  <p className="mt-5 text-sm text-ink-300">
                    {guestsLabel(result.r.guests)} · до {result.r.endTime} · {result.r.code}
                  </p>
                  {result.r.notes && <p className="mx-auto mt-3 max-w-sm rounded-xl bg-amber-400/10 px-3 py-2 text-sm text-amber-100">{result.r.notes}</p>}
                </Card>
              ) : (
                <Card className="p-8 text-center ring-1 ring-rose-400/30">
                  <XCircle className="mx-auto size-16 text-rose-300" />
                  <h3 className="mt-4 font-display text-2xl text-cream">Check-in неможливий</h3>
                  <p className="mt-2 text-ink-200">{result.message}</p>
                </Card>
              )}
            </motion.div>
          ) : (
            <motion.div key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card className="grid h-full place-items-center p-10 text-center">
                <div className="max-w-sm text-sm leading-relaxed text-ink-300">
                  Після сканування тут з’явиться інформація про гостя та столик. Система перевіряє підпис QR-коду, статус бронювання й часове вікно check-in.
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] p-3">
      <div className="text-[11px] uppercase tracking-wider text-ink-400">{label}</div>
      <div className="mt-1 font-display text-2xl text-gold-100">{value}</div>
    </div>
  );
}
