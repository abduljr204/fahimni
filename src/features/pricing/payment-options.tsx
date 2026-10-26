"use client";

import { motion } from "motion/react";
import { Banknote, Check, Smartphone } from "lucide-react";
import type { LessonPricing, Settlement } from "@/domain/types";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

/**
 * Lets the student choose between the payment options the admin enabled. Each option shows
 * exactly what is paid now and what is paid to the tutor, from the same agreed total.
 */
export function PaymentOptionPicker({
  options,
  value,
  onChange,
  pricingFor,
}: {
  options: Settlement[];
  value: Settlement;
  onChange: (s: Settlement) => void;
  pricingFor: (s: Settlement) => LessonPricing;
}) {
  const { t, fmt, money } = useI18n();
  return (
    <div role="radiogroup" aria-label={t.checkout.paymentOption} className="space-y-2.5">
      {options.map((option) => {
        const p = pricingFor(option);
        const selected = option === value;
        return (
          <motion.button
            key={option}
            type="button"
            role="radio"
            aria-checked={selected}
            whileTap={{ scale: 0.98 }}
            onClick={() => onChange(option)}
            className={cn(
              "flex w-full items-start gap-3 rounded-2xl border-2 bg-white p-3.5 text-start transition-colors",
              selected ? "border-brand-500 bg-brand-50/60" : "border-ink-100",
            )}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white text-brand-600 shadow-card">
              {option === "in_app" ? <Smartphone className="size-4" /> : <Banknote className="size-4" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{option === "in_app" ? t.checkout.optionFull : t.checkout.optionDeposit}</span>
              <span className="mt-0.5 block text-[12px] text-ink-500">
                {option === "in_app"
                  ? fmt(t.checkout.optionFullBody, { amount: money(p.dueInApp) })
                  : fmt(t.checkout.optionDepositBody, { now: money(p.dueInApp), cash: money(p.dueInCash) })}
              </span>
            </span>
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors",
                selected ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300",
              )}
            >
              {selected && (
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.bouncy}>
                  <Check className="size-3.5" strokeWidth={3} />
                </motion.span>
              )}
            </span>
          </motion.button>
        );
      })}
      {options.includes("deposit_and_cash") && <p className="text-[12px] text-ink-500">{t.checkout.depositIncluded}</p>}
    </div>
  );
}
