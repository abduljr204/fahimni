import { generateDaySlots, isSlotBookable, MIN_LEAD_TIME_MINUTES } from "@/domain/booking-rules";
import { detectContactDetails } from "@/domain/contact-guard";
import { allowedSettlements, defaultSettlement, priceLesson, withSettlement } from "@/domain/pricing";
import type { Booking, LessonProposal, ProposalDetails } from "@/domain/types";
import { acceptProposalSchema, createProposalSchema, type CreateProposalInput } from "@/domain/validation";
import type { ProposalService } from "../contracts";
import { parseInput, ServiceError } from "../errors";
import { isUnlocked, learnerSide, requireActsForStudent, requireConversationParticipant } from "./access";
import { clone, latency, mockDb, newId } from "./mock-db";
import { pushMessage } from "./mock-messaging";
import { pushNotification } from "./mock-notifications";
import { DEMO_MEETING_PLACE, type MockState } from "./seed";

/** Unanswered proposals lapse after this long, or when the lesson gets too close to book. */
const PROPOSAL_VALIDITY_HOURS = 72;

function details(state: MockState, p: LessonProposal): ProposalDetails {
  const tutor = state.tutors.find((t) => t.id === p.tutorId)!;
  const student = state.users.find((u) => u.id === p.studentId)!;
  const subject = state.subjects.find((s) => s.id === p.subjectId)!;
  return clone({
    ...p,
    tutor: { id: tutor.id, userId: tutor.userId, displayName: tutor.displayName, avatarHue: tutor.avatarHue, avatarUrl: tutor.avatarUrl, headline: tutor.headline },
    student: { id: student.id, displayName: student.displayName, avatarHue: student.avatarHue },
    subject,
  });
}

function expireStale(state: MockState, now = Date.now()): void {
  for (const p of state.proposals) {
    if (p.status === "pending" && new Date(p.expiresAt).getTime() < now) {
      p.status = "expired";
      p.respondedAt = new Date(now).toISOString();
    }
  }
}

function insertProposal(state: MockState, tutorUserId: string, input: CreateProposalInput, isSimulated = false): LessonProposal {
  const c = requireConversationParticipant(state, tutorUserId, input.conversationId);
  if (c.tutorUserId !== tutorUserId) throw new ServiceError("forbidden");
  const tutor = state.tutors.find((t) => t.id === c.tutorId)!;
  if (!tutor.subjectIds.includes(input.subjectId) || !tutor.modes.includes(input.mode)) throw new ServiceError("validation");

  const area = input.mode === "in_person" ? input.area || undefined : undefined;
  if (area && !isUnlocked(state, c.studentId, c.tutorId)) {
    const findings = detectContactDetails(area);
    if (findings.length) throw new ServiceError("contact_blocked", undefined, { area: "exactPlace" }, findings);
  }
  const tutorBookings = state.bookings.filter((b) => b.tutorId === tutor.id);
  if (!isSlotBookable(tutor, tutorBookings, input.startsAt, input.durationMinutes)) throw new ServiceError("slot_unavailable");

  const now = Date.now();
  const startsAt = new Date(input.startsAt).toISOString();
  const lastBookable = new Date(startsAt).getTime() - MIN_LEAD_TIME_MINUTES * 60_000;
  const proposal: LessonProposal = {
    id: newId("p"),
    conversationId: c.id,
    tutorId: tutor.id,
    tutorUserId,
    studentId: c.studentId,
    subjectId: input.subjectId,
    objectives: input.objectives,
    startsAt,
    durationMinutes: input.durationMinutes,
    mode: input.mode,
    area,
    // The rate and commission are fixed now: later changes don't touch this offer.
    pricing: priceLesson({
      hourlyRate: tutor.hourlyRate,
      durationMinutes: input.durationMinutes,
      mode: input.mode,
      commissionBps: state.settings.commissionBps,
      settlement: defaultSettlement(input.mode, state.settings),
    }),
    status: "pending",
    expiresAt: new Date(Math.min(lastBookable, now + PROPOSAL_VALIDITY_HOURS * 3_600_000)).toISOString(),
    createdAt: new Date(now).toISOString(),
    isDemo: true,
    isSimulated: isSimulated || undefined,
  };
  state.proposals.push(proposal);
  pushMessage(state, c, tutorUserId, input.objectives, { kind: "proposal", proposalId: proposal.id, isSimulated });
  const subject = state.subjects.find((x) => x.id === input.subjectId)?.name;
  for (const userId of learnerSide(state, c.studentId)) {
    pushNotification(state, { userId, type: "proposal_received", data: { name: tutor.displayName, subject, conversationId: c.id, proposalId: proposal.id } });
  }
  return proposal;
}

/** Checks who may act before revealing anything about the proposal's state. */
function requirePending(state: MockState, proposalId: string, authorize: (p: LessonProposal) => void): LessonProposal {
  expireStale(state);
  const p = state.proposals.find((x) => x.id === proposalId);
  if (!p) throw new ServiceError("not_found");
  authorize(p);
  if (p.status !== "pending") throw new ServiceError("proposal_unavailable");
  return p;
}

