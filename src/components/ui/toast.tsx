"use client";

import { AnimatePresence, motion } from "motion/react";
import { CircleCheck, CircleAlert, Info, FlaskConical } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

type ToastTone = "success" | "error" | "info" | "demo";

interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastApi {
  show(toast: Omit<Toast, "id">): void;
  success(title: string, description?: string): void;
  error(title: string, description?: string): void;
  info(title: string, description?: string): void;
  /** For simulated operations in prototype mode. */
  demo(title: string, description?: string): void;
}

const ToastContext = createContext<ToastApi | null>(null);

const icons: Record<ToastTone, ReactNode> = {
  success: <CircleCheck className="size-5 text-mint-500" />,
  error: <CircleAlert className="size-5 text-coral-500" />,
  info: <Info className="size-5 text-brand-500" />,
  demo: <FlaskConical className="size-5 text-accent-500" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  const show = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = nextId.current++;
      setToasts((t) => [...t.slice(-2), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), toast.description ? 4200 : 3000);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, description) => show({ tone: "success", title, description }),
      error: (title, description) => show({ tone: "error", title, description }),
      info: (title, description) => show({ tone: "info", title, description }),
      demo: (title, description) => show({ tone: "demo", title, description }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-3 z-[80] mx-auto flex w-full max-w-[var(--app-max-width)] flex-col items-center gap-2 px-4"
        aria-live="polite"
        role="status"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: -24, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.95, transition: { duration: 0.18 } }}
              transition={spring.snappy}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.6}
              onDragEnd={(_, info) => Math.abs(info.offset.x) > 80 && dismiss(t.id)}
              className={cn(
                "pointer-events-auto flex w-full items-start gap-3 rounded-2xl bg-white/95 px-4 py-3 shadow-[0_12px_40px_-12px_rgb(24_22_58/0.35)] ring-1 ring-ink-100 backdrop-blur",
              )}
            >
              <span className="mt-0.5 shrink-0">{icons[t.tone]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-900">{t.title}</p>
                {t.description && <p className="mt-0.5 text-[13px] text-ink-600">{t.description}</p>}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
