import { DEFAULT_PREFERENCES } from "@/domain/notifications";
import type { ApplicationDetails, ManagedStudent, NotificationPreferences, OutboundMessage, Session, TutorApplication, TutorProfile } from "@/domain/types";
import {
  accountProfileSchema,
  changePasswordSchema,
  childSchema,
  deleteAccountSchema,
  preferencesSchema,
  reviewApplicationSchema,
  tutorApplicationSchema,
  tutorProfileSchema,
} from "@/domain/validation";
import { getSettings } from "./catalog";
import type { AccountService, TutorOnboardingService } from "../contracts";
import { parseInput, ServiceError } from "../errors";
import { createAccount, emitSession, loadSession } from "./auth";
import { call, callServer, signFiles, supabase, uploadFile } from "./client";
import { isRateWithinLimits } from "@/domain/pricing";
import { brand } from "@/config/app-config";

export const supabaseAccountService: AccountService = {
  async updateProfile(_actor, raw) {
    const input = parseInput(accountProfileSchema, raw);
    const session = await call<Session>("update_my_profile", {
      p_full_name: input.fullName,
      p_phone: input.phone ?? null,
      p_university: input.university ?? null,
      p_major: input.major ?? null,
      p_study_year: input.studyYear ?? null,
    });
    // Refresh everyone's view of the session (name changes show up immediately).
    emitSession(session);
    return session;
  },

  async changePassword(_actor, raw) {
    const input = parseInput(changePasswordSchema, raw);
    const { data } = await supabase().auth.getUser();
    if (!data.user?.email) throw new ServiceError("unauthorized");
    const check = await supabase().auth.signInWithPassword({ email: data.user.email, password: input.currentPassword });
    if (check.error) throw new ServiceError("validation", undefined, { currentPassword: "wrongPassword" });
    const { error } = await supabase().auth.updateUser({ password: input.newPassword });
    if (error) throw new ServiceError("validation", undefined, { newPassword: "samePassword" });
  },

  async getPreferences() {
    return (await call<NotificationPreferences | null>("get_preferences")) ?? DEFAULT_PREFERENCES;
  },

  updatePreferences(_actor, raw) {
    return call("update_preferences", { p_prefs: parseInput(preferencesSchema, raw) });
  },

  listDeliveries() {
    return call<OutboundMessage[]>("list_deliveries");
  },

  async addChild(_actor, raw) {
    const child = await call<ManagedStudent>("add_child", { p_child: parseInput(childSchema, raw) });
    emitSession(await loadSession());
    return child;
  },

  async deleteAccount(_actor, confirmEmail) {
    const input = parseInput(deleteAccountSchema, { confirmEmail });
    await callServer("/api/account", "DELETE", input);
    await supabase().auth.signOut({ scope: "local" });
    emitSession(null);
  },
};

async function withSignedDocuments<T extends TutorApplication>(application: T): Promise<T> {
  const files = await signFiles("tutor-documents", application.documents.map((d) => d.file));
  return { ...application, documents: application.documents.map((d, i) => ({ ...d, file: files[i] })) };
}

export const supabaseOnboardingService: TutorOnboardingService = {
  async apply(raw) {
    const input = parseInput(tutorApplicationSchema, raw);
    // Checked first, because the account can't be taken back once it exists.
    const rate = { currency: brand.currency, amountMinor: input.hourlyRateMinor };
    if (!isRateWithinLimits(rate, await getSettings())) {
      throw new ServiceError("validation", undefined, { hourlyRateMinor: "rateOutOfRange" });
    }
    await createAccount(input.email, input.password, { role: "tutor", full_name: input.fullName, phone: input.phone });

    const { data } = await supabase().auth.getUser();
    if (!data.user) throw new ServiceError("unauthorized");
    const folder = data.user.id;
    const documents = await Promise.all(
      input.documents.map(async (d) => ({ kind: d.kind, ...(await uploadFile("tutor-documents", folder, d.file)) })),
    );
    const session = await call<Session>("submit_tutor_application", {
      p: {
        headline: input.headline,
        bio: input.bio,
        university: input.university,
        city: input.city,
        languages: input.languages,
        modes: input.modes,
        gradeLevels: input.gradeLevels,
        subjectIds: input.subjectIds,
        qualifications: input.qualifications,
        hourlyRateMinor: input.hourlyRateMinor,
        documents,
      },
    });
    emitSession(session);
    return session;
  },

  async getMyApplication() {
    const application = await call<TutorApplication | null>("my_application");
    return application ? withSignedDocuments(application) : null;
  },

  updateProfile(_actor, tutorId, raw) {
    return call<TutorProfile>("update_tutor_profile", { p_tutor: tutorId, p: parseInput(tutorProfileSchema, raw) });
  },

  async listApplications() {
    return Promise.all((await call<ApplicationDetails[]>("list_applications")).map(withSignedDocuments));
  },

  reviewApplication(_actor, raw) {
    const input = parseInput(reviewApplicationSchema, raw);
    return call<TutorApplication>("review_application", { p_application: input.applicationId, p_approve: input.approve, p_note: input.note ?? null });
  },
};
