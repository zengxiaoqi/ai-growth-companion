import * as ToastPrimitive from '@radix-ui/react-toast';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

type ToastTone = 'default' | 'success' | 'error';

interface ToastItem {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  notify: (title: string, description?: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function AppToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const notify = useCallback((title: string, description?: string, tone: ToastTone = 'default') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((prev) => [...prev, { id, title, description, tone }]);
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            open
            duration={3200}
            onOpenChange={(open) => {
              if (!open) setToasts((prev) => prev.filter((t) => t.id !== item.id));
            }}
            className={`mb-2 min-w-[260px] rounded-xl border px-4 py-3 shadow-xl ${
              item.tone === 'error'
                ? 'border-error/40 bg-error-container text-error'
                : item.tone === 'success'
                  ? 'border-success/40 bg-success-container text-on-success-container'
                  : 'border-outline-variant/30 bg-surface-container-lowest text-on-surface'
            }`}
          >
            <ToastPrimitive.Title className="text-sm font-bold">{item.title}</ToastPrimitive.Title>
            {item.description ? (
              <ToastPrimitive.Description className="mt-1 text-xs opacity-85">{item.description}</ToastPrimitive.Description>
            ) : null}
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-safe right-4 z-[220] flex max-h-screen w-[min(92vw,360px)] flex-col" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useAppToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useAppToast must be used inside AppToastProvider');
  return context;
}
