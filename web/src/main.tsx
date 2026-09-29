import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import '@fontsource-variable/manrope';
import '@fontsource-variable/playfair-display';
import './index.css';
import { AuthProvider } from './lib/auth';
import { RealtimeProvider } from './lib/realtime';
import { CartProvider } from './lib/cart';
import { App } from './App';
import { ErrorBoundary, reloadOnce } from './components/ErrorBoundary';

// Розширення браузера та автоперекладач змінюють DOM (обгортають текст у <font> тощо). Тоді React при переході
// між сторінками намагається прибрати вузол, якого вже немає на місці, і падає з NotFoundError (removeChild /
// insertBefore). Робимо ці операції терпимими до таких змін — стандартний обхід для React-застосунків.
if (typeof Node === 'function' && Node.prototype) {
  const removeChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      child.parentNode?.removeChild(child);
      return child;
    }
    return removeChild.call(this, child) as T;
  };
  const insertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) return this.appendChild(node) as T;
    return insertBefore.call(this, node, ref) as T;
  };
}

// Після перезбирання (docker compose up --build) старі файли сторінок зникають. Якщо відкрита вкладка
// не може їх довантажити — перезавантажуємо сторінку (не частіше разу на 10 с). Див. також lazy() в App.tsx.
window.addEventListener('vite:preloadError', () => reloadOnce());

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => count < 1 && !(error as { status?: number })?.status,
      refetchOnWindowFocus: true,
      staleTime: 5_000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <RealtimeProvider>
            <CartProvider>
              <ErrorBoundary>
                <App />
              </ErrorBoundary>
              <Toaster
                theme="dark"
                position="top-right"
                richColors
                closeButton
                toastOptions={{
                  className: 'sonner-toast-custom',
                  style: { background: 'rgba(18,18,23,0.92)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)', color: '#f5f0e8' },
                }}
              />
            </CartProvider>
          </RealtimeProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
