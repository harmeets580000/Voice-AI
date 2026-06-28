"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cx } from "./primitives";

type ToastVariant = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message: string, variant: ToastVariant) => {
      const id = ++idRef.current;
      setToasts((t) => [...t, { id, message, variant }]);
      setTimeout(() => remove(id), 4000);
    },
    [remove],
  );

  const api: ToastApi = {
    success: (m) => push(m, "success"),
    error: (m) => push(m, "error"),
    info: (m) => push(m, "info"),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-80 max-w-[90vw] flex-col gap-2">
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const variantStyles: Record<
  ToastVariant,
  { icon: React.ReactNode; accent: string }
> = {
  success: {
    icon: <CheckCircle2 size={18} className="text-positive" />,
    accent: "border-l-positive",
  },
  error: {
    icon: <AlertCircle size={18} className="text-danger" />,
    accent: "border-l-danger",
  },
  info: {
    icon: <Info size={18} className="text-accent" />,
    accent: "border-l-accent",
  },
};

function Toast({
  toast,
  onClose,
}: {
  toast: ToastItem;
  onClose: () => void;
}) {
  const v = variantStyles[toast.variant];
  return (
    <div
      role="status"
      className={cx(
        "pointer-events-auto flex items-start gap-2.5 rounded-xl border border-l-4 border-border bg-card px-3.5 py-3 text-sm shadow-lg animate-[slide-up_0.25s_cubic-bezier(0.16,1,0.3,1)]",
        v.accent,
      )}
    >
      <span className="mt-0.5 shrink-0">{v.icon}</span>
      <span className="flex-1 text-text">{toast.message}</span>
      <button
        onClick={onClose}
        aria-label="Dismiss"
        className="shrink-0 text-muted transition-colors hover:text-text"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Safe no-op fallback so components don't crash outside the provider.
    return { success: () => {}, error: () => {}, info: () => {} };
  }
  return ctx;
}
