"use client";

import { CalendarCheck, CalendarX2, Info, UserX } from "lucide-react";
import type { ReactNode } from "react";
import { freeCancellationDeadline, refundFor } from "@/domain/refunds";
import type { LessonPricing } from "@/domain/types";
import { useI18n } from "@/i18n/i18n-provider";

function Term({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-2.5 text-[13px] text-ink-700">
      <span className="mt-0.5 shrink-0 text-brand-600">{icon}</span>
      <span>{children}</span>
    </li>
  );
}

/**
 * Cancellation and refund terms for this exact lesson and payment option, shown before the
 * student pays. The amounts come from `domain/refunds.ts`, the same rules the service applies.
 */
export function CancellationTerms({ pricing, startsAt }: { pricing: LessonPricing; startsAt: string }) {
  const { t, fmt, money, date, time } = useI18n();
  const deadline = freeCancellationDeadline(startsAt);
  // A moment after the deadline shows what a late cancellation would cost.
  const late = refundFor({ startsAt, pricing }, "student", new Date(deadline.getTime() + 60_000));

  return (
    <ul className="space-y-2.5">
      <Term icon={<CalendarCheck className="size-4" />}>
        {fmt(t.checkout.termsFree, { date: `${date(deadline)} ${time(deadline)}`, amount: money(pricing.dueInApp) })}
      </Term>
      <Term icon={<CalendarX2 className="size-4" />}>
        {late.refund.amountMinor > 0
          ? fmt(t.checkout.termsLate, { fee: money(late.retained), refund: money(late.refund) })
          : fmt(t.checkout.termsLateNoRefund, { fee: money(late.retained) })}
      </Term>
      <Term icon={<UserX className="size-4" />}>{t.checkout.termsTutor}</Term>
      {pricing.dueInCash.amountMinor > 0 && <Term icon={<Info className="size-4" />}>{t.checkout.termsCash}</Term>}
    </ul>
  );
}
