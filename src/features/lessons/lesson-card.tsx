"use client";

import { motion } from "motion/react";
import { Banknote, CalendarDays, Clock, MapPin, Video, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge, Card } from "@/components/ui/primitives";
import type { BookingDetails, BookingStatus } from "@/domain/types";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";

export const statusTone: Record<BookingStatus, "brand" | "mint" | "accent" | "coral" | "ink"> = {
  pending: "accent",
  confirmed: "mint",
  declined: "coral",
  cancelled: "ink",
  completed: "brand",
};

/** Who pays what, from each party's point of view. */
function PaymentLine({
  booking,
  perspective,
  highlight,
  active,
}: {
  booking: BookingDetails;
  perspective: "student" | "tutor";
  highlight?: boolean;
  active: boolean;
}) {
  const { t, fmt, money } = useI18n();
  const { pricing } = booking;
  const cash = pricing.dueInCash.amountMinor > 0;
  const refunded = booking.paymentStatus === "refunded";
  const collecting = active && cash;

  let text: string | undefined;
  if (refunded) text = t.lessons.refunded;
  else if (perspective === "tutor" && (active || booking.status === "completed")) {
    text = collecting
      ? fmt(t.lessons.collectCash, { amount: money(pricing.dueInCash) })
      : fmt(t.lessons.youReceive, { amount: money(pricing.tutorEarnings) });
  } else if (perspective === "student" && active) {
    text = fmt(t.lessons.paidInApp, { amount: money(pricing.dueInApp) });
    if (cash) text += ` · ${fmt(t.lessons.payCash, { amount: money(pricing.dueInCash) })}`;
  }
  if (!text) return null;

  const Icon = collecting ? Banknote : Wallet;
  return (
    <p className={cn("mt-2 flex items-center gap-1.5 text-[12px] font-medium", highlight ? "text-white/80" : "text-ink-500")}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {text}
    </p>
  );
}

/** Lesson summary used on the home screen, lessons list and tutor dashboard. */
export function LessonCard({
  booking,
  perspective = "student",
  actions,
  highlight,
  index = 0,
}: {
  booking: BookingDetails;
  perspective?: "student" | "tutor";
  actions?: ReactNode;
  highlight?: boolean;
  index?: number;
}) {
  const { t, l, dayLabel, time, money, fmt, relative } = useI18n();
  const person = perspective === "student" ? booking.tutor : booking.student;
  const upcoming = new Date(booking.startsAt) > new Date() && (booking.status === "confirmed" || booking.status === "pending");

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 300, damping: 30, delay: Math.min(index, 6) * 0.05 }}
    >
      <Card
        className={cn(
          "overflow-hidden",
          highlight && "bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-float",
        )}
      >
        <div className="p-4">
          <div className="flex items-start gap-3">
            <Avatar name={l(person.displayName)} hue={person.avatarHue} src={person.avatarUrl} size="md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={cn("truncate text-[15px] font-bold", highlight ? "text-white" : "text-ink-900")}>
                    {l(booking.subject.name)}
                  </p>
                  <p className={cn("truncate text-[13px]", highlight ? "text-white/75" : "text-ink-500")}>
                    {perspective === "student" ? l(person.displayName) : fmt(t.lessons.withStudent, { name: l(person.displayName) })}
                  </p>
                </div>
                {highlight ? (
                  <Badge tone="dark" className="bg-white/20">
                    {fmt(t.lessons.startsIn, { time: relative(booking.startsAt) })}
                  </Badge>
                ) : (
                  <Badge tone={statusTone[booking.status]}>{t.lessons.status[booking.status]}</Badge>
                )}
              </div>
            </div>
          </div>

          <div
            className={cn(
              "mt-3.5 grid grid-cols-3 gap-2 rounded-2xl p-2.5 text-[12px]",
              highlight ? "bg-white/12" : "bg-ink-50",
            )}
          >
            <span className="flex items-center gap-1.5 truncate">
              <CalendarDays className="size-3.5 shrink-0 opacity-70" aria-hidden />
              <span className="truncate">{dayLabel(booking.startsAt)}</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5 shrink-0 opacity-70" aria-hidden />
              {time(booking.startsAt)} · {booking.durationMinutes}
              {t.common.minutes}
            </span>
            <span className="flex items-center justify-end gap-1.5 font-semibold">
              {booking.mode === "online" ? (
                <Video className="size-3.5 opacity-70" aria-hidden />
              ) : (
                <MapPin className="size-3.5 opacity-70" aria-hidden />
              )}
              {money(booking.pricing.total, { compact: true })}
            </span>
          </div>
          <PaymentLine booking={booking} perspective={perspective} highlight={highlight} active={upcoming} />
          {booking.note && perspective === "tutor" && upcoming && (
            <p className="mt-3 rounded-2xl border border-dashed border-ink-200 p-2.5 text-[13px] text-ink-600">
              <span className="font-semibold text-ink-800">{t.dashboard.studentNote}: </span>
              {booking.note}
            </p>
          )}
          {actions && <div className="mt-3.5 flex gap-2">{actions}</div>}
        </div>
      </Card>
    </motion.div>
  );
}
