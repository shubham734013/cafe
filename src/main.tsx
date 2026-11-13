import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import App from './App.tsx';
import './index.css';

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
    <Toaster
      theme="dark"
      position="bottom-right"
      richColors
      toastOptions={{
        style: {
          background: '#2c2521',
          color: '#ebe0db',
          border: '1px solid rgba(255, 193, 116, 0.2)',
        },
      }}
    />
  </QueryClientProvider>
);
