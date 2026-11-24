import { Toaster } from 'sonner';

export function ToastHost() {
  return (
    <Toaster
      theme="dark"
      position="bottom-right"
      richColors
      className="!z-[100]"
      style={{ zIndex: 100 }}
      toastOptions={{
        style: {
          background: '#2c2521',
          color: '#ebe0db',
          border: '1px solid rgba(255, 193, 116, 0.2)',
        },
      }}
    />
  );
}
