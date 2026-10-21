import type { Locale } from "@/domain/types";
import ar, { type Dictionary } from "./ar";
import en from "./en";

export type { Dictionary };

const dictionaries: Record<Locale, Dictionary> = { ar, en };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale];
}
