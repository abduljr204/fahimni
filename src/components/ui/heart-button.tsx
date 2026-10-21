"use client";

import { AnimatePresence, motion } from "motion/react";
import { Heart } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/cn";

const PARTICLES = 8;

/** Favourite toggle with a pop and a small particle burst when liked. */
export function HeartButton({
  active,
  onToggle,
  label,
  className,
  size = "md",
}: {
  active: boolean;
  onToggle: () => void;
  label: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const [burst, setBurst] = useState(0);

  return (
    <motion.button
      type="button"
      aria-pressed={active}
      aria-label={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!active) setBurst((b) => b + 1);
        onToggle();
      }}
      whileTap={{ scale: 0.82 }}
      className={cn(
        "relative grid place-items-center rounded-full bg-white/90 shadow-card backdrop-blur",
        size === "sm" ? "size-9" : "size-11",
        className,
      )}
    >
      <motion.span
        key={active ? "on" : "off"}
        initial={{ scale: active ? 0.4 : 1 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 12 }}
      >
        <Heart
          className={cn(
            size === "sm" ? "size-[18px]" : "size-5",
            "transition-colors duration-200",
            active ? "fill-coral-500 text-coral-500" : "text-ink-600",
          )}
          aria-hidden
        />
      </motion.span>
      <AnimatePresence>
        {burst > 0 && active && (
          <motion.span key={burst} className="pointer-events-none absolute inset-0" aria-hidden>
            {Array.from({ length: PARTICLES }).map((_, i) => {
              const angle = (i / PARTICLES) * Math.PI * 2;
              return (
                <motion.span
                  key={i}
                  className="absolute top-1/2 left-1/2 size-1.5 rounded-full"
                  style={{ background: i % 2 ? "var(--color-coral-400)" : "var(--color-accent-400)" }}
                  initial={{ x: "-50%", y: "-50%", opacity: 1, scale: 1 }}
                  animate={{
                    x: `calc(-50% + ${Math.cos(angle) * 22}px)`,
                    y: `calc(-50% + ${Math.sin(angle) * 22}px)`,
                    opacity: 0,
                    scale: 0.4,
                  }}
                  transition={{ duration: 0.55, ease: "easeOut" }}
                />
              );
            })}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}
