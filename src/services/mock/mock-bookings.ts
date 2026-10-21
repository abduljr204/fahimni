import {
  canCancel,
  generateDaySlots,
  isSlotBookable,
  priceForDuration,
} from "@/domain/booking-rules";
import type { Booking, BookingDetails } from "@/domain/types";
import { createBookingSchema } from "@/domain/validation";
import type { BookingService } from "../contracts";
import { parseInput, ServiceError } from "../errors";
import { clone, latency, mockDb, newId } from "./mock-db";
import { pushNotification } from "./mock-notifications";
import type { MockState } from "./seed";
import { scheduleTutorResponse } from "./simulator";

function details(state: MockState, booking: Booking): BookingDetails {
  const tutor = state.tutors.find((t) => t.id === booking.tutorId)!;
  const student = state.users.find((u) => u.id === booking.studentId)!;
  const subject = state.subjects.find((s) => s.id === booking.subjectId)!;
  return clone({
    ...booking,
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
    if (b.status === "confirmed" && end < now) {
      b.status = "completed";
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
      const student = s.users.find((u) => u.id === actorUserId);
      if (!student) throw new ServiceError("unauthorized");
      if (student.role !== "student") throw new ServiceError("forbidden");
      const tutor = s.tutors.find((t) => t.id === input.tutorId);
      if (!tutor) throw new ServiceError("not_found");
      if (!tutor.subjectIds.includes(input.subjectId) || !tutor.modes.includes(input.mode)) {
        throw new ServiceError("validation");
      }
      const tutorBookings = s.bookings.filter((b) => b.tutorId === tutor.id);
      if (!isSlotBookable(tutor, tutorBookings, input.startsAt, input.durationMinutes)) {
        throw new ServiceError("slot_unavailable");
      }

      const now = new Date().toISOString();
      const id = newId("b");
      const created: Booking = {
        id,
        studentId: actorUserId,
        tutorId: tutor.id,
        subjectId: input.subjectId,
        startsAt: new Date(input.startsAt).toISOString(),
        durationMinutes: input.durationMinutes,
        mode: input.mode,
        note: input.note || undefined,
        status: tutor.instantBook ? "confirmed" : "pending",
        price: priceForDuration(tutor.hourlyRate, input.durationMinutes),
        paymentStatus: "unpaid",
        meetingUrl: input.mode === "online" ? `https://meet.naqraw.example/demo-${id}` : undefined,
        location: input.mode === "in_person" ? { ar: "مكتبة الكلية — القاعة 3", en: "Faculty library — Room 3" } : undefined,
        createdAt: now,
        updatedAt: now,
        isDemo: true,
      };
      s.bookings.push(created);

      const subject = s.subjects.find((x) => x.id === input.subjectId)?.name;
      pushNotification(s, {
        userId: tutor.userId,
        type: "booking_requested",
        data: { name: student.displayName, subject, startsAt: created.startsAt, bookingId: id },
      });
      if (created.status === "confirmed") {
        pushNotification(s, {
          userId: actorUserId,
          type: "booking_confirmed",
          data: { name: tutor.displayName, subject, startsAt: created.startsAt, bookingId: id },
        });
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
    const tutor = s.tutors.find((t) => t.id === booking.tutorId);
    if (booking.studentId !== actorUserId && tutor?.userId !== actorUserId) throw new ServiceError("forbidden");
    return details(s, booking);
  },

  async listForStudent(studentUserId) {
    await latency(300, 600);
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
      const tutor = s.tutors.find((t) => t.id === booking.tutorId)!;
      const isStudent = booking.studentId === actorUserId;
      if (!isStudent && tutor.userId !== actorUserId) throw new ServiceError("forbidden");
      if (!canCancel(booking)) throw new ServiceError("validation");
      booking.status = "cancelled";
      booking.updatedAt = new Date().toISOString();
      const student = s.users.find((u) => u.id === booking.studentId)!;
      pushNotification(s, {
        userId: isStudent ? tutor.userId : booking.studentId,
        type: "booking_cancelled",
        data: {
          name: isStudent ? student.displayName : tutor.displayName,
          subject: s.subjects.find((x) => x.id === booking.subjectId)?.name,
          bookingId,
        },
      });
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
    booking.status = accept ? "confirmed" : "declined";
    booking.updatedAt = new Date().toISOString();
    pushNotification(s, {
      userId: booking.studentId,
      type: accept ? "booking_confirmed" : "booking_declined",
      data: {
        name: tutor.displayName,
        subject: s.subjects.find((x) => x.id === booking.subjectId)?.name,
        startsAt: booking.startsAt,
        bookingId,
      },
    });
    return clone(booking);
  });
}
