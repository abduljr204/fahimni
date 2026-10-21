"use client";

import { motion } from "motion/react";
import { Check, ChevronLeft, ChevronRight, Star } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { spring, tap } from "@/lib/motion";

// ─── Card ───────────────────────────────────────────────────────────────────

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-3xl bg-white shadow-card", className)} {...props} />;
}

// ─── Badge ──────────────────────────────────────────────────────────────────

const badgeTones = {
  brand: "bg-brand-50 text-brand-700",
  mint: "bg-mint-100 text-mint-600",
  accent: "bg-accent-100 text-accent-600",
  coral: "bg-coral-100 text-coral-600",
  ink: "bg-ink-100 text-ink-600",
  dark: "bg-ink-900/80 text-white backdrop-blur",
};

export function Badge({
  tone = "brand",
  className,
  children,
}: {
  tone?: keyof typeof badgeTones;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        badgeTones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ─── Chip ───────────────────────────────────────────────────────────────────

export function Chip({
  selected,
  onClick,
  children,
  icon,
  className,
  layoutGroup,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
  /** When set, the selected background slides between chips sharing this id. */
  layoutGroup?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={tap}
      aria-pressed={selected}
      className={cn(
        "relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors duration-200",
        selected
          ? layoutGroup
            ? "text-white"
            : "bg-ink-900 text-white"
          : "bg-white text-ink-700 shadow-card hover:text-ink-900",
        className,
      )}
    >
      {selected && layoutGroup && (
        <motion.span
          layoutId={`chip-${layoutGroup}`}
          className="absolute inset-0 rounded-full bg-ink-900"
          transition={spring.snappy}
        />
      )}
      <span className="relative inline-flex items-center gap-1.5">
        {icon}
        {children}
        {selected && !layoutGroup && (
          <motion.span initial={{ scale: 0, width: 0 }} animate={{ scale: 1, width: "auto" }} transition={spring.bouncy}>
            <Check className="size-3.5" aria-hidden />
          </motion.span>
        )}
      </span>
    </motion.button>
  );
}

// ─── Skeleton ───────────────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xl", className)} aria-hidden />;
}

// ─── Rating ─────────────────────────────────────────────────────────────────

export function RatingPill({ rating, count, className }: { rating: number; count?: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-semibold text-ink-800", className)}>
      <Star className="size-4 fill-accent-400 text-accent-400" aria-hidden />
      {rating.toFixed(1)}
      {count && <span className="font-normal text-ink-500">({count})</span>}
    </span>
  );
}

export function Stars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} aria-label={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={cn("size-3.5", i <= Math.round(value) ? "fill-accent-400 text-accent-400" : "text-ink-300")}
          aria-hidden
        />
      ))}
    </span>
  );
}

export function StarInput({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex justify-center gap-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <motion.button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i}`}
          onClick={() => onChange(i)}
          whileTap={{ scale: 0.8 }}
          animate={i <= value ? { scale: [1, 1.25, 1], rotate: [0, -8, 0] } : { scale: 1 }}
          transition={{ duration: 0.35, delay: i <= value ? (i - 1) * 0.04 : 0 }}
          className="p-1"
        >
          <Star
            className={cn(
              "size-9 transition-colors duration-200",
              i <= value ? "fill-accent-400 text-accent-400" : "text-ink-300",
            )}
          />
        </motion.button>
      ))}
    </div>
  );
}

// ─── Switch ─────────────────────────────────────────────────────────────────

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative flex h-7 w-12 shrink-0 items-center rounded-full p-0.5 transition-colors duration-300",
        checked ? "bg-brand-600 justify-end" : "bg-ink-200 justify-start",
      )}
    >
      <motion.span layout transition={spring.snappy} className="size-6 rounded-full bg-white shadow-md" />
    </button>
  );
}

// ─── Directional icon ───────────────────────────────────────────────────────

/** A chevron that points "forward" in the reading direction (left in RTL). */
export function ForwardChevron({ className }: { className?: string }) {
  return (
    <>
      <ChevronLeft className={cn("hidden rtl:block", className)} aria-hidden />
      <ChevronRight className={cn("rtl:hidden", className)} aria-hidden />
    </>
  );
}

export function BackChevron({ className }: { className?: string }) {
  return (
    <>
      <ChevronRight className={cn("hidden rtl:block", className)} aria-hidden />
      <ChevronLeft className={cn("rtl:hidden", className)} aria-hidden />
    </>
  );
}

// ─── Section header ─────────────────────────────────────────────────────────

export function SectionHeader({ title, action, className }: { title: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-lg font-bold text-ink-900">{title}</h2>
      {action}
    </div>
  );
}

// ─── Typing indicator ───────────────────────────────────────────────────────

export function TypingDots({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-2 rounded-full bg-ink-400"
          animate={{ y: [0, -4, 0], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </span>
  );
}
