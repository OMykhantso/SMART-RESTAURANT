/** Короткі звукові сигнали через Web Audio API (без аудіофайлів). */
let ctx: AudioContext | null = null;

export function chime(kind: 'new' | 'ready' | 'soft' = 'soft') {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const notes = kind === 'new' ? [880, 1174.7] : kind === 'ready' ? [659.3, 880, 1318.5] : [987.8];
    const t0 = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = t0 + i * 0.12;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.12, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    });
  } catch {
    // браузер може заблокувати звук до першої взаємодії — це нормально
  }
}
