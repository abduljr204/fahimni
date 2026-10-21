"use client";

import { AnimatePresence, motion } from "motion/react";
import { Search, SlidersHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";

/** Search field with a rotating, animated placeholder of popular courses. */
export function HomeSearch() {
  const { t, href } = useI18n();
  const router = useRouter();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [index, setIndex] = useState(0);
  const suggestions = t.home.searchSuggestions;

  useEffect(() => {
    if (focused || value) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % suggestions.length), 2600);
    return () => window.clearInterval(id);
  }, [focused, value, suggestions.length]);

  const submit = (q: string) => router.push(href(q.trim() ? `/tutors?q=${encodeURIComponent(q.trim())}` : "/tutors"));

  return (
    <motion.form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        submit(value);
      }}
      animate={{ scale: focused ? 1.015 : 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className={cn(
        "relative flex h-14 items-center gap-2 rounded-2xl bg-white ps-4 pe-2 transition-shadow duration-300",
        focused ? "shadow-[0_0_0_4px_var(--color-brand-100),0_18px_40px_-18px_rgb(93_65_230/0.5)]" : "shadow-card",
      )}
    >
      <motion.span animate={{ rotate: focused ? -12 : 0, scale: focused ? 1.1 : 1 }} className="text-brand-500">
        <Search className="size-5" aria-hidden />
      </motion.span>
      <div className="relative h-full flex-1">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          aria-label={t.search.placeholder}
          enterKeyHint="search"
          className="h-full w-full bg-transparent text-[15px] outline-none"
        />
        {!value && (
          <div className="pointer-events-none absolute inset-0 flex items-center gap-1.5 overflow-hidden text-[15px] text-ink-400">
            <span>{t.home.searchPlaceholder}</span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={index}
                initial={{ y: 18, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -18, opacity: 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                className="font-semibold text-ink-600"
              >
                {suggestions[index]}
              </motion.span>
            </AnimatePresence>
          </div>
        )}
      </div>
      <motion.button
        type="submit"
        whileTap={{ scale: 0.9 }}
        className="grid size-10 place-items-center rounded-xl bg-ink-900 text-white"
        aria-label={t.search.filters}
      >
        <SlidersHorizontal className="size-[18px]" aria-hidden />
      </motion.button>
    </motion.form>
  );
}
