"use client";

import { AnimatePresence, motion } from "motion/react";
import { BadgeCheck, BellOff, CalendarCheck, CalendarClock, CalendarX2, CheckCheck, FileText, Flag, MessageCircle, PartyPopper, ShieldAlert, Star, UserX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AppLink } from "@/components/layout/app-link";
import { Screen, TopBar } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, Skeleton } from "@/components/ui/primitives";
import type { AppNotification, NotificationType, UserRole } from "@/domain/types";
import { AuthGate } from "@/features/auth/auth-gate";
import { useMarkAllNotificationsRead, useNotifications } from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";

const meta: Record<NotificationType, { icon: LucideIcon; tone: string }> = {
  booking_requested: { icon: CalendarClock, tone: "bg-accent-100 text-accent-600" },
  booking_confirmed: { icon: CalendarCheck, tone: "bg-mint-100 text-mint-600" },
  booking_declined: { icon: CalendarX2, tone: "bg-coral-100 text-coral-600" },
  booking_cancelled: { icon: CalendarX2, tone: "bg-ink-100 text-ink-600" },
  lesson_reminder: { icon: CalendarClock, tone: "bg-brand-50 text-brand-600" },
  new_message: { icon: MessageCircle, tone: "bg-brand-50 text-brand-600" },
  review_received: { icon: Star, tone: "bg-accent-100 text-accent-600" },
  proposal_received: { icon: FileText, tone: "bg-brand-50 text-brand-600" },
  proposal_accepted: { icon: CalendarCheck, tone: "bg-mint-100 text-mint-600" },
  proposal_declined: { icon: CalendarX2, tone: "bg-coral-100 text-coral-600" },
  application_approved: { icon: BadgeCheck, tone: "bg-mint-100 text-mint-600" },
  application_rejected: { icon: UserX, tone: "bg-coral-100 text-coral-600" },
  report_resolved: { icon: Flag, tone: "bg-brand-50 text-brand-600" },
  account_warning: { icon: ShieldAlert, tone: "bg-coral-100 text-coral-600" },
  welcome: { icon: PartyPopper, tone: "bg-brand-50 text-brand-600" },
};

function targetFor(n: AppNotification, role: UserRole | null): string | undefined {
  if (n.data.conversationId) return `/messages/${n.data.conversationId}`;
  if (n.type === "booking_requested") return role === "tutor" ? "/tutor" : "/lessons";
  if (n.type.startsWith("booking_")) return "/lessons";
  if (n.type === "welcome") return role === "tutor" ? "/tutor" : "/tutors";
  if (n.type.startsWith("application_")) return "/tutor";
  if (n.type === "report_resolved") return "/settings";
  return undefined;
}

function NotificationList() {
  const { t, l, fmt, relative } = useI18n();
  const { role } = useSession();
  const { data, isLoading } = useNotifications();
  const markAll = useMarkAllNotificationsRead();
  const unread = data?.filter((n) => !n.readAt).length ?? 0;

  if (isLoading) {
    return (
      <div className="space-y-3 px-5">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-3xl" />
        ))}
      </div>
    );
  }
  if (!data?.length) return <EmptyState icon={<BellOff />} title={t.notifications.emptyTitle} body={t.notifications.emptyBody} />;

  return (
    <div className="px-5">
      <div className="mb-3 flex justify-end">
        <Button size="sm" variant="ghost" disabled={!unread} loading={markAll.isPending} onClick={() => markAll.mutate()}>
          <CheckCheck className="size-4" /> {t.notifications.markAllRead}
        </Button>
      </div>
      <ul className="space-y-2.5">
        <AnimatePresence initial={false}>
          {data.map((n, i) => {
            const { icon: Icon, tone } = meta[n.type];
            const href = targetFor(n, role);
            const body = (
              <Card className={cn("flex items-start gap-3 p-4 transition-colors", !n.readAt && "bg-brand-50/70 ring-1 ring-brand-100")}>
                <motion.span
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.05 + i * 0.04 }}
                  className={cn("grid size-11 shrink-0 place-items-center rounded-2xl", tone)}
                >
                  <Icon className="size-5" aria-hidden />
                </motion.span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[14px] leading-snug", !n.readAt ? "font-bold text-ink-900" : "text-ink-700")}>
                    {fmt(t.notifications.types[n.type], { name: l(n.data.name), subject: l(n.data.subject) })}
                  </p>
                  <p className="mt-1 text-[12px] text-ink-400">{relative(n.createdAt)}</p>
                </div>
                <AnimatePresence>
                  {!n.readAt && (
                    <motion.span exit={{ scale: 0 }} className="mt-1.5 size-2.5 shrink-0 rounded-full bg-brand-600" aria-hidden />
                  )}
                </AnimatePresence>
              </Card>
            );
            return (
              <motion.li
                key={n.id}
                layout
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 28, delay: i * 0.04 }}
              >
                {href ? (
                  <AppLink href={href} className="block">
                    {body}
                  </AppLink>
                ) : (
                  body
                )}
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}

export function NotificationsScreen() {
  const { t } = useI18n();
  return (
    <Screen variant="push">
      <TopBar title={t.notifications.title} />
      <AuthGate>
        <NotificationList />
      </AuthGate>
    </Screen>
  );
}
