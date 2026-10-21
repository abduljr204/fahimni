import type { Transition, Variants } from "motion/react";

/** Shared motion tokens so every animation in the app feels like one system. */

export const spring = {
  snappy: { type: "spring", stiffness: 520, damping: 34, mass: 0.7 } satisfies Transition,
  gentle: { type: "spring", stiffness: 260, damping: 28 } satisfies Transition,
  bouncy: { type: "spring", stiffness: 420, damping: 18 } satisfies Transition,
  sheet: { type: "spring", stiffness: 380, damping: 38 } satisfies Transition,
};

export const ease = {
  out: [0.22, 1, 0.36, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: ease.out } },
};

export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.35 } },
};

export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1, transition: spring.gentle },
};

export function stagger(staggerChildren = 0.06, delayChildren = 0): Variants {
  return { hidden: {}, show: { transition: { staggerChildren, delayChildren } } };
}

/** Standard press feedback for tappable elements. */
export const tap = { scale: 0.96 };
