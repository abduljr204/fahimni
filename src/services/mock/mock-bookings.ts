import { canSeeMeetingDetails, isPaidAndConfirmed } from "@/domain/access";
import { canCancel, generateDaySlots, isSlotBookable } from "@/domain/booking-rules";
import { allowedSettlements, priceLesson } from "@/domain/pricing";
import { refundFor } from "@/domain/refunds";
import type { Booking, BookingDetails } from "@/domain/types";
import { createBookingSchema } from "@/domain/validation";
import type { BookingService } from "../contracts";
import { parseInput, ServiceError } from "../errors";
import { bookingRole, isUnlocked, learnerSide, requireActsForStudent } from "./access";
import { clone, latency, mockDb, newId } from "./mock-db";
import { postSystemMessage } from "./mock-messaging";
import { pushNotification } from "./mock-notifications";
import { refundBookingPayments, relockIfNeeded } from "./mock-payments";
import { DEMO_MEETING_PLACE, type MockState } from "./seed";
import { scheduleTutorResponse } from "./simulator";

function details(state: MockState, booking: Booking): BookingDetails {
  const tutor = state.tutors.find((t) => t.id === booking.tutorId)!;
  const student = state.users.find((u) => u.id === booking.studentId)!;
  const subject = state.subjects.find((s) => s.id === booking.subjectId)!;
  // The exact meeting place is withheld until the booking is confirmed and paid.
  const visible = canSeeMeetingDetails(booking);
  return clone({
    ...booking,
    location: visible ? booking.location : undefined,
    meetingDetailsVisible: visible,
    tutor: {
      id: tutor.id,
      userId: tutor.userId,
      displayName: tutor.displayName,
      avatarHue: tutor.avatarHue,
      avatarUrl: tutor.avatarUrl,
      headline: tutor.headline,
    },
    student: {
      id: student.id,
      displayName: student.displayName,
      avatarHue: student.avatarHue,
      avatarUrl: student.avatarUrl,
    },
    subject,
  });
}

/** Lessons whose end time has passed are marked completed, as a nightly job would in production. */
export function completeFinishedLessons(state: MockState, now = Date.now()): void {
  for (const b of state.bookings) {
    const end = new Date(b.startsAt).getTime() + b.durationMinutes * 60_000;
    if (b.status === "confirmed" && b.lessonStatus !== "completed" && end < now) {
      b.lessonStatus = "completed";
      b.updatedAt = new Date(now).toISOString();
    }
  }
}

function byStart(a: Booking, b: Booking) {
  return a.startsAt.localeCompare(b.startsAt);
}

