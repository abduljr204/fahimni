"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { tap } from "@/lib/motion";
import { Spinner } from "./spinner";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "accent" | "dark";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-float hover:brightness-110 disabled:shadow-none",
  secondary: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  outline: "border border-ink-200 bg-white text-ink-800 hover:border-ink-300 hover:bg-ink-50",
  ghost: "text-ink-700 hover:bg-ink-100",
  danger: "bg-coral-500 text-white hover:bg-coral-600",
  accent: "bg-accent-400 text-ink-950 hover:bg-accent-300",
  dark: "bg-ink-900 text-white hover:bg-ink-800",
};

const sizes: Record<Size, string> = {
  sm: "h-9 rounded-xl px-3.5 text-sm gap-1.5",
  md: "h-11 rounded-2xl px-5 text-[15px] gap-2",
  lg: "h-14 rounded-2xl px-6 text-base gap-2.5",
  icon: "size-11 rounded-2xl",
};

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, block, className, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={disabled || loading ? undefined : tap}
      transition={{ type: "spring", stiffness: 600, damping: 30 }}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "relative inline-flex select-none items-center justify-center font-semibold whitespace-nowrap transition-[background-color,border-color,filter,opacity] duration-200 disabled:cursor-not-allowed disabled:opacity-55",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
      {...props}
    >
      <span className={cn("inline-flex items-center gap-[inherit]", loading && "invisible")}>{children}</span>
      {loading && (
        <span className="absolute inset-0 grid place-items-center">
          <Spinner className="size-5" />
        </span>
      )}
    </motion.button>
  );
});
