"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useI18n } from "@/i18n/i18n-provider";

/** `next/link` that prefixes the current locale, e.g. `/tutors` → `/ar/tutors`. */
export function AppLink({ href, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const { href: localize } = useI18n();
  return <Link href={href.startsWith("/") ? localize(href) : href} {...props} />;
}
