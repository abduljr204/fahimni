"use client";

import { AnimatePresence, motion, useDragControls, type PanInfo } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";
import { Button } from "./button";

const noopSubscribe = () => () => {};

/** False during SSR and hydration, true on the client: portals need `document.body`. */
function usePortal() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/** Locks page scroll, closes on Escape and restores focus when the overlay closes. */
function useOverlayBehaviour(open: boolean, onClose: () => void, panelRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("[data-autofocus], button, input, textarea, select")?.focus({ preventScroll: true });
    }, 50);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, onClose, panelRef]);
}

const backdrop = (
  <motion.div
    className="absolute inset-0 bg-ink-950/45 backdrop-blur-[2px]"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.25 }}
  />
);

// ─── Bottom sheet ───────────────────────────────────────────────────────────

export function BottomSheet({
  open,
  onClose,
  title,
  children,
  footer,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  const mounted = usePortal();
  const panelRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const titleId = useId();
  const { t } = useI18n();
  useOverlayBehaviour(open, onClose, panelRef);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center" role="presentation">
          <div className="absolute inset-0" onClick={onClose}>
            {backdrop}
          </div>
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            className={cn(
              "relative flex max-h-[88dvh] w-full max-w-[var(--app-max-width)] flex-col rounded-t-[28px] bg-white shadow-2xl",
              className,
            )}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={spring.sheet}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={onDragEnd}
          >
            <div
              className="flex cursor-grab touch-none justify-center pt-3 pb-1 active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
            >
              <span className="h-1.5 w-11 rounded-full bg-ink-200" />
            </div>
            {title && (
              <div
                className="flex items-center justify-between px-5 pt-1 pb-3"
                onPointerDown={(e) => dragControls.start(e)}
              >
                <h2 id={titleId} className="text-lg font-bold">
                  {title}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="grid size-9 place-items-center rounded-full bg-ink-100 text-ink-600 transition-colors hover:bg-ink-200"
                  aria-label={t.common.close}
                >
                  <X className="size-4" />
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
            {footer && <div className="safe-bottom border-t border-ink-100 px-5 pt-3 pb-4">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ─── Confirm dialog ─────────────────────────────────────────────────────────

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = "danger",
  loading,
  icon,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "danger" | "primary";
  loading?: boolean;
  icon?: ReactNode;
}) {
  const mounted = usePortal();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlayBehaviour(open, onClose, panelRef);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] grid place-items-center p-6" role="presentation">
          <div className="absolute inset-0" onClick={onClose}>
            {backdrop}
          </div>
          <motion.div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative w-full max-w-sm rounded-[28px] bg-white p-6 text-center shadow-2xl"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={spring.gentle}
          >
            {icon && (
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ ...spring.bouncy, delay: 0.1 }}
                className={cn(
                  "mx-auto mb-4 grid size-14 place-items-center rounded-2xl",
                  tone === "danger" ? "bg-coral-100 text-coral-600" : "bg-brand-50 text-brand-600",
                )}
              >
                {icon}
              </motion.div>
            )}
            <h2 id={titleId} className="text-lg font-bold">
              {title}
            </h2>
            {body && <p className="mt-2 text-sm text-ink-600">{body}</p>}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={onClose} data-autofocus>
                {cancelLabel}
              </Button>
              <Button variant={tone === "danger" ? "danger" : "primary"} onClick={onConfirm} loading={loading}>
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
