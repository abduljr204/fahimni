"use client";

import { motion } from "motion/react";
import { Banknote, FlaskConical, Smartphone } from "lucide-react";
import type { ReactNode } from "react";
import { bpsToPercent } from "@/domain/pricing";
import type { LessonPricing } from "@/domain/types";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";

function Line({ label, detail, value, tone, strong }: { label: string; detail?: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <p className={cn("text-sm", strong ? "font-bold text-ink-900" : "text-ink-500")}>{label}</p>
        {detail && <p className="text-[12px] text-ink-400">{detail}</p>}
      </div>
      <motion.span
        key={value}
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn("shrink-0 tabular-nums", strong ? "text-xl font-extrabold text-brand-700" : "text-sm font-semibold", tone)}
      >
        {value}
      </motion.span>
    </div>
  );
}

function PayLine({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-ink-50 px-3 py-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white text-brand-600 shadow-card">{icon}</span>
      <span className="flex-1 text-[13px] font-medium text-ink-700">{label}</span>
      <span className="text-sm font-bold tabular-nums">{value}</span>
    </div>
  );
}

/** Total, commission and tutor share, so every party sees exactly how a lesson price is split. */
export function PriceBreakdown({ pricing, durationMinutes }: { pricing: LessonPricing; durationMinutes: number }) {
  const { t, fmt, money, number } = useI18n();
  const percent = number(bpsToPercent(pricing.commissionBps));

  return (
    <div>
      <Line
        label={t.booking.lessonPrice}
        detail={fmt(t.booking.lessonPriceDetail, { rate: money(pricing.hourlyRate), minutes: durationMinutes })}
        value={money(pricing.total)}
      />
      <Line label={fmt(t.booking.commission, { percent })} value={money(pricing.commission)} tone="text-ink-500" />
      <Line label={t.booking.tutorReceives} value={money(pricing.tutorEarnings)} tone="text-mint-600" />
      <div className="mt-2 border-t border-dashed border-ink-200 pt-2">
        <Line label={t.booking.total} value={money(pricing.total)} strong />
      </div>
      <p className="mt-1 text-[12px] text-ink-500">{t.booking.includedNote}</p>
    </div>
  );
}

/** Where the student's money goes: in the app now, and (for in-person lessons) in cash to the tutor. */
export function PaymentSplit({ pricing, simulated }: { pricing: LessonPricing; simulated?: boolean }) {
  const { t, money } = useI18n();
  const cash = pricing.dueInCash.amountMinor > 0;

  return (
    <div className="space-y-2">
      <PayLine icon={<Smartphone className="size-4" />} label={t.booking.payNowInApp} value={money(pricing.dueInApp)} />
      {cash && <PayLine icon={<Banknote className="size-4" />} label={t.booking.payTutorCash} value={money(pricing.dueInCash)} />}
      <p className="text-[12px] text-ink-500">{cash ? t.booking.cashExplainer : t.booking.onlineExplainer}</p>
      {simulated && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex items-center gap-2 rounded-xl bg-accent-100 px-3 py-2 text-[13px] font-medium text-accent-600"
        >
          <FlaskConical className="size-4 shrink-0" />
          {t.booking.paymentSimulated}
        </motion.div>
      )}
    </div>
  );
}
