import { Component, type ReactNode } from 'react';
import { RotateCw } from 'lucide-react';

/** Перезавантажує сторінку, якщо цього не робили останні 10 с (захист від циклу). Повертає true, якщо перезавантаження почалось. */
export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem('sr.reloadedAt') ?? 0);
    if (Date.now() - last < 10_000) return false;
    sessionStorage.setItem('sr.reloadedAt', String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

const isChunkError = (e: unknown) => e instanceof Error && /dynamically imported module|Importing a module script failed|Failed to fetch|error loading dynamically/i.test(e.message);

/** Замість чорного екрана при помилці рендерингу — зрозуміле повідомлення та кнопка оновлення. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(error);
    if (isChunkError(error)) reloadOnce();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const chunk = isChunkError(error);
    return (
      <div className="grid min-h-dvh place-items-center bg-ink-950 px-6 text-center">
        <div className="w-full max-w-xl">
          <div className="font-display text-3xl text-cream">{chunk ? 'Сайт оновився' : 'Щось пішло не так'}</div>
          <p className="mt-3 text-ink-300">
            {chunk ? 'Завантажилась нова версія сайту — оновіть сторінку.' : 'На сторінці сталася помилка. Оновіть сторінку; якщо повториться — надішліть текст нижче розробнику.'}
          </p>
          <pre className="mt-5 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left font-mono text-xs text-rose-200">
            {window.location.pathname}
            {'\n'}
            {error.name}: {error.message}
            {'\n'}
            {(error.stack ?? '').split('\n').slice(1, 6).join('\n')}
          </pre>
          <button
            onClick={() => window.location.reload()}
            className="gold-gradient mx-auto mt-6 inline-flex items-center gap-2 rounded-2xl px-6 py-3 font-semibold text-ink-950"
          >
            <RotateCw className="size-4" /> Оновити сторінку
          </button>
        </div>
      </div>
    );
  }
}
