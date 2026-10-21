"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { useState, type ReactNode } from "react";
import type { Locale } from "@/domain/types";
import { ToastProvider } from "@/components/ui/toast";
import { SessionProvider } from "@/hooks/use-session";
import type { Dictionary } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/i18n-provider";

export function Providers({ locale, dict, children }: { locale: Locale; dict: Dictionary; children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider locale={locale} dict={dict}>
        {/* "user" disables transform/layout animations when the OS asks for reduced motion. */}
        <MotionConfig reducedMotion="user">
          <ToastProvider>
            <SessionProvider>{children}</SessionProvider>
          </ToastProvider>
        </MotionConfig>
      </I18nProvider>
    </QueryClientProvider>
  );
}
