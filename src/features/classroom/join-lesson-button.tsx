"use client";

import { FlaskConical, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { appConfig } from "@/config/app-config";
import { classroomWindow, isPaidAndConfirmed } from "@/domain/access";
import type { BookingDetails } from "@/domain/types";
import { usePlatformSettings } from "@/hooks/use-data";
import { useNow } from "@/hooks/use-now";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";

/**
 * "Join lesson" for a confirmed, paid online lesson. Opens the classroom page, which asks
 * the server for access; this button only reflects the schedule, it grants nothing itself.
 */
export function JoinLessonButton({ booking, className, highlight }: { booking: BookingDetails; className?: string; highlight?: boolean }) {
  const { t, fmt, time, dayLabel, href } = useI18n();
  const router = useRouter();
  const now = useNow();
  const { data: settings } = usePlatformSettings();
  if (booking.mode !== "online" || !isPaidAndConfirmed(booking) || !settings) return null;

  const { opensAt, closesAt } = classroomWindow(booking, settings);
  const open = now !== null && now >= opensAt.getTime() && now <= closesAt.getTime();
  const go = (demo: boolean) => router.push(href(`/classroom/${booking.id}${demo ? "?demo=1" : ""}`));

  if (open) {
    return (
      <Button size="sm" variant={highlight ? "accent" : "primary"} className={cn("flex-1", className)} onClick={() => go(false)}>
        <Video className="size-4" /> {t.lessons.join}
      </Button>
    );
  }
  return (
    <div className={cn("flex flex-1 flex-col gap-1", className)}>
      <Button size="sm" variant={highlight ? "dark" : "secondary"} disabled className="w-full">
        <Video className="size-4" />
        <span className="truncate">{fmt(t.lessons.opensAt, { time: `${dayLabel(opensAt)} ${time(opensAt)}` })}</span>
      </Button>
      {appConfig.isPrototype && (
        <button
          type="button"
          onClick={() => go(true)}
          className={cn("inline-flex items-center justify-center gap-1 text-[12px] font-semibold", highlight ? "text-accent-300" : "text-accent-600")}
        >
          <FlaskConical className="size-3.5" /> {t.lessons.demoEnter}
        </button>
      )}
    </div>
  );
}
