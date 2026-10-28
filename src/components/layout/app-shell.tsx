"use client";

import { Suspense, useCallback, type ReactNode } from "react";
import { ServerCrash, ShieldX } from "lucide-react";
import { appConfig } from "@/config/app-config";
import type { AppNotification } from "@/domain/types";
import { DemoBanner } from "@/features/demo/demo-banner";
import { DesktopGuide } from "@/features/demo/desktop-guide";
import { DEFAULT_PREFERENCES, wantsDelivery } from "@/domain/notifications";
import { usePreferences, useRealtimeSync } from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { productionServicesReady } from "@/services/supabase";
import { Button } from "../ui/button";
import { EmptyState } from "../ui/empty-state";
import { useToast } from "../ui/toast";
import { BottomNav } from "./bottom-nav";
import { useAppPath } from "./use-app-path";

function RealtimeToasts() {
  const { t, l, fmt } = useI18n();
  const toast = useToast();
  const path = useAppPath();
  const { data: prefs } = usePreferences();

  const onNotification = useCallback(
    (n: AppNotification) => {
      // Don't toast a chat message the user is already reading.
      if (n.type === "new_message" && path === `/messages/${n.data.conversationId}`) return;
      const text = fmt(t.notifications.types[n.type], { name: l(n.data.name), subject: l(n.data.subject) });
      // While the app is in the background, show a real device notification if the user allowed it.
      // Production delivers these with Web Push from the server, so they arrive even when the app is closed.
      if (
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        document.visibilityState === "hidden" &&
        wantsDelivery(prefs ?? DEFAULT_PREFERENCES, "push", n.type)
      ) {
        new Notification(t.common.appName, { body: text, tag: n.id, icon: "/icon.svg" });
      }
      const tone = n.type === "booking_declined" || n.type === "booking_cancelled" ? "info" : "success";
      toast.show({ tone, title: text, description: appConfig.isPrototype ? t.demo.simulated : undefined });
    },
    [t, l, fmt, toast, path, prefs],
  );

  useRealtimeSync(onNotification);
  return null;
}

/** Suspended accounts can't use the app; they can only sign out. */
function SuspendedNotice() {
  const { t } = useI18n();
  const { session, signOut } = useSession();
  if (!session?.user.suspendedAt) return null;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-canvas p-6">
      <EmptyState
        icon={<ShieldX />}
        title={t.errors.accountSuspended}
        body={t.auth.suspended}
        action={
          <Button variant="outline" onClick={() => void signOut()}>
            {t.profile.signOut}
          </Button>
        }
      />
    </div>
  );
}

function ProductionNotConfigured() {
  const { t } = useI18n();
  return (
    <div className="grid min-h-dvh place-items-center">
      <EmptyState
        icon={<ServerCrash />}
        title={t.errors.productionNotConfigured}
        body={t.errors.productionNotConfiguredBody}
      />
    </div>
  );
}

/**
 * Phone-first frame: the app is a single column capped at --app-max-width. On large
 * screens it floats in the centre with a presenter guide beside it.
 */
export function AppShell({ children }: { children: ReactNode }) {
  if (!appConfig.isPrototype && !productionServicesReady) return <ProductionNotConfigured />;

  return (
    <>
      <div
        className="pointer-events-none fixed inset-0 -z-10 hidden bg-[radial-gradient(circle_at_15%_20%,var(--color-brand-100),transparent_45%),radial-gradient(circle_at_85%_80%,var(--color-accent-100),transparent_40%)] md:block"
        aria-hidden
      />
      {/* Shell pieces read the URL, so they stream in after the static shell. */}
      {appConfig.isPrototype && (
        <Suspense fallback={null}>
          <DesktopGuide />
        </Suspense>
      )}
      <div className="relative mx-auto min-h-dvh w-full max-w-[var(--app-max-width)] bg-canvas md:shadow-[0_0_80px_-30px_rgb(24_22_58/0.35)]">
        <DemoBanner />
        {children}
        <Suspense fallback={null}>
          <BottomNav />
        </Suspense>
      </div>
      <Suspense fallback={null}>
        <RealtimeToasts />
      </Suspense>
      <SuspendedNotice />
    </>
  );
}
