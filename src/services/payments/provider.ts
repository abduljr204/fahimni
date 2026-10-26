import "server-only";
import { serverConfig } from "@/config/server-config";
import type { Money, PaymentPurpose } from "@/domain/types";
import { ServiceError } from "../errors";

/**
 * Integration point for a real payment gateway (production only).
 *
 * The browser never talks to the provider with secrets and never chooses the amount.
 * The intended flow:
 *  1. The student confirms a booking. `create_booking` stores the agreed pricing,
 *     including `due_in_app_minor` (full price online, commission only in person).
 *  2. A Route Handler (e.g. `POST /api/payments/checkout`) reads that amount from the
 *     booking and calls `createCharge`. Hosted checkouts answer `requires_action` with
 *     a `redirectUrl`, which the client opens.
 *  3. The provider calls a webhook Route Handler. It runs `verifyWebhook`, then writes
 *     the result to `public.payments` and `bookings.payment_status` with the
 *     service-role key.
 *  4. Declined or cancelled lessons call `refund` for the in-app part.
 *
 * Implement one adapter per gateway and return it from `getPaymentProvider`.
 */
export interface PaymentProvider {
  /** Stored as `payments.provider`, e.g. the gateway's name. */
  readonly id: string;
  createCharge(input: {
    bookingId: string;
    amount: Money;
    purpose: PaymentPurpose;
    customer: { id: string; email: string };
    /** Where the hosted checkout sends the student back to. */
    returnUrl: string;
  }): Promise<{ reference: string; status: "succeeded" | "requires_action" | "failed"; redirectUrl?: string }>;
  refund(reference: string, amount: Money): Promise<{ status: "refunded" | "failed" }>;
  /** Returns null when the signature is invalid; the webhook must then answer 400. */
  verifyWebhook(rawBody: string, headers: Headers): Promise<{ reference: string; status: "succeeded" | "failed" | "refunded" } | null>;
}

export function getPaymentProvider(): PaymentProvider {
  if (!serverConfig.PAYMENT_PROVIDER_SECRET_KEY) {
    throw new ServiceError("not_configured", "PAYMENT_PROVIDER_SECRET_KEY is not set.");
  }
  // No gateway adapter yet: real payments stay off until one is chosen and implemented.
  throw new ServiceError("not_configured", "No payment provider adapter is implemented yet.");
}
