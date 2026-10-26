import { priceForDuration } from "./booking-rules";
import type { LessonMode, LessonPricing, Money, PlatformSettings, Settlement } from "./types";

/**
 * Pure pricing rules shared by every backend. The database functions in
 * supabase/migrations apply exactly the same arithmetic.
 */

export const BPS_PER_PERCENT = 100;
/** Admins can't set a commission above this. */
export const MAX_COMMISSION_BPS = 5000;
export const SETTLEMENTS: Settlement[] = ["in_app", "deposit_and_cash"];

export function percentToBps(percent: number): number {
  return Math.round(percent * BPS_PER_PERCENT);
}

export function bpsToPercent(bps: number): number {
  return bps / BPS_PER_PERCENT;
}

/** Payment options a student may choose for a lesson. Online lessons are always paid in full in the app. */
export function allowedSettlements(mode: LessonMode, settings: Pick<PlatformSettings, "inPersonPaymentOptions">): Settlement[] {
  if (mode === "online") return ["in_app"];
  const options = SETTLEMENTS.filter((s) => settings.inPersonPaymentOptions.includes(s));
  return options.length ? options : ["in_app"];
}

/** The option pre-selected at checkout: the deposit when available, as it is the lighter upfront payment. */
export function defaultSettlement(mode: LessonMode, settings: Pick<PlatformSettings, "inPersonPaymentOptions">): Settlement {
  const options = allowedSettlements(mode, settings);
  return options.includes("deposit_and_cash") ? "deposit_and_cash" : options[0];
}

function amount(currency: string, amountMinor: number): Money {
  return { currency, amountMinor };
}

/**
 * Splits a lesson price into the platform commission and the tutor's earnings, and works
 * out what is paid in the app now and what goes to the tutor in cash. The deposit is part
 * of the total, never an extra fee.
 */
export function priceLesson(params: {
  hourlyRate: Money;
  durationMinutes: number;
  mode: LessonMode;
  commissionBps: number;
  settlement?: Settlement;
}): LessonPricing {
  const { hourlyRate, durationMinutes, mode, commissionBps } = params;
  const total = priceForDuration(hourlyRate, durationMinutes);
  const { currency } = total;
  const commissionMinor = Math.round((total.amountMinor * commissionBps) / 10_000);
  const tutorMinor = total.amountMinor - commissionMinor;
  // Cash on the spot only makes sense when both people are in the same room.
  const settlement: Settlement = mode === "online" ? "in_app" : (params.settlement ?? "deposit_and_cash");
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

/** The same agreed price, paid with a different option. */
export function withSettlement(pricing: LessonPricing, durationMinutes: number, mode: LessonMode, settlement: Settlement): LessonPricing {
  return priceLesson({ hourlyRate: pricing.hourlyRate, durationMinutes, mode, commissionBps: pricing.commissionBps, settlement });
}

export function isRateWithinLimits(rate: Money, settings: Pick<PlatformSettings, "minHourlyRate" | "maxHourlyRate">): boolean {
  return rate.amountMinor >= settings.minHourlyRate.amountMinor && rate.amountMinor <= settings.maxHourlyRate.amountMinor;
}

/** What a tutor keeps from one hour at the given rate. */
export function hourlyEarnings(rate: Money, commissionBps: number): Money {
  return priceLesson({ hourlyRate: rate, durationMinutes: 60, mode: "online", commissionBps }).tutorEarnings;
}
