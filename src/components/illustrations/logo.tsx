"use client";

import { motion } from "motion/react";
import { useId } from "react";
import { cn } from "@/lib/cn";

/**
 * Brand mark: a bowl with a dot above — the Arabic letter ن — which also reads as
 * an open book with a spark of an idea.
 */
export function LogoMark({ className, animated = false }: { className?: string; animated?: boolean }) {
  const gradientId = `logo${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 48 48" className={cn("size-10", className)} aria-hidden>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--color-brand-400)" />
          <stop offset="1" stopColor="var(--color-brand-700)" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="15" fill={`url(#${gradientId})`} />
      <motion.path
        d="M12 22c0 8 5.4 13 12 13s12-5 12-13"
        fill="none"
        stroke="white"
        strokeWidth="4.2"
        strokeLinecap="round"
        initial={animated ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.circle
        cx="24"
        cy="14.5"
        r="3.6"
        fill="var(--color-accent-400)"
        initial={animated ? { scale: 0 } : false}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 12, delay: animated ? 0.6 : 0 }}
      />
    </svg>
  );
}

export function Logo({ className, label }: { className?: string; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className="size-9" />
      <span className="text-xl font-extrabold tracking-tight text-ink-900">{label}</span>
    </span>
  );
}
