"use client";

import { motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Locale } from "@/domain/types";
import { LOCALE_COOKIE, switchLocalePath } from "@/i18n/config";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

export function useSwitchLocale() {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const change = (next: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    // Read the query at click time; useSearchParams would force a Suspense boundary on every screen.
    const query = window.location.search;
    startTransition(() => router.replace(`${switchLocalePath(pathname ?? "/", next)}${query}`, { scroll: false }));
  };
  return { change, pending };
}

/** Segmented AR / EN toggle. */
export function LanguageSwitch({ className }: { className?: string }) {
  const { locale } = useI18n();
  const { change } = useSwitchLocale();
  const options: { value: Locale; label: string }[] = [
    { value: "ar", label: "العربية" },
    { value: "en", label: "English" },
  ];
  return (
    <div role="radiogroup" aria-label="Language" className={cn("flex rounded-2xl bg-ink-100 p-1", className)}>
      {options.map((o) => {
        const active = o.value === locale;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            lang={o.value}
            onClick={() => !active && change(o.value)}
            className={cn(
              "relative h-9 flex-1 rounded-xl px-3 text-sm font-semibold transition-colors",
              active ? "text-ink-900" : "text-ink-500",
            )}
          >
            {active && (
              <motion.span layoutId="lang-pill" className="absolute inset-0 rounded-xl bg-white shadow-card" transition={spring.snappy} />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
