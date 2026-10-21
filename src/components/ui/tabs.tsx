"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

/** Segmented tabs with a sliding indicator. */
export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  items: { value: T; label: string; badge?: number }[];
  className?: string;
}) {
  const id = useId();
  return (
    <div role="tablist" className={cn("flex rounded-2xl bg-ink-100 p-1", className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "relative flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold transition-colors duration-200",
              active ? "text-ink-900" : "text-ink-500 hover:text-ink-700",
            )}
          >
            {active && (
              <motion.span
                layoutId={`tab-${id}`}
                className="absolute inset-0 rounded-xl bg-white shadow-card"
                transition={spring.snappy}
              />
            )}
            <span className="relative">{item.label}</span>
            {item.badge ? (
              <motion.span
                key={item.badge}
                initial={{ scale: 0.4 }}
                animate={{ scale: 1 }}
                transition={spring.bouncy}
                className="relative grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white"
              >
                {item.badge}
              </motion.span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
