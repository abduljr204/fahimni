import type { Booking, BookingDetails, ClassroomTicket, DaySlots, LessonProposal, ProposalDetails } from "@/domain/types";
import { acceptProposalSchema, createBookingSchema, createProposalSchema } from "@/domain/validation";
import type { BookingService, ClassroomService, PaymentResult, PaymentService, ProposalService } from "../contracts";
import { parseInput } from "../errors";
import { call, callServer } from "./client";

export const supabaseBookingService: BookingService = {
  getAvailableSlots: (tutorId, durationMinutes, days) =>
    call<DaySlots[]>("get_available_slots", { p_tutor: tutorId, p_duration: durationMinutes, p_days: days }),

  create(_actor, raw) {
    const input = parseInput(createBookingSchema, raw);
    return call<Booking>("create_booking", {
      p_tutor_id: input.tutorId,
      p_subject_id: input.subjectId,
      p_starts_at: input.startsAt,
      p_duration: input.durationMinutes,
      p_mode: input.mode,
      p_settlement: input.settlement,
      p_expected_total_minor: input.expectedTotalMinor,
      p_expected_due_in_app_minor: input.expectedDueInAppMinor,
      p_note: input.note ?? null,
      p_for_student: input.forStudentId ?? null,
    });
  },

  getById: (_actor, bookingId) => call<BookingDetails | null>("get_booking", { p_booking: bookingId }),
  listForStudent: (_actor, studentUserId) => call<BookingDetails[]>("list_bookings_for_student", { p_student: studentUserId }),
  listForTutor: (_actor, tutorId) => call<BookingDetails[]>("list_bookings_for_tutor", { p_tutor: tutorId }),
  cancel: (_actor, bookingId) => call<Booking>("cancel_booking", { p_booking: bookingId }),
  respond: (_actor, bookingId, accept) => call<Booking>("respond_to_booking", { p_booking: bookingId, p_accept: accept }),
};

export const supabaseProposalService: ProposalService = {
  // Through the server: the area text is checked for exact addresses before payment.
  create: (_actor, raw) => callServer<LessonProposal>("/api/proposals", "POST", parseInput(createProposalSchema, raw)),
  listForConversation: (_actor, conversationId) => call<LessonProposal[]>("list_proposals", { p_conversation: conversationId }),
  getById: (_actor, proposalId) => call<ProposalDetails | null>("get_proposal", { p_proposal: proposalId }),

  accept(_actor, raw) {
    const input = parseInput(acceptProposalSchema, raw);
    return call<Booking>("accept_proposal", {
      p_proposal: input.proposalId,
      p_settlement: input.settlement,
      p_expected_total_minor: input.expectedTotalMinor,
      p_expected_due_in_app_minor: input.expectedDueInAppMinor,
    });
  },

  decline: (_actor, proposalId) => call<LessonProposal>("respond_to_proposal", { p_proposal: proposalId, p_action: "decline" }),
  withdraw: (_actor, proposalId) => call<LessonProposal>("respond_to_proposal", { p_proposal: proposalId, p_action: "withdraw" }),
};

/**
 * Still simulated: the database records the payment with `provider = 'simulated'` and no money
 * moves. Connecting a gateway means replacing this with src/services/payments/provider.ts.
 */
export const supabasePaymentService: PaymentService = {
  kind: "simulated",
  payForBooking: (_actor, bookingId) => call<PaymentResult>("simulate_payment", { p_booking: bookingId }),
};

export const supabaseClassroomService: ClassroomService = {
  // The server checks access in the database, then asks the video service for a token.
  join: (_actor, bookingId) => callServer<ClassroomTicket>(`/api/classroom/${encodeURIComponent(bookingId)}/token`, "POST"),
  async leave() {
    // Leaving is handled by the video call itself; nothing is stored.
  },
};
