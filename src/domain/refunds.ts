import { FREE_CANCELLATION_HOURS } from "./booking-rules";
import type { Booking, ISODateTime, Money } from "./types";

/**
 * Cancellation and refund terms, shown to the student before they pay and applied by the
 * service when a booking is declined or cancelled. Only the in-app part can be refunded;
 * cash for in-person lessons is paid at the lesson, so nothing is owed if it never happens.
 *
 *  - Tutor declines or cancels, at any time: full refund.
 *  - Student cancels at least FREE_CANCELLATION_HOURS before: full refund.
 *  - Student cancels later: the platform fee is kept, the rest of the in-app payment is refunded.
 */

export type RefundRule = "tutor_cancelled" | "free_window" | "late_cancellation";

export interface RefundQuote {
  rule: RefundRule;
  refund: Money;
  /** Kept by the platform. */
  retained: Money;
}

export function freeCancellationDeadline(startsAt: ISODateTime): Date {
  return new Date(new Date(startsAt).getTime() - FREE_CANCELLATION_HOURS * 3_600_000);
}

export function refundFor(
  booking: Pick<Booking, "startsAt" | "pricing">,
  cancelledBy: "student" | "tutor",
  now = new Date(),
): RefundQuote {
  const paid = booking.pricing.dueInApp;
  const currency = paid.currency;
  if (cancelledBy === "tutor") return { rule: "tutor_cancelled", refund: { ...paid }, retained: { currency, amountMinor: 0 } };
  if (now <= freeCancellationDeadline(booking.startsAt)) {
    return { rule: "free_window", refund: { ...paid }, retained: { currency, amountMinor: 0 } };
  }
  const retainedMinor = Math.min(paid.amountMinor, booking.pricing.commission.amountMinor);
  return {
    rule: "late_cancellation",
    refund: { currency, amountMinor: paid.amountMinor - retainedMinor },
    retained: { currency, amountMinor: retainedMinor },
  };
}
