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
              <App />
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