/** Prototype only: a simulated tutor answers an exercise question with a proposal. */
export function createSimulatedProposal(conversationId: string): void {
  try {
    mockDb.mutate((s) => {
      const c = s.conversations.find((x) => x.id === conversationId);
      if (!c) return;
      const tutor = s.tutors.find((t) => t.id === c.tutorId)!;
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const slot = generateDaySlots({
        availability: tutor.availability,
        bookings: s.bookings.filter((b) => b.tutorId === tutor.id),
        durationMinutes: 60,
        from: tomorrow,
        days: 10,
      })
        .flatMap((d) => d.slots)
        .find((x) => x.available);
      if (!slot) return;
      const lastLearnerMessage = s.messages.filter((m) => m.conversationId === c.id && m.senderId !== c.tutorUserId).at(-1);
      const arabic = !lastLearnerMessage?.body || /[؀-ۿ]/.test(lastLearnerMessage.body);
      insertProposal(
        s,
        tutor.userId,
        {
          conversationId,
          subjectId: tutor.subjectIds[0],
          objectives: arabic
            ? "حل التمرين الذي أرسلته خطوة بخطوة، ثم ثلاثة تمارين مشابهة للتأكد من الفهم."
            : "Solve the exercise you sent step by step, then three similar problems to check understanding.",
          startsAt: slot.startsAt,
          durationMinutes: 60,
          mode: tutor.modes.includes("online") ? "online" : "in_person",
        },
        true,
      );
    });
  } catch {
    // A simulated proposal is a nicety; never surface its failures.
  }
}

export const mockProposalService: ProposalService = {
  async create(actorUserId, raw) {
    const input = parseInput(createProposalSchema, raw);
    await latency(400, 700);
    return mockDb.mutate((s) => clone(insertProposal(s, actorUserId, input)));
  },

  async listForConversation(actorUserId, conversationId) {
    await latency(100, 250);
    return mockDb.mutate((s) => {
      requireConversationParticipant(s, actorUserId, conversationId);
      expireStale(s);
      return clone(s.proposals.filter((p) => p.conversationId === conversationId));
    });
  },

  async getById(actorUserId, proposalId) {
    await latency(150, 300);
    return mockDb.mutate((s) => {
      expireStale(s);
      const p = s.proposals.find((x) => x.id === proposalId);
      if (!p) return null;
      requireConversationParticipant(s, actorUserId, p.conversationId);
      return details(s, p);
    });
  },

  async accept(actorUserId, raw) {
    const input = parseInput(acceptProposalSchema, raw);
    await latency(500, 900);
    return mockDb.mutate((s) => {
      const p = requirePending(s, input.proposalId, (x) => requireActsForStudent(s, actorUserId, x.studentId));
      if (!allowedSettlements(p.mode, s.settings).includes(input.settlement)) throw new ServiceError("validation");

      // Same agreed price; only how it is paid depends on the option chosen now.
      const pricing = withSettlement(p.pricing, p.durationMinutes, p.mode, input.settlement);
      if (pricing.total.amountMinor !== input.expectedTotalMinor || pricing.dueInApp.amountMinor !== input.expectedDueInAppMinor) {
        throw new ServiceError("price_changed");
      }
      const tutor = s.tutors.find((t) => t.id === p.tutorId)!;
      if (!isSlotBookable(tutor, s.bookings.filter((b) => b.tutorId === tutor.id), p.startsAt, p.durationMinutes)) {
        throw new ServiceError("slot_unavailable");
      }

      const now = new Date().toISOString();
      const booking: Booking = {
        id: newId("b"),
        studentId: p.studentId,
        tutorId: p.tutorId,
        subjectId: p.subjectId,
        startsAt: p.startsAt,
        durationMinutes: p.durationMinutes,
        mode: p.mode,
        // The tutor already agreed by proposing; payment completes the booking.
        status: "confirmed",
        pricing,
        paymentStatus: "unpaid",
        lessonStatus: "scheduled",
        bookedBy: actorUserId,
        proposalId: p.id,
        objectives: p.objectives,
        area: p.area,
        location: p.mode === "in_person" ? DEMO_MEETING_PLACE : undefined,
        createdAt: now,
        updatedAt: now,
        isDemo: true,
      };
      s.bookings.push(booking);
      p.status = "accepted";
      p.bookingId = booking.id;
      p.respondedAt = now;

      const actor = s.users.find((u) => u.id === actorUserId)!;
      pushNotification(s, {
        userId: tutor.userId,
        type: "proposal_accepted",
        data: { name: actor.displayName, subject: s.subjects.find((x) => x.id === p.subjectId)?.name, startsAt: p.startsAt, bookingId: booking.id, conversationId: p.conversationId },
      });
      return clone(booking);
    });
  },

  async decline(actorUserId, proposalId) {
    await latency(300, 500);
    return mockDb.mutate((s) => {
      const p = requirePending(s, proposalId, (x) => requireActsForStudent(s, actorUserId, x.studentId));
      p.status = "declined";
      p.respondedAt = new Date().toISOString();
      const actor = s.users.find((u) => u.id === actorUserId)!;
      pushNotification(s, {
        userId: p.tutorUserId,
        type: "proposal_declined",
        data: { name: actor.displayName, subject: s.subjects.find((x) => x.id === p.subjectId)?.name, conversationId: p.conversationId },
      });
      return clone(p);
    });
  },

  async withdraw(actorUserId, proposalId) {
    await latency(300, 500);
    return mockDb.mutate((s) => {
      const p = requirePending(s, proposalId, (x) => {
        if (x.tutorUserId !== actorUserId) throw new ServiceError("forbidden");
      });
      p.status = "withdrawn";
      p.respondedAt = new Date().toISOString();
      return clone(p);
    });
  },
};
