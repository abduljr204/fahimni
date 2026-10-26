import { isPaidAndConfirmed } from "@/domain/access";
import type { Money } from "@/domain/types";
import type { PaymentService } from "../contracts";
import { ServiceError } from "../errors";
import { isUnlocked, requireActsForStudent } from "./access";
import { latency, mockDb, newId } from "./mock-db";
import { postSystemMessage } from "./mock-messaging";
import type { MockState } from "./seed";

/**
 * Simulated payments: never contacts a provider and never moves money. Every record
 * is stored with `provider: "simulated"` so it can't be mistaken for a real charge.
 * The production version runs on the server (see `src/services/payments/provider.ts`).
 */
export const mockPaymentService: PaymentService = {
  kind: "simulated",

  async payForBooking(actorUserId, bookingId) {
    await latency(300, 500);
    return mockDb.mutate((s) => {
      const booking = s.bookings.find((b) => b.id === bookingId);
      if (!booking) throw new ServiceError("not_found");
      // The student pays, or their parent for a managed student.
      requireActsForStudent(s, actorUserId, booking.studentId);
      if (booking.status === "declined" || booking.status === "cancelled") throw new ServiceError("validation");

      const existing = s.payments.find((p) => p.bookingId === bookingId && p.status === "succeeded");
      if (existing) return { status: "simulated" as const, reference: existing.providerReference, amount: existing.amount };

      const wasUnlocked = isUnlocked(s, booking.studentId, booking.tutorId);
      const now = new Date().toISOString();
      const reference = newId("sim-pay");
      s.payments.push({
        id: newId("pay"),
        bookingId,
        payerId: actorUserId,
        amount: booking.pricing.dueInApp,
        purpose: booking.pricing.settlement === "in_app" ? "lesson" : "commission_deposit",
        provider: "simulated",
        providerReference: reference,
        status: "succeeded",
        createdAt: now,
        updatedAt: now,
        isDemo: true,
      });
      booking.paymentStatus = "simulated";
      booking.updatedAt = now;
      if (!wasUnlocked && isPaidAndConfirmed(booking)) postSystemMessage(s, booking.studentId, booking.tutorId, "contact_unlocked");
      return { status: "simulated" as const, reference, amount: booking.pricing.dueInApp };
    });
  },
};

/**
 * Gives back `amount` of the booking's in-app payment (all of it when omitted), as the
 * payment webhook would in production. If this was the pair's last paid booking, the
 * conversation goes back to pre-booking rules.
 */
export function refundBookingPayments(state: MockState, bookingId: string, amount?: Money): void {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return;
  const now = new Date().toISOString();
  let refunded = false;
  for (const p of state.payments) {
    if (p.bookingId !== bookingId || p.status !== "succeeded") continue;
    const refund = Math.min(p.amount.amountMinor, amount?.amountMinor ?? p.amount.amountMinor);
    if (refund <= 0) continue;
    p.status = refund === p.amount.amountMinor ? "refunded" : "partially_refunded";
    p.refundedAmount = { currency: p.amount.currency, amountMinor: refund };
    p.updatedAt = now;
    refunded = true;
    booking.paymentStatus = p.status === "refunded" ? "refunded" : "partially_refunded";
  }
  if (refunded) booking.updatedAt = now;
}

/** Call after a booking stops being confirmed: re-locks contact sharing when nothing paid remains. */
export function relockIfNeeded(state: MockState, studentUserId: string, tutorId: string): void {
  if (isUnlocked(state, studentUserId, tutorId)) return;
  const c = state.conversations.find((x) => x.studentId === studentUserId && x.tutorId === tutorId);
  const lastEvent = state.messages.filter((m) => m.conversationId === c?.id && m.kind === "system").at(-1)?.systemEvent;
  if (lastEvent === "contact_unlocked") postSystemMessage(state, studentUserId, tutorId, "contact_locked");
}
