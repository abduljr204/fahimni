"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";
import { BackChevron } from "../ui/primitives";

/**
 * Wraps every screen with a consistent entrance transition. `variant="push"` slides in
 * from the reading direction, like a native navigation stack.
 */
export function Screen({
  children,
  className,
  variant = "fade",
  withNav = true,
}: {
  children: ReactNode;
  className?: string;
  variant?: "fade" | "push";
  withNav?: boolean;
}) {
  const { dir } = useI18n();
  const offset = dir === "rtl" ? -28 : 28;
  return (
    <motion.main
      initial={variant === "push" ? { opacity: 0, x: offset } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 32, mass: 0.8 }}
      className={cn("min-h-[calc(100dvh-2.25rem)]", withNav && "pb-[calc(var(--nav-height)+2rem)]", className)}
    >
      {children}
    </motion.main>
  );
}

/** Sticky top bar for inner screens with a back button and optional actions. */
export function TopBar({
  title,
  actions,
  transparent,
  backHref,
}: {
  title?: string;
  actions?: ReactNode;
  transparent?: boolean;
  backHref?: string;
}) {
  const router = useRouter();
  const { t, href } = useI18n();
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-16 items-center gap-2 px-3",
        transparent ? "bg-transparent" : "bg-canvas/85 backdrop-blur-xl",
      )}
    >
      <motion.button
        type="button"
        whileTap={{ scale: 0.88 }}
        onClick={() => (window.history.length > 1 ? router.back() : router.push(href(backHref ?? "/")))}
        className="grid size-11 place-items-center rounded-full bg-white text-ink-800 shadow-card"
        aria-label={t.common.back}
      >
        <BackChevron className="size-5" />
      </motion.button>
      {title && (
        <motion.h1
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="min-w-0 flex-1 truncate text-center text-base font-bold"
        >
          {title}
        </motion.h1>
      )}
      {!title && <div className="flex-1" />}
      <div className="flex min-w-11 items-center justify-end gap-2">{actions}</div>
    </header>
  );
}

/** Large title used on top-level tab screens. */
export function PageTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 px-5 pt-6 pb-4">
      <div>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-[26px] leading-tight font-extrabold tracking-tight"
        >
          {title}
        </motion.h1>
        {subtitle && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="mt-1 text-sm text-ink-500"
          >
            {subtitle}
          </motion.p>
        )}
      </div>
      {action}
    </div>
  );
}
