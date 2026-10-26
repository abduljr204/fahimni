import type { Booking, PaymentStatus, PlatformSettings } from "./types";

/**
 * Access rules shared by every backend. Services enforce them; screens only use them to
 * decide what to show. The database mirrors them in supabase/migrations/0003_*.sql.
 */

const PAID: PaymentStatus[] = ["simulated", "authorized", "paid"];

export function isPaid(status: PaymentStatus): boolean {
  return PAID.includes(status);
}

/**
 * A booking that unlocks full communication: confirmed by the tutor and paid in the app.
 * A partially refunded payment (late cancellation) doesn't count, because the booking is cancelled.
 */
export function isPaidAndConfirmed(booking: Pick<Booking, "status" | "paymentStatus">): boolean {
  return booking.status === "confirmed" && isPaid(booking.paymentStatus);
}

/** Exact meeting places and contact sharing open up only once a booking is confirmed and paid. */
export const canSeeMeetingDetails = isPaidAndConfirmed;

export type ClassroomDenial =
  | "not_participant"
  | "not_online"
  | "not_confirmed"
  | "not_paid"
  | "too_early"
  | "ended";

export function classroomWindow(
  booking: Pick<Booking, "startsAt" | "durationMinutes">,
  settings: Pick<PlatformSettings, "classroomOpensMinutesBefore" | "classroomClosesMinutesAfter">,
): { opensAt: Date; closesAt: Date } {
  const start = new Date(booking.startsAt).getTime();
  return {
    opensAt: new Date(start - settings.classroomOpensMinutesBefore * 60_000),
    closesAt: new Date(start + (booking.durationMinutes + settings.classroomClosesMinutesAfter) * 60_000),
  };
}

/**
 * Whether a participant may enter the classroom now. The caller must already have
 * checked that the user is the booked student, their parent, or the tutor.
 * `ignoreSchedule` exists for the prototype's "enter now" demo shortcut only.
 */
export function classroomDenial(
  booking: Pick<Booking, "mode" | "status" | "paymentStatus" | "startsAt" | "durationMinutes">,
  settings: Pick<PlatformSettings, "classroomOpensMinutesBefore" | "classroomClosesMinutesAfter">,
  now = new Date(),
  ignoreSchedule = false,
): ClassroomDenial | null {
  if (booking.mode !== "online") return "not_online";
  if (booking.status !== "confirmed") return "not_confirmed";
  if (!isPaid(booking.paymentStatus)) return "not_paid";
  if (ignoreSchedule) return null;
  const { opensAt, closesAt } = classroomWindow(booking, settings);
  if (now < opensAt) return "too_early";
  if (now > closesAt) return "ended";
  return null;
}
