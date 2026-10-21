"use client";

import { AnimatePresence, motion } from "motion/react";
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/cn";

interface FieldShellProps {
  label?: string;
  hint?: string;
  error?: string;
  /** Changing this value replays the shake animation (e.g. a submit counter). */
  shakeKey?: number;
  id: string;
  children: ReactNode;
  icon?: ReactNode;
}

function FieldShell({ label, hint, error, shakeKey, id, children, icon }: FieldShellProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-ink-700">
          {label}
        </label>
      )}
      <motion.div
        key={error ? `err-${shakeKey}` : "ok"}
        animate={error ? { x: [0, -6, 6, -4, 4, 0] } : undefined}
        transition={{ duration: 0.4 }}
        className="relative"
      >
        {icon && <span className="pointer-events-none absolute inset-y-0 start-3.5 grid place-items-center text-ink-400">{icon}</span>}
        {children}
      </motion.div>
      <AnimatePresence initial={false} mode="wait">
        {error ? (
          <motion.p
            key="error"
            id={`${id}-error`}
            role="alert"
            initial={{ opacity: 0, height: 0, y: -4 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-1.5 text-[13px] font-medium text-coral-600"
          >
            <CircleAlert className="size-3.5 shrink-0" aria-hidden />
            {error}
          </motion.p>
        ) : hint ? (
          <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[13px] text-ink-500">
            {hint}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

const control =
  "w-full rounded-2xl border bg-white text-[15px] text-ink-900 placeholder:text-ink-400 transition-[border-color,box-shadow] duration-200 outline-none focus:border-brand-400 focus:shadow-[0_0_0_4px_var(--color-brand-100)] disabled:bg-ink-50";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
  shakeKey?: number;
  icon?: ReactNode;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, shakeKey, icon, className, id: idProp, ...props },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell label={label} hint={hint} error={error} shakeKey={shakeKey} id={id} icon={icon}>
      <input
        ref={ref}
        id={id}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(control, "h-12 px-4", icon && "ps-11", error ? "border-coral-400" : "border-ink-200", className)}
        {...props}
      />
    </FieldShell>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: string; error?: string };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, id: idProp, ...props },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell label={label} hint={hint} error={error} id={id}>
      <textarea
        ref={ref}
        id={id}
        aria-invalid={Boolean(error) || undefined}
        className={cn(control, "min-h-24 resize-none px-4 py-3", error ? "border-coral-400" : "border-ink-200", className)}
        {...props}
      />
    </FieldShell>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  error?: string;
  shakeKey?: number;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, shakeKey, className, id: idProp, children, ...props },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <FieldShell label={label} error={error} shakeKey={shakeKey} id={id}>
      <select
        ref={ref}
        id={id}
        aria-invalid={Boolean(error) || undefined}
        className={cn(control, "h-12 appearance-none px-4", error ? "border-coral-400" : "border-ink-200", className)}
        {...props}
      >
        {children}
      </select>
    </FieldShell>
  );
});
