import * as ToastPrimitive from '@radix-ui/react-toast';

import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastData {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration?: number;
}

interface ToastContextValue {
  addToast: (toast: Omit<ToastData, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const variantClasses: Record<ToastVariant, string> = {
  success: 'bg-success-soft text-success border-success',
  error: 'bg-error-soft text-error border-error',
  info: 'bg-info-soft text-info border-info',
};

function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((toast: Omit<ToastData, 'id'>) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map((toast) => (
          <ToastPrimitive.Root
            key={toast.id}
            duration={toast.duration ?? 5000}
            onOpenChange={(open) => {
              if (!open) removeToast(toast.id);
            }}
            className={`rounded-btn border p-4 shadow-elevated flex items-start gap-3 data-[state=open]:animate-slideIn ${variantClasses[toast.variant]}`}
            role="status"
          >
            <div className="flex-1">
              <ToastPrimitive.Title className="font-semibold text-sm">
                {toast.title}
              </ToastPrimitive.Title>
              {toast.description && (
                <ToastPrimitive.Description className="text-sm mt-1 opacity-80">
                  {toast.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close
              aria-label="Close"
              className="shrink-0 inline-flex items-center justify-center rounded-md p-1 hover:bg-black/10 transition-colors"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 14 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <path
                  d="M1 1L13 13M1 13L13 1"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-0 right-0 z-50 flex flex-col gap-2 p-4 m-0 list-none outline-none w-full max-w-[390px] max-w-[100vw]" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export { ToastProvider, useToast };
export type { ToastData, ToastVariant };
