"use client";

import { animate, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/** Counts up to `value` the first time it scrolls into view. */
export function AnimatedNumber({
  value,
  format = (n) => Math.round(n).toString(),
  duration = 1.1,
  className,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (!inView || reduced) return;
    const controls = animate(from.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    from.current = value;
    return () => controls.stop();
  }, [inView, value, duration, reduced]);

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {format(reduced ? value : display)}
    </span>
  );
}

/** Circular progress that draws itself in. */
export function ProgressRing({
  value,
  size = 72,
  stroke = 8,
  className,
  children,
}: {
  value: number; // 0-100
  size?: number;
  stroke?: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-ink-100" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          className="fill-none stroke-brand-500"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          whileInView={{ strokeDashoffset: c * (1 - value / 100) }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

/** Small vertical bar chart with bars that grow in sequence. */
export function BarChart({
  values,
  labels,
  highlightIndex,
  className,
}: {
  values: number[];
  labels: string[];
  highlightIndex?: number;
  className?: string;
}) {
  const max = Math.max(1, ...values);
  return (
    <div className={cn("flex h-36 items-end gap-2", className)}>
      {values.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-2">
          <div className="relative flex h-full w-full items-end">
            <motion.div
              className={cn(
                "w-full rounded-t-xl rounded-b-md",
                i === highlightIndex ? "bg-gradient-to-t from-brand-600 to-brand-400" : "bg-brand-100",
              )}
              initial={{ height: 0 }}
              whileInView={{ height: `${Math.max(6, (v / max) * 100)}%` }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 160, damping: 20, delay: 0.1 + i * 0.06 }}
            />
            {i === highlightIndex && (
              <motion.span
                initial={{ opacity: 0, y: 6 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.7 }}
                className="absolute -top-7 left-1/2 -translate-x-1/2 rounded-lg bg-ink-900 px-1.5 py-0.5 text-[11px] font-bold text-white"
              >
                {v}
              </motion.span>
            )}
          </div>
          <span className={cn("text-[11px]", i === highlightIndex ? "font-bold text-brand-700" : "text-ink-500")}>
            {labels[i]}
          </span>
        </div>
      ))}
    </div>
  );
}
