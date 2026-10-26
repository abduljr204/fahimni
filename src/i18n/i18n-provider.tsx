"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { currencyExponent, toMajor } from "@/domain/money";
import type { Locale, LocalizedText, Money } from "@/domain/types";
import type { Dictionary } from "./dictionaries";
import { directions, interpolate, intlLocales, localize } from "./config";

type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

function createI18n(locale: Locale, dict: Dictionary) {
  const tag = intlLocales[locale];
  const plurals = new Intl.PluralRules(tag);
  const dateFmt = new Intl.DateTimeFormat(tag, { weekday: "long", day: "numeric", month: "long" });
  const shortDateFmt = new Intl.DateTimeFormat(tag, { day: "numeric", month: "short" });
  const weekdayFmt = new Intl.DateTimeFormat(tag, { weekday: "short" });
  const timeFmt = new Intl.DateTimeFormat(tag, { hour: "2-digit", minute: "2-digit", hour12: false });
  const numberFmt = new Intl.NumberFormat(tag);
  const relFmt = new Intl.RelativeTimeFormat(tag, { numeric: "auto" });
  const currencyFmts = new Map<string, Intl.NumberFormat>();

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  return {
    locale,
    dir: directions[locale],
    t: dict,
    l: (text: LocalizedText | undefined) => localize(text, locale),
    fmt: interpolate,
    plural(forms: PluralForms, count: number) {
      const key = count === 0 && forms.zero ? "zero" : plurals.select(count);
      return interpolate(forms[key] ?? forms.other, { count: numberFmt.format(count) });
    },
    number: (n: number) => numberFmt.format(n),
    money(m: Money, opts?: { compact?: boolean }) {
      const key = `${m.currency}:${opts?.compact ? 1 : 0}`;
      let f = currencyFmts.get(key);
      if (!f) {
        f = new Intl.NumberFormat(tag, {
          style: "currency",
          currency: m.currency,
          // Exact amounts keep every minor digit (LYD has 3) so price breakdowns always add up.
          maximumFractionDigits: opts?.compact ? 0 : currencyExponent(m.currency),
          minimumFractionDigits: 0,
        });
        currencyFmts.set(key, f);
      }
      return f.format(toMajor(m.amountMinor, m.currency));
    },
    /** Localized currency sign on its own, e.g. "د.ل." in Arabic and "LYD" in English. */
    currencySymbol: (currency: string) =>
      new Intl.NumberFormat(tag, { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency,
    date: (iso: string | Date) => dateFmt.format(new Date(iso)),
    shortDate: (iso: string | Date) => shortDateFmt.format(new Date(iso)),
    weekday: (iso: string | Date) => weekdayFmt.format(new Date(iso)),
    time: (iso: string | Date) => timeFmt.format(new Date(iso)),
    /** "Today", "Tomorrow" or a full date. */
    dayLabel(iso: string | Date) {
      const d = new Date(iso);
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      if (isSameDay(d, now)) return dict.common.today;
      if (isSameDay(d, tomorrow)) return dict.common.tomorrow;
      return dateFmt.format(d);
    },
    relative(iso: string | Date) {
      const diffMs = new Date(iso).getTime() - Date.now();
      const abs = Math.abs(diffMs);
      if (abs < 60_000) return dict.time.now;
      if (abs < 3_600_000) return relFmt.format(Math.round(diffMs / 60_000), "minute");
      if (abs < 86_400_000) return relFmt.format(Math.round(diffMs / 3_600_000), "hour");
      return relFmt.format(Math.round(diffMs / 86_400_000), "day");
    },
    /** Compact timestamp for conversation lists. */
    chatTime(iso: string) {
      const d = new Date(iso);
      const now = new Date();
      if (isSameDay(d, now)) return timeFmt.format(d);
      const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      if (isSameDay(d, yesterday)) return dict.messages.yesterday;
      return shortDateFmt.format(d);
    },
    href: (path: string) => `/${locale}${path === "/" ? "" : path}`,
  };
}

export type I18n = ReturnType<typeof createI18n>;

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dictionary;
  children: ReactNode;
}) {
  const value = useMemo(() => createI18n(locale, dict), [locale, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
