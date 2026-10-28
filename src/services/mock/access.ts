import { isPaidAndConfirmed } from "@/domain/access";
import type { Booking, ClassroomRole, Conversation } from "@/domain/types";
import { ServiceError } from "../errors";
import type { MockState } from "./seed";

/**
 * Prototype permission checks. Every mock service uses these instead of ad-hoc
 * comparisons, mirroring the SQL helpers (`acts_for_student`, `is_participant`,
 * `conversation_unlocked`) that enforce the same rules in production.
 */

/** Suspended accounts can read their data but can't message, book, pay or report. */
export function requireActive(state: MockState, userId: string): void {
  const user = state.users.find((u) => u.id === userId);
  if (!user) throw new ServiceError("unauthorized");
  if (user.suspendedAt) throw new ServiceError("account_suspended");
}

export function guardianOf(state: MockState, studentUserId: string): string | undefined {
  return state.students.find((s) => s.userId === studentUserId)?.guardianUserId;
}

/** True for the student themselves and for the parent who manages them. */
export function actsForStudent(state: MockState, actorUserId: string, studentUserId: string): boolean {
  return actorUserId === studentUserId || guardianOf(state, studentUserId) === actorUserId;
}

export function requireActsForStudent(state: MockState, actorUserId: string, studentUserId: string): void {
  if (!state.users.some((u) => u.id === actorUserId)) throw new ServiceError("unauthorized");
  if (!actsForStudent(state, actorUserId, studentUserId)) throw new ServiceError("forbidden");
}

export function conversationParticipants(state: MockState, c: Conversation): string[] {
  const guardian = guardianOf(state, c.studentId);
  return [c.studentId, ...(guardian ? [guardian] : []), c.tutorUserId];
}

export function isConversationParticipant(state: MockState, userId: string, c: Conversation): boolean {
  return conversationParticipants(state, c).includes(userId);
}

export function requireConversationParticipant(state: MockState, userId: string, conversationId: string): Conversation {
  const c = state.conversations.find((x) => x.id === conversationId);
  if (!c) throw new ServiceError("not_found");
  if (!isConversationParticipant(state, userId, c)) throw new ServiceError("forbidden");
  return c;
}

/** The learner's side of a conversation or booking (student and/or parent). */
export function learnerSide(state: MockState, studentUserId: string): string[] {
  const guardian = guardianOf(state, studentUserId);
  return [studentUserId, ...(guardian ? [guardian] : [])];
}

/** Contact details and exact places may be shared once the pair has a confirmed, paid booking. */
export function isUnlocked(state: MockState, studentUserId: string, tutorId: string): boolean {
  return state.bookings.some((b) => b.studentId === studentUserId && b.tutorId === tutorId && isPaidAndConfirmed(b));
}

export function bookingRole(state: MockState, userId: string, booking: Booking): ClassroomRole | null {
  const tutor = state.tutors.find((t) => t.id === booking.tutorId);
  if (tutor?.userId === userId) return "tutor";
  if (booking.studentId === userId) return "student";
  if (guardianOf(state, booking.studentId) === userId) return "guardian";
  return null;
}
