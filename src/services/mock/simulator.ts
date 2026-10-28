import { DEMO_TUTOR_EMAIL } from "./seed";
import { mockDb } from "./mock-db";
import { sendDueReminders } from "./mock-notifications";

/**
 * Simulates the "other side" of the marketplace in prototype mode:
 *  - tutors other than the demo tutor accept booking requests after a few seconds
 *  - counterparts reply to chat messages (see mock-messaging.ts)
 * The demo tutor never auto-responds, so testers can accept requests themselves
 * after switching to the tutor experience.
 */

const AUTO_ACCEPT_DELAY_MS = 7000;

function isDemoTutorUser(userId: string): boolean {
  return mockDb.data.users.find((u) => u.id === userId)?.email === DEMO_TUTOR_EMAIL;
}

export function scheduleTutorResponse(bookingId: string, delay = AUTO_ACCEPT_DELAY_MS): void {
  if (typeof window === "undefined") return;
  const booking = mockDb.data.bookings.find((b) => b.id === bookingId);
  const tutor = mockDb.data.tutors.find((t) => t.id === booking?.tutorId);
  if (!booking || !tutor || isDemoTutorUser(tutor.userId)) return;
  window.setTimeout(async () => {
    const { respondToBooking } = await import("./mock-bookings");
    respondToBooking(tutor.userId, bookingId, true);
  }, delay);
}

let started = false;

/** Resumes simulations that were interrupted by a page reload, and runs the reminder job. */
export function startSimulator(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  // The production scheduler's job: send lesson reminders that have come due.
  const remind = () => {
    if (mockDb.data.bookings.some((b) => b.status === "confirmed")) mockDb.mutate((s) => sendDueReminders(s));
  };
  remind();
  window.setInterval(remind, 60_000);
  const now = Date.now();
  for (const b of mockDb.data.bookings) {
    if (b.status !== "pending") continue;
    const age = now - new Date(b.createdAt).getTime();
    scheduleTutorResponse(b.id, Math.max(500, AUTO_ACCEPT_DELAY_MS - age));
  }
}
