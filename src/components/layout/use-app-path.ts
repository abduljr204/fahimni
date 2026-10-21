"use client";

import { usePathname } from "next/navigation";
import { hasLocale } from "@/i18n/config";

/** Current pathname without the locale prefix, e.g. `/ar/tutors/t-1` → `/tutors/t-1`. */
export function useAppPath(): string {
  const pathname = usePathname() ?? "/";
  const parts = pathname.split("/");
  if (parts[1] && hasLocale(parts[1])) parts.splice(1, 1);
  return parts.join("/") || "/";
}
