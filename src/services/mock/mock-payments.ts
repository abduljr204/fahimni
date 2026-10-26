import type { PaymentService } from "../contracts";
import { ServiceError } from "../errors";
import { latency, mockDb, newId } from "./mock-db";
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
      if (booking.studentId !== actorUserId) throw new ServiceError("forbidden");

      const existing = s.payments.find((p) => p.bookingId === bookingId && p.status === "succeeded");
      if (existing) return { status: "simulated" as const, reference: existing.providerReference, amount: existing.amount };

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
      return { status: "simulated" as const, reference, amount: booking.pricing.dueInApp };
    });
  },
};

/** Declined and cancelled lessons give the in-app payment back, as the payment webhook would in production. */
export function refundBookingPayments(state: MockState, bookingId: string): void {
  const now = new Date().toISOString();
  let refunded = false;
  for (const p of state.payments) {
    if (p.bookingId === bookingId && p.status === "succeeded") {
      p.status = "refunded";
      p.updatedAt = now;
      refunded = true;
    }
  }
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (booking && refunded) booking.paymentStatus = "refunded";
}
