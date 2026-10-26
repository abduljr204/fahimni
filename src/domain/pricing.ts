import { priceForDuration } from "./booking-rules";
import type { LessonMode, LessonPricing, Money, PlatformSettings, Settlement } from "./types";

/**
 * Pure pricing rules shared by every backend. The database function `create_booking`
 * (supabase/migrations/0002_pricing.sql) applies exactly the same arithmetic.
 */

export const BPS_PER_PERCENT = 100;
/** Admins can't set a commission above this. */
export const MAX_COMMISSION_BPS = 5000;

export function percentToBps(percent: number): number {
  return Math.round(percent * BPS_PER_PERCENT);
}

export function bpsToPercent(bps: number): number {
  return bps / BPS_PER_PERCENT;
}

export function settlementFor(mode: LessonMode): Settlement {
  return mode === "in_person" ? "deposit_and_cash" : "in_app";
}

function amount(currency: string, amountMinor: number): Money {
  return { currency, amountMinor };
}

/** Splits a lesson price into the platform commission and the tutor's earnings, and works out who pays what, where. */
export function priceLesson(params: {
  hourlyRate: Money;
  durationMinutes: number;
  mode: LessonMode;
  commissionBps: number;
}): LessonPricing {
  const { hourlyRate, durationMinutes, mode, commissionBps } = params;
  const total = priceForDuration(hourlyRate, durationMinutes);
  const { currency } = total;
  const commissionMinor = Math.round((total.amountMinor * commissionBps) / 10_000);
  const tutorMinor = total.amountMinor - commissionMinor;
  const settlement = settlementFor(mode);
  const dueInAppMinor = settlement === "in_app" ? total.amountMinor : commissionMinor;

  return {
    hourlyRate: { ...hourlyRate },
    total,
    commissionBps,
    commission: amount(currency, commissionMinor),
    tutorEarnings: amount(currency, tutorMinor),
    settlement,
    dueInApp: amount(currency, dueInAppMinor),
    dueInCash: amount(currency, total.amountMinor - dueInAppMinor),
  };
}

export function isRateWithinLimits(rate: Money, settings: Pick<PlatformSettings, "minHourlyRate" | "maxHourlyRate">): boolean {
  return rate.amountMinor >= settings.minHourlyRate.amountMinor && rate.amountMinor <= settings.maxHourlyRate.amountMinor;
}

/** What a tutor keeps from one hour at the given rate. */
export function hourlyEarnings(rate: Money, commissionBps: number): Money {
  return priceLesson({ hourlyRate: rate, durationMinutes: 60, mode: "online", commissionBps }).tutorEarnings;
}
