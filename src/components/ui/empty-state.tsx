"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

/** Friendly empty state with a softly floating illustration. */
export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={cn("flex flex-col items-center px-6 py-10 text-center", className)}
    >
      <div className="relative mb-5 grid size-28 place-items-center">
        <motion.span
          className="absolute inset-0 rounded-[38%] bg-gradient-to-br from-brand-100 to-accent-100"
          animate={reduced ? undefined : { rotate: [0, 8, -6, 0], scale: [1, 1.04, 1] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.span
          className="absolute -end-1 top-3 size-3 rounded-full bg-accent-400"
          animate={reduced ? undefined : { y: [0, -6, 0] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
        <motion.span
          className="absolute start-1 bottom-4 size-2 rounded-full bg-brand-400"
          animate={reduced ? undefined : { y: [0, 5, 0] }}
          transition={{ duration: 3.6, repeat: Infinity }}
        />
        <motion.span
          initial={{ scale: 0.5, rotate: -10 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ ...spring.bouncy, delay: 0.1 }}
          className="relative text-brand-600 [&_svg]:size-11"
        >
          {icon}
        </motion.span>
      </div>
      <h3 className="text-base font-bold text-ink-900">{title}</h3>
      {body && <p className="mt-1.5 max-w-xs text-sm text-ink-500">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </motion.div>
  );
}
