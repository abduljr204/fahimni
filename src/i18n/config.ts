import type { Locale, LocalizedText } from "@/domain/types";

export const locales: Locale[] = ["ar", "en"];
export const defaultLocale: Locale = "ar";
export const LOCALE_COOKIE = "NAQRAW_LOCALE";

export const directions: Record<Locale, "rtl" | "ltr"> = { ar: "rtl", en: "ltr" };

/** BCP-47 tags used for Intl formatting. Arabic uses Latin digits, as is common in the Maghreb. */
export const intlLocales: Record<Locale, string> = { ar: "ar-MA-u-nu-latn", en: "en-GB" };

export function hasLocale(value: string): value is Locale {
  return (locales as string[]).includes(value);
}

export function localize(text: LocalizedText | undefined, locale: Locale): string {
  if (!text) return "";
  return text[locale] ?? text.ar ?? text.en ?? "";
}

/** Replaces `{name}` placeholders. */
export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""));
}

/** Swaps the locale prefix of a pathname, e.g. `/ar/tutors` → `/en/tutors`. */
export function switchLocalePath(pathname: string, next: Locale): string {
  const parts = pathname.split("/");
  if (parts[1] && hasLocale(parts[1])) parts[1] = next;
  else parts.splice(1, 0, next);
  return parts.join("/") || `/${next}`;
}
