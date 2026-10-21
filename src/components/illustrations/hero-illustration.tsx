"use client";

import { motion, useReducedMotion } from "motion/react";
import { Atom, BookOpen, Code2, GraduationCap, Sigma, Star, Stethoscope } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

function FloatingTile({
  children,
  className,
  delay = 0,
  duration = 5,
  distance = 10,
  rotate = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  distance?: number;
  rotate?: number;
}) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={cn("absolute grid place-items-center rounded-2xl shadow-card", className)}
      initial={{ opacity: 0, scale: 0.4, rotate: rotate - 15 }}
      animate={{ opacity: 1, scale: 1, rotate }}
      transition={{ type: "spring", stiffness: 260, damping: 16, delay: 0.3 + delay }}
    >
      <motion.div
        className="grid size-full place-items-center"
        animate={reduced ? undefined : { y: [0, -distance, 0] }}
        transition={{ duration, repeat: Infinity, ease: "easeInOut", delay }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

/** Animated hero scene: a floating lesson card orbited by subject tiles. */
export function HeroIllustration({ lessonLabel, tutorName }: { lessonLabel: string; tutorName: string }) {
  const reduced = useReducedMotion();
  return (
    <div className="relative mx-auto aspect-[1.15] w-full max-w-[360px]" aria-hidden>
      {/* Glow + orbit */}
      <motion.div
        className="absolute inset-[12%] rounded-full bg-gradient-to-br from-brand-300/60 via-brand-200/40 to-accent-200/60 blur-2xl"
        animate={reduced ? undefined : { scale: [1, 1.08, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.svg
        viewBox="0 0 200 200"
        className="absolute inset-[6%] size-[88%]"
        initial={{ opacity: 0, rotate: -30 }}
        animate={{ opacity: 1, rotate: 0 }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.circle
          cx="100"
          cy="100"
          r="86"
          fill="none"
          stroke="var(--color-brand-300)"
          strokeWidth="1.2"
          strokeDasharray="4 7"
          animate={reduced ? undefined : { rotate: 360 }}
          style={{ originX: "50%", originY: "50%" }}
          transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
        />
        <circle cx="100" cy="100" r="60" fill="none" stroke="var(--color-brand-200)" strokeWidth="1" />
      </motion.svg>

      {/* Central lesson card */}
      <motion.div
        className="absolute top-1/2 left-1/2 w-[62%] -translate-x-1/2 -translate-y-1/2"
        initial={{ opacity: 0, y: 30, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.15 }}
      >
        <motion.div
          className="rounded-3xl bg-white p-3.5 shadow-[0_24px_50px_-20px_rgb(77_51_201/0.45)]"
          animate={reduced ? undefined : { y: [0, -6, 0], rotate: [-1, 1, -1] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="flex items-center gap-2.5">
            <div className="size-10 shrink-0 rounded-full bg-gradient-to-br from-brand-400 to-brand-700" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="truncate text-[13px] font-bold text-ink-900">{tutorName}</p>
              <div className="flex gap-0.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <motion.span
                    key={i}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 14, delay: 0.8 + i * 0.08 }}
                  >
                    <Star className="size-3 fill-accent-400 text-accent-400" />
                  </motion.span>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-3 space-y-1.5">
            <div className="h-2 w-full rounded-full bg-ink-100" />
            <div className="h-2 w-3/4 rounded-full bg-ink-100" />
          </div>
          <motion.div
            className="mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 py-2 text-[12px] font-bold text-white"
            animate={reduced ? undefined : { scale: [1, 1.04, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
          >
            {lessonLabel}
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Orbiting subject tiles */}
      <FloatingTile className="top-[4%] start-[12%] size-14 bg-accent-300 text-ink-900" delay={0} rotate={-8}>
        <Sigma className="size-7" strokeWidth={2.4} />
      </FloatingTile>
      <FloatingTile className="top-[10%] end-[6%] size-12 bg-white text-brand-600" delay={0.4} duration={6} rotate={10}>
        <Atom className="size-6" />
      </FloatingTile>
      <FloatingTile className="bottom-[14%] start-[2%] size-12 bg-white text-mint-600" delay={0.8} duration={5.5} rotate={6}>
        <Stethoscope className="size-6" />
      </FloatingTile>
      <FloatingTile className="bottom-[4%] end-[14%] size-14 bg-brand-600 text-white" delay={0.2} duration={6.5} rotate={-6}>
        <Code2 className="size-7" />
      </FloatingTile>
      <FloatingTile className="top-[44%] -end-[2%] size-10 bg-coral-400 text-white" delay={1} duration={4.5} rotate={12}>
        <BookOpen className="size-5" />
      </FloatingTile>
      <FloatingTile className="top-[40%] -start-[1%] size-10 bg-mint-400 text-white" delay={0.6} duration={5} rotate={-12}>
        <GraduationCap className="size-5" />
      </FloatingTile>

      {/* Sparkles */}
      {[
        "top-[2%] left-1/2",
        "bottom-[2%] left-[40%]",
        "top-[30%] left-[24%]",
      ].map((pos, i) => (
        <motion.span
          key={pos}
          className={cn("absolute size-2 rounded-full bg-accent-400", pos)}
          animate={reduced ? undefined : { scale: [0, 1, 0], opacity: [0, 1, 0] }}
          transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.8 }}
        />
      ))}
    </div>
  );
}
