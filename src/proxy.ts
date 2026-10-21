import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, hasLocale, LOCALE_COOKIE } from "@/i18n/config";

/**
 * Locale routing: every page lives under `/ar` or `/en`. Requests without a locale
 * are redirected to the visitor's saved choice, or Arabic by default.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1];
  if (first && hasLocale(first)) return;

  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = saved && hasLocale(saved) ? saved : defaultLocale;
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals, Vercel Analytics, API routes and files with an extension (icons, images…).
  matcher: ["/((?!_next|_vercel|api|.*\\..*).*)"],
};
