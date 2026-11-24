import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { lazy, Suspense } from 'react';
import App from './App.tsx';
import './index.css';

const ToastHost = lazy(() =>
  import('./components/ToastHost').then((module) => ({ default: module.ToastHost }))
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <App />
    <Suspense fallback={null}>
      <ToastHost />
    </Suspense>
  </QueryClientProvider>
);
