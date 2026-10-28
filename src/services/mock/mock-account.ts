import { isPaidAndConfirmed } from "@/domain/access";
import { isUpcoming } from "@/domain/booking-rules";
import { accountProfileSchema, changePasswordSchema, childSchema, deleteAccountSchema, preferencesSchema } from "@/domain/validation";
import type { AccountService } from "../contracts";
import { parseInput, ServiceError } from "../errors";
import { addManagedChild, setSession } from "./mock-auth";
import { clone, latency, mockDb } from "./mock-db";
import { preferencesOf } from "./mock-notifications";
import { refundBookingPayments } from "./mock-payments";
import type { MockState } from "./seed";

function requireUser(state: MockState, userId: string) {
  const user = state.users.find((u) => u.id === userId && u.password);
  if (!user) throw new ServiceError("unauthorized");
  return user;
}

export const mockAccountService: AccountService = {
  async updateProfile(actorUserId, raw) {
    const input = parseInput(accountProfileSchema, raw);
    await latency(300, 600);
    mockDb.mutate((s) => {
      const user = requireUser(s, actorUserId);
      user.displayName = { ar: input.fullName, en: input.fullName };
      user.phone = input.phone;
      const student = s.students.find((x) => x.userId === actorUserId);
      if (student) {
        if (input.university) student.university = { ar: input.university, en: input.university };
        if (input.major) student.major = { ar: input.major, en: input.major };
        if (input.studyYear) student.studyYear = input.studyYear;
      }
      const tutor = s.tutors.find((t) => t.userId === actorUserId);
      if (tutor) tutor.displayName = user.displayName;
    });
    // Refresh everyone's view of the session (name changes show up immediately).
    return setSession(actorUserId)!;
  },

  async changePassword(actorUserId, raw) {
    const input = parseInput(changePasswordSchema, raw);
    await latency(400, 700);
    mockDb.mutate((s) => {
      const user = requireUser(s, actorUserId);
      if (user.password !== input.currentPassword) throw new ServiceError("validation", undefined, { currentPassword: "wrongPassword" });
      user.password = input.newPassword;
    });
  },

  async getPreferences(actorUserId) {
    await latency(100, 200);
    requireUser(mockDb.data, actorUserId);
    return clone(preferencesOf(mockDb.data, actorUserId));
  },

  async updatePreferences(actorUserId, raw) {
    const prefs = parseInput(preferencesSchema, raw);
    await latency(200, 400);
    return mockDb.mutate((s) => {
      requireUser(s, actorUserId);
      s.preferences[actorUserId] = prefs;
      return clone(prefs);
    });
  },

  async listDeliveries(actorUserId) {
    await latency(150, 300);
    requireUser(mockDb.data, actorUserId);
    return clone(
      mockDb.data.outbox.filter((o) => o.userId === actorUserId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50),
    );
  },

  async addChild(actorUserId, raw) {
    const input = parseInput(childSchema, raw);
    await latency(400, 700);
    const child = mockDb.mutate((s) => {
      const user = requireUser(s, actorUserId);
      if (user.role !== "parent") throw new ServiceError("forbidden");
      return addManagedChild(s, actorUserId, input);
    });
    setSession(actorUserId);
    return clone(child);
  },

  async deleteAccount(actorUserId, confirmEmail) {
    const input = parseInput(deleteAccountSchema, { confirmEmail });
    await latency(500, 900);
    mockDb.mutate((s) => {
      const user = requireUser(s, actorUserId);
      if (input.confirmEmail !== user.email) throw new ServiceError("validation", undefined, { confirmEmail: "emailMismatch" });

      // The learners this account is responsible for: itself, and a parent's children.
      const learners = [actorUserId, ...s.students.filter((x) => x.guardianUserId === actorUserId).map((x) => x.userId)];
      const tutorId = s.tutors.find((t) => t.userId === actorUserId)?.id;
      const hasUpcoming = s.bookings.some(
        (b) => (learners.includes(b.studentId) || b.tutorId === tutorId) && isPaidAndConfirmed(b) && isUpcoming(b),
      );
      if (hasUpcoming) throw new ServiceError("validation", undefined, { _form: "hasUpcomingLessons" });

      // Pending requests are cancelled and refunded so nobody is left waiting or out of pocket.
      const removed = new Set(learners);
      for (const b of s.bookings) {
        if ((removed.has(b.studentId) || b.tutorId === tutorId) && b.status === "pending") {
          b.status = "cancelled";
          refundBookingPayments(s, b.id);
        }
      }

      // Personal data is removed; bookings and payments stay (anonymised) for accounting.
      for (const id of removed) {
        const u = s.users.find((x) => x.id === id);
        if (!u) continue;
        u.displayName = { ar: "حساب محذوف", en: "Deleted account" };
        u.email = `deleted-${id}@deleted.fahimni`;
        u.password = "";
        u.phone = undefined;
      }
      s.students = s.students.filter((x) => !removed.has(x.userId));
      if (tutorId) {
        const tutor = s.tutors.find((t) => t.id === tutorId)!;
        tutor.published = false;
        tutor.displayName = { ar: "حساب محذوف", en: "Deleted account" };
        tutor.bio = {};
      }
      s.favorites = s.favorites.filter((f) => !removed.has(f.userId));
      s.notifications = s.notifications.filter((n) => !removed.has(n.userId));
      s.outbox = s.outbox.filter((o) => !removed.has(o.userId));
      delete s.preferences[actorUserId];
    });
    setSession(null);
  },
};