export const mockBookingService: BookingService = {
  async getAvailableSlots(tutorId, durationMinutes, days) {
    await latency(250, 500);
    const tutor = mockDb.data.tutors.find((t) => t.id === tutorId);
    if (!tutor) throw new ServiceError("not_found");
    return generateDaySlots({
      availability: tutor.availability,
      bookings: mockDb.data.bookings.filter((b) => b.tutorId === tutorId),
      durationMinutes,
      from: new Date(),
      days,
    });
  },

  async create(actorUserId, raw) {
    const input = parseInput(createBookingSchema, raw);
    await latency(700, 1200);
    const booking = mockDb.mutate((s) => {
      const actor = s.users.find((u) => u.id === actorUserId);
      if (!actor) throw new ServiceError("unauthorized");
      const studentId = input.forStudentId ?? actorUserId;
      requireActsForStudent(s, actorUserId, studentId);
      if (s.users.find((u) => u.id === studentId)?.role !== "student") throw new ServiceError("forbidden");
      const tutor = s.tutors.find((t) => t.id === input.tutorId);
      if (!tutor) throw new ServiceError("not_found");
      if (!tutor.subjectIds.includes(input.subjectId) || !tutor.modes.includes(input.mode)) {
        throw new ServiceError("validation");
      }
      if (!allowedSettlements(input.mode, s.settings).includes(input.settlement)) throw new ServiceError("validation");
      const tutorBookings = s.bookings.filter((b) => b.tutorId === tutor.id);
      if (!isSlotBookable(tutor, tutorBookings, input.startsAt, input.durationMinutes)) {
        throw new ServiceError("slot_unavailable");
      }
      // The price is fixed here, from the current rate and commission, and stored on the booking.
      const pricing = priceLesson({
        hourlyRate: tutor.hourlyRate,
        durationMinutes: input.durationMinutes,
        mode: input.mode,
        commissionBps: s.settings.commissionBps,
        settlement: input.settlement,
      });
      if (
        pricing.total.amountMinor !== input.expectedTotalMinor ||
        pricing.dueInApp.amountMinor !== input.expectedDueInAppMinor
      ) {
        throw new ServiceError("price_changed");
      }

      const now = new Date().toISOString();
      const id = newId("b");
      const created: Booking = {
        id,
        studentId,
        tutorId: tutor.id,
        subjectId: input.subjectId,
        startsAt: new Date(input.startsAt).toISOString(),
        durationMinutes: input.durationMinutes,
        mode: input.mode,
        note: input.note || undefined,
        status: tutor.instantBook ? "confirmed" : "pending",
        pricing,
        paymentStatus: "unpaid",
        lessonStatus: "scheduled",
        bookedBy: actorUserId,
        location: input.mode === "in_person" ? DEMO_MEETING_PLACE : undefined,
        createdAt: now,
        updatedAt: now,
        isDemo: true,
      };
      s.bookings.push(created);

      const subject = s.subjects.find((x) => x.id === input.subjectId)?.name;
      const student = s.users.find((u) => u.id === studentId)!;
      pushNotification(s, {
        userId: tutor.userId,
        type: "booking_requested",
        data: { name: student.displayName, subject, startsAt: created.startsAt, bookingId: id },
      });
      if (created.status === "confirmed") {
        for (const userId of learnerSide(s, studentId)) {
          pushNotification(s, { userId, type: "booking_confirmed", data: { name: tutor.displayName, subject, startsAt: created.startsAt, bookingId: id } });
        }
      }
      return clone(created);
    });

    if (booking.status === "pending") scheduleTutorResponse(booking.id);
    return booking;
  },

  async getById(actorUserId, bookingId) {
    await latency(150, 300);
    const s = mockDb.data;
    const booking = s.bookings.find((b) => b.id === bookingId);
    if (!booking) return null;
    if (!bookingRole(s, actorUserId, booking)) throw new ServiceError("forbidden");
    return details(s, booking);
  },

  async listForStudent(actorUserId, studentUserId) {
    await latency(300, 600);
    requireActsForStudent(mockDb.data, actorUserId, studentUserId);
    mockDb.mutate((s) => completeFinishedLessons(s));
    const s = mockDb.data;
    return s.bookings
      .filter((b) => b.studentId === studentUserId)
      .sort(byStart)
      .map((b) => details(s, b));
  },

  async listForTutor(actorUserId, tutorId) {
    await latency(300, 600);
    mockDb.mutate((s) => completeFinishedLessons(s));
    const s = mockDb.data;
    const tutor = s.tutors.find((t) => t.id === tutorId);
    if (!tutor) throw new ServiceError("not_found");
    if (tutor.userId !== actorUserId) throw new ServiceError("forbidden");
    return s.bookings
      .filter((b) => b.tutorId === tutorId)
      .sort(byStart)
      .map((b) => details(s, b));
  },

  async cancel(actorUserId, bookingId) {
    await latency(400, 700);
    return mockDb.mutate((s) => {
      const booking = s.bookings.find((b) => b.id === bookingId);
      if (!booking) throw new ServiceError("not_found");
      const role = bookingRole(s, actorUserId, booking);
      if (!role) throw new ServiceError("forbidden");
      if (!canCancel(booking)) throw new ServiceError("validation");
      const tutor = s.tutors.find((t) => t.id === booking.tutorId)!;
      const byTutor = role === "tutor";

      booking.status = "cancelled";
      booking.updatedAt = new Date().toISOString();
      refundBookingPayments(s, booking.id, refundFor(booking, byTutor ? "tutor" : "student").refund);
      // Chat and classroom access follow the booking: nothing paid left means pre-booking rules again.
      relockIfNeeded(s, booking.studentId, booking.tutorId);

      const actor = s.users.find((u) => u.id === actorUserId)!;
      const recipients = byTutor ? learnerSide(s, booking.studentId) : [tutor.userId];
      for (const userId of recipients) {
        pushNotification(s, {
          userId,
          type: "booking_cancelled",
          data: { name: byTutor ? tutor.displayName : actor.displayName, subject: s.subjects.find((x) => x.id === booking.subjectId)?.name, bookingId },
        });
      }
      return clone(booking);
    });
  },

  async respond(actorUserId, bookingId, accept) {
    await latency(400, 700);
    return respondToBooking(actorUserId, bookingId, accept);
  },
};

/** Shared by the tutor's manual response and the simulator's automatic one. */
export function respondToBooking(actorUserId: string, bookingId: string, accept: boolean): Booking {
  return mockDb.mutate((s) => {
    const booking = s.bookings.find((b) => b.id === bookingId);
    if (!booking) throw new ServiceError("not_found");
    const tutor = s.tutors.find((t) => t.id === booking.tutorId)!;
    if (tutor.userId !== actorUserId) throw new ServiceError("forbidden");
    if (booking.status !== "pending") return clone(booking);
    const wasUnlocked = isUnlocked(s, booking.studentId, booking.tutorId);
    booking.status = accept ? "confirmed" : "declined";
    booking.updatedAt = new Date().toISOString();
    if (!accept) refundBookingPayments(s, booking.id, refundFor(booking, "tutor").refund);
    if (accept && !wasUnlocked && isPaidAndConfirmed(booking)) {
      postSystemMessage(s, booking.studentId, booking.tutorId, "contact_unlocked");
    }
    for (const userId of learnerSide(s, booking.studentId)) {
      pushNotification(s, {
        userId,
        type: accept ? "booking_confirmed" : "booking_declined",
        data: {
          name: tutor.displayName,
          subject: s.subjects.find((x) => x.id === booking.subjectId)?.name,
          startsAt: booking.startsAt,
          bookingId,
        },
      });
    }
    return clone(booking);
  });
}
