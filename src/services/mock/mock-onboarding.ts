import { isRateWithinLimits } from "@/domain/pricing";
import type { ApplicationDetails, LocalizedText, TutorApplication, TutorProfile } from "@/domain/types";
import { reviewApplicationSchema, tutorApplicationSchema, tutorProfileSchema, type TutorProfileInput } from "@/domain/validation";
import { brand } from "@/config/app-config";
import type { TutorOnboardingService } from "../contracts";
import { parseInput, ServiceError } from "../errors";
import { setSession } from "./mock-auth";
import { clone, latency, mockDb, newId } from "./mock-db";
import { pushNotification } from "./mock-notifications";
import { rateLimit } from "./rate-limit";
import type { MockState } from "./seed";

/** Tutors write their profile in one language; it is shown as written in both. */
const both = (text: string): LocalizedText => ({ ar: text, en: text });

function assertAdmin(state: MockState, actorUserId: string) {
  if (state.users.find((u) => u.id === actorUserId)?.role !== "admin") throw new ServiceError("forbidden");
}

function applyProfile(state: MockState, tutor: TutorProfile, input: TutorProfileInput) {
  const known = new Set(state.subjects.map((s) => s.id));
  if (input.subjectIds.some((id) => !known.has(id))) throw new ServiceError("validation", undefined, { subjectIds: "pickSubjects" });
  tutor.headline = both(input.headline);
  tutor.bio = both(input.bio);
  tutor.university = both(input.university);
  tutor.city = both(input.city);
  tutor.languages = input.languages;
  tutor.modes = input.modes;
  tutor.gradeLevels = input.gradeLevels;
  tutor.subjectIds = input.subjectIds;
  tutor.qualifications = input.qualifications.map(both);
}

export const mockOnboardingService: TutorOnboardingService = {
  async apply(raw) {
    const input = parseInput(tutorApplicationSchema, raw);
    await latency(700, 1200);
    rateLimit("signUp", "browser");
    if (mockDb.data.users.some((u) => u.email === input.email)) {
      throw new ServiceError("email_taken", undefined, { email: "emailTaken" });
    }
    const rate = { currency: brand.currency, amountMinor: input.hourlyRateMinor };
    if (!isRateWithinLimits(rate, mockDb.data.settings)) {
      throw new ServiceError("validation", undefined, { hourlyRateMinor: "rateOutOfRange" });
    }

    const now = new Date().toISOString();
    const userId = newId("u");
    mockDb.mutate((s) => {
      const hue = Math.floor(Math.random() * 360);
      s.users.push({
        id: userId,
        email: input.email,
        password: input.password,
        role: "tutor",
        displayName: both(input.fullName),
        avatarHue: hue,
        preferredLocale: "ar",
        phone: input.phone,
        createdAt: now,
        isDemo: true,
      });
      const tutor: TutorProfile = {
        id: newId("t"),
        userId,
        displayName: both(input.fullName),
        avatarHue: hue,
        headline: {},
        bio: {},
        university: {},
        city: {},
        subjectIds: [],
        languages: [],
        modes: [],
        qualifications: [],
        gradeLevels: [],
        hourlyRate: rate,
        yearsExperience: 0,
        rating: 0,
        reviewCount: 0,
        lessonsCompleted: 0,
        responseTimeMinutes: 60,
        // Hidden from search until an admin checks the documents.
        verification: "pending",
        published: false,
        instantBook: false,
        availability: [],
        timezone: "Africa/Tripoli",
        createdAt: now,
        isDemo: true,
      };
      applyProfile(s, tutor, input);
      s.tutors.push(tutor);
      s.applications.push({
        id: newId("app"),
        userId,
        tutorId: tutor.id,
        documents: input.documents.map((d) => ({ kind: d.kind, file: { ...d.file, id: newId("doc") } })),
        status: "pending",
        createdAt: now,
        isDemo: true,
      });
      pushNotification(s, { userId, type: "welcome", data: {} });
    });
    return setSession(userId)!;
  },

  async getMyApplication(actorUserId) {
    await latency(100, 250);
    const app = [...mockDb.data.applications].reverse().find((a) => a.userId === actorUserId);
    return app ? clone(app) : null;
  },

  async updateProfile(actorUserId, tutorId, raw) {
    const input = parseInput(tutorProfileSchema, raw);
    await latency(400, 700);
    return mockDb.mutate((s) => {
      const tutor = s.tutors.find((t) => t.id === tutorId);
      if (!tutor) throw new ServiceError("not_found");
      if (tutor.userId !== actorUserId) throw new ServiceError("forbidden");
      applyProfile(s, tutor, input);
      return clone(tutor);
    });
  },

  async listApplications(actorUserId) {
    await latency(200, 400);
    const s = mockDb.data;
    assertAdmin(s, actorUserId);
    return clone(
      s.applications
        .filter((a) => a.status === "pending")
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map<ApplicationDetails>((a) => ({
          ...a,
          tutor: s.tutors.find((t) => t.id === a.tutorId)!,
          email: s.users.find((u) => u.id === a.userId)?.email ?? "",
        })),
    );
  },

  async reviewApplication(actorUserId, raw) {
    const input = parseInput(reviewApplicationSchema, raw);
    await latency(400, 700);
    return mockDb.mutate((s) => {
      assertAdmin(s, actorUserId);
      const app = s.applications.find((a) => a.id === input.applicationId);
      if (!app) throw new ServiceError("not_found");
      if (app.status !== "pending") throw new ServiceError("validation");
      const tutor = s.tutors.find((t) => t.id === app.tutorId)!;
      app.status = input.approve ? "approved" : "rejected";
      app.reviewedAt = new Date().toISOString();
      app.reviewedBy = actorUserId;
      app.note = input.note || undefined;
      tutor.verification = input.approve ? "verified" : "rejected";
      tutor.published = input.approve;
      pushNotification(s, { userId: app.userId, type: input.approve ? "application_approved" : "application_rejected", data: {} });
      return clone(app as TutorApplication);
    });
  },
};
