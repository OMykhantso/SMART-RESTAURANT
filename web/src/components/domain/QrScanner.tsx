import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, ImageUp } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/format';

/**
 * QR-сканер на базі getUserMedia + jsQR (декодування кадрів у canvas).
 * Камера потребує HTTPS або localhost; як запасний варіант — розпізнавання QR із фото.
 */
export function QrScanner({ onScan, paused }: { onScan: (text: string) => void; paused?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRef = useRef<{ text: string; at: number } | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const streamRef = useRef<MediaStream | null>(null);

  const emit = (text: string) => {
    const last = lastRef.current;
    if (last && last.text === text && Date.now() - last.at < 3000) return;
    lastRef.current = { text, at: Date.now() };
    onScan(text);
  };

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  };

  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Камера недоступна: відкрийте сторінку через localhost або HTTPS, або завантажте фото QR-коду.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } });
      streamRef.current = stream;
      if (video.current) {
        video.current.srcObject = stream;
        await video.current.play();
      }
      setActive(true);
    } catch {
      setError('Немає доступу до камери. Дозвольте доступ у браузері або завантажте фото QR-коду.');
    }
  };

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let lastScan = 0;
    const tick = (ts: number) => {
      raf = requestAnimationFrame(tick);
      if (ts - lastScan < 150 || pausedRef.current) return;
      lastScan = ts;
      const v = video.current;
      const c = canvas.current;
      if (!v || !c || v.readyState < 2) return;
      const w = 480;
      const h = Math.round((v.videoHeight / v.videoWidth) * w) || 360;
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, w, h);
      const code = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
      if (code?.data) emit(code.data);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]); // emit читає актуальні значення через ref

  useEffect(() => stop, []);

  const fromFile = async (file: File) => {
    const bitmap = await createImageBitmap(file);
    const c = document.createElement('canvas');
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    c.width = Math.round(bitmap.width * scale);
    c.height = Math.round(bitmap.height * scale);
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0, c.width, c.height);
    const code = jsQR(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
    if (code?.data) emit(code.data);
    else setError('На фото не знайдено QR-коду. Спробуйте ще раз.');
  };

  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-ink-900">
        <video ref={video} playsInline muted className={cn('size-full object-cover', !active && 'hidden')} />
        <canvas ref={canvas} className="hidden" />
        {!active && (
          <div className="absolute inset-0 grid place-items-center p-8 text-center">
            <div>
              <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-gold-400/10 text-gold-300 ring-1 ring-gold-400/20">
                <Camera className="size-7" />
              </div>
              <p className="mt-4 text-sm text-ink-300">Наведіть камеру на QR-код бронювання гостя</p>
            </div>
          </div>
        )}
        {active && (
          <>
            <div className="pointer-events-none absolute inset-[14%] rounded-3xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
            {['left-[14%] top-[14%] border-l-4 border-t-4 rounded-tl-3xl', 'right-[14%] top-[14%] border-r-4 border-t-4 rounded-tr-3xl', 'left-[14%] bottom-[14%] border-l-4 border-b-4 rounded-bl-3xl', 'right-[14%] bottom-[14%] border-r-4 border-b-4 rounded-br-3xl'].map((c) => (
              <span key={c} className={cn('pointer-events-none absolute size-10 border-gold-300', c)} />
            ))}
            <span className="pointer-events-none absolute inset-x-[16%] top-[16%] h-0.5 animate-[scan_2.2s_ease-in-out_infinite] bg-gold-300 shadow-[0_0_16px_3px_rgb(220_171_74/0.8)]" />
            <style>{`@keyframes scan{0%,100%{transform:translateY(0)}50%{transform:translateY(calc(min(28rem,100vw)*0.62))}}`}</style>
          </>
        )}
      </div>
      {error && <div className="mx-auto mt-3 max-w-md rounded-xl bg-amber-400/10 px-4 py-3 text-xs text-amber-100">{error}</div>}
      <div className="mx-auto mt-4 flex max-w-md gap-2">
        {active ? (
          <Button variant="glass" className="flex-1" icon={<CameraOff className="size-4" />} onClick={stop}>
            Зупинити камеру
          </Button>
        ) : (
          <Button variant="gold" className="flex-1" icon={<Camera className="size-4" />} onClick={start}>
            Увімкнути камеру
          </Button>
        )}
        <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-white/10 px-4 text-sm text-ink-200 transition hover:bg-white/5">
          <ImageUp className="size-4" /> Фото
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && fromFile(e.target.files[0])} />
        </label>
      </div>
    </div>
  );
}
