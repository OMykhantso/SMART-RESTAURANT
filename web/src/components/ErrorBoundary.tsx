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
    if (!this.state.error) return this.props.children;
    return (
      <div className="grid min-h-dvh place-items-center bg-ink-950 px-6 text-center">
        <div className="max-w-md">
          <div className="font-display text-3xl text-cream">Сторінку оновлено</div>
          <p className="mt-3 text-ink-300">Схоже, сайт щойно оновився або сталася помилка. Перезавантажте сторінку — усі ваші дані збережено.</p>
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
