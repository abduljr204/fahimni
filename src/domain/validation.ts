import { z } from "zod";
import { brand } from "@/config/app-config";
import { ageFromBirthYear, isMinor, MIN_CHILD_AGE, normalizeLibyanPhone } from "./accounts";
import { MAX_COMMISSION_BPS } from "./pricing";

/**
 * Input schemas shared by forms (client-side feedback) and services (authoritative
 * validation). Production services must re-validate on the server; never trust the client.
 * Error messages are dictionary keys under `validation.*`.
 */

const fullName = z.string().trim().min(3, "nameTooShort").max(60, "nameTooLong");
const email = z.email("emailInvalid").trim().toLowerCase();
const password = z.string().min(8, "passwordTooShort").max(72, "passwordTooLong");
const birthYear = z.coerce.number().int("required").min(1940, "required").max(new Date().getFullYear(), "required");
/** Optional Libyan mobile number, stored in +218 form. */
const phone = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || normalizeLibyanPhone(v) !== null, "phoneInvalid")
  .transform((v) => (v ? normalizeLibyanPhone(v)! : undefined));
const gradeLevel = z.enum(["secondary", "university_early", "university_advanced", "postgraduate"]);

export const signUpSchema = z.object({
  fullName,
  email,
  password,
  university: z.string().trim().min(2, "required").max(80),
  major: z.string().trim().min(2, "required").max(80),
  studyYear: z.coerce.number().int().min(1, "required").max(8),
  // Younger students are registered by a parent instead (see parentSignUpSchema).
  birthYear: birthYear.refine((y) => !isMinor(y), "underAge"),
  acceptTerms: z.literal(true, { error: "acceptTerms" }),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.email("emailInvalid").trim().toLowerCase(),
  password: z.string().min(1, "required"),
});
export type SignInInput = z.infer<typeof signInSchema>;

/** A younger student registered and managed by their parent. */
export const childSchema = z.object({
  fullName,
  level: gradeLevel,
  school: z.string().trim().min(2, "required").max(80),
  studyYear: z.coerce.number().int().min(1, "required").max(12),
  birthYear: birthYear.refine((y) => isMinor(y) && ageFromBirthYear(y) >= MIN_CHILD_AGE, "childAge"),
});
export type ChildInput = z.infer<typeof childSchema>;

export const parentSignUpSchema = z.object({
  fullName,
  email,
  password,
  phone,
  child: childSchema,
  acceptTerms: z.literal(true, { error: "acceptTerms" }),
  guardianConsent: z.literal(true, { error: "guardianConsent" }),
});
export type ParentSignUpInput = z.input<typeof parentSignUpSchema>;

export const passwordResetRequestSchema = z.object({ email });

export const passwordResetSchema = z.object({
  token: z.string().min(1, "resetLinkInvalid"),
  password,
});

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, "required"), newPassword: password })
  .refine((v) => v.currentPassword !== v.newPassword, { message: "samePassword", path: ["newPassword"] });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const accountProfileSchema = z.object({
  fullName,
  phone,
  university: z.string().trim().min(2, "required").max(80).optional(),
  major: z.string().trim().min(2, "required").max(80).optional(),
  studyYear: z.coerce.number().int().min(1).max(12).optional(),
});
export type AccountProfileInput = z.input<typeof accountProfileSchema>;

const channelPrefs = z.object({ lessons: z.boolean(), messages: z.boolean(), account: z.boolean() });
export const preferencesSchema = z.object({ email: channelPrefs, sms: channelPrefs, push: channelPrefs });

export const deleteAccountSchema = z.object({ confirmEmail: email });

const settlementSchema = z.enum(["in_app", "deposit_and_cash"]);

/**
 * The amounts the student saw and agreed to. If the tutor's rate, the commission or the
 * payment split changed in the meantime, the request is rejected with `price_changed`.
 */
const expectedPrice = {
  expectedTotalMinor: z.number().int().nonnegative(),
  expectedDueInAppMinor: z.number().int().nonnegative(),
};

export const createBookingSchema = z.object({
  tutorId: z.string().min(1),
  subjectId: z.string().min(1, "pickSubject"),
  startsAt: z.iso.datetime({ offset: true, error: "pickTime" }),
  durationMinutes: z
    .number()
    .refine((d) => (brand.lessonDurations as readonly number[]).includes(d), "required"),
  mode: z.enum(["online", "in_person"]),
  note: z.string().trim().max(500, "noteTooLong").optional(),
  settlement: settlementSchema,
  /** Parents book for a managed student; students leave it out. */
  forStudentId: z.string().min(1).optional(),
  ...expectedPrice,
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

/** Tutor's offer, sent from the conversation. The price comes from the tutor's current rate. */
export const createProposalSchema = z.object({
  conversationId: z.string().min(1),
  subjectId: z.string().min(1, "pickSubject"),
  objectives: z.string().trim().min(10, "objectivesTooShort").max(600, "noteTooLong"),
  startsAt: z.iso.datetime({ offset: true, error: "pickTime" }),
  durationMinutes: z
    .number()
    .refine((d) => (brand.lessonDurations as readonly number[]).includes(d), "required"),
  mode: z.enum(["online", "in_person"]),
  /** City or district only; the service rejects exact addresses before payment. */
  area: z.string().trim().max(80, "noteTooLong").optional(),
});
export type CreateProposalInput = z.infer<typeof createProposalSchema>;

export const acceptProposalSchema = z.object({
  proposalId: z.string().min(1),
  settlement: settlementSchema,
  ...expectedPrice,
});
export type AcceptProposalInput = z.infer<typeof acceptProposalSchema>;

/** Tutors set whole-dinar hourly rates; the platform limits are checked by the service. */
export const hourlyRateSchema = z.object({
  amountMinor: z.number().int().positive("required"),
  currency: z.literal(brand.currency),
});

export const platformSettingsSchema = z
  .object({
    commissionBps: z.number().int().min(0, "commissionRange").max(MAX_COMMISSION_BPS, "commissionRange"),
    minHourlyRateMinor: z.number().int().positive("required"),
    maxHourlyRateMinor: z.number().int().positive("required"),
    inPersonPaymentOptions: z.array(settlementSchema).min(1, "pickPaymentOption"),
    classroomOpensMinutesBefore: z.number().int().min(0, "windowRange").max(120, "windowRange"),
    classroomClosesMinutesAfter: z.number().int().min(0, "windowRange").max(120, "windowRange"),
  })
  .refine((s) => s.minHourlyRateMinor <= s.maxHourlyRateMinor, { message: "minAboveMax", path: ["maxHourlyRateMinor"] });
export type PlatformSettingsInput = z.infer<typeof platformSettingsSchema>;

/** Textbook pages and exercises: images or PDFs. */
export const ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS = 4;

export const attachmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  mimeType: z.enum(ATTACHMENT_TYPES, { error: "fileType" }),
  sizeBytes: z.number().int().positive().max(MAX_ATTACHMENT_BYTES, "fileTooLarge"),
  url: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});
export type AttachmentInput = z.infer<typeof attachmentSchema>;

export const sendMessageSchema = z
  .object({
    conversationId: z.string().min(1),
    body: z.string().trim().max(2000, "messageTooLong"),
    attachments: z.array(attachmentSchema).max(MAX_ATTACHMENTS, "tooManyFiles").default([]),
  })
  .refine((m) => m.body.length > 0 || m.attachments.length > 0, { message: "required", path: ["body"] });
export type SendMessageInput = z.input<typeof sendMessageSchema>;

export const reviewSchema = z.object({
  bookingId: z.string().min(1),
  rating: z.number().int().min(1, "pickRating").max(5),
  comment: z.string().trim().max(600, "noteTooLong").optional(),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

export const availabilitySchema = z
  .array(
    z
      .object({
        weekday: z.number().int().min(0).max(6),
        start: z.string().regex(/^\d{2}:\d{2}$/),
        end: z.string().regex(/^\d{2}:\d{2}$/),
      })
      .refine((w) => w.start < w.end, "invalidRange"),
  )
  .max(28);

/** Flattens a Zod error into `{ field: messageKey }` for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

// ─── Tutor onboarding ───────────────────────────────────────────────────────

const spokenLanguage = z.enum(["ar", "libyan", "fr", "en", "amazigh"]);

/** The public part of a tutor profile: used when applying and when editing later. */
export const tutorProfileSchema = z.object({
  headline: z.string().trim().min(10, "headlineTooShort").max(80, "nameTooLong"),
  bio: z.string().trim().min(40, "bioTooShort").max(1000, "noteTooLong"),
  university: z.string().trim().min(2, "required").max(80),
  city: z.string().trim().min(2, "required").max(40),
  languages: z.array(spokenLanguage).min(1, "pickOne"),
  modes: z.array(z.enum(["online", "in_person"])).min(1, "pickOne"),
  gradeLevels: z.array(gradeLevel).min(1, "pickOne"),
  subjectIds: z.array(z.string().min(1)).min(1, "pickSubjects").max(6, "tooManySubjects"),
  qualifications: z.array(z.string().trim().min(3, "required").max(120, "nameTooLong")).min(1, "addQualification").max(6),
});
export type TutorProfileInput = z.infer<typeof tutorProfileSchema>;

export const tutorDocumentSchema = z.object({ kind: z.enum(["identity", "qualification"]), file: attachmentSchema });

/** A new tutor applies with an account, a profile, a rate and documents for verification. */
export const tutorApplicationSchema = tutorProfileSchema.extend({
  fullName,
  email,
  password,
  phone,
  hourlyRateMinor: z.number().int().positive("required"),
  documents: z
    .array(tutorDocumentSchema)
    .max(6, "tooManyFiles")
    .refine((d) => d.some((x) => x.kind === "identity") && d.some((x) => x.kind === "qualification"), "documentsRequired"),
  acceptTerms: z.literal(true, { error: "acceptTerms" }),
  verificationConsent: z.literal(true, { error: "verificationConsent" }),
});
export type TutorApplicationInput = z.input<typeof tutorApplicationSchema>;

export const reviewApplicationSchema = z
  .object({ applicationId: z.string().min(1), approve: z.boolean(), note: z.string().trim().max(500, "noteTooLong").optional() })
  .refine((v) => v.approve || (v.note?.length ?? 0) >= 5, { message: "reasonRequired", path: ["note"] });
export type ReviewApplicationInput = z.infer<typeof reviewApplicationSchema>;

// ─── Trust & safety ─────────────────────────────────────────────────────────

const REPORT_REASONS = ["spam", "harassment", "inappropriate", "off_platform", "fake_profile", "safety", "other"] as const;
const DISPUTE_REASONS = ["no_show", "quality", "billing", "other"] as const;

export const reportSchema = z
  .object({
    kind: z.enum(["report", "dispute"]),
    targetUserId: z.string().min(1),
    reason: z.enum([...REPORT_REASONS, ...DISPUTE_REASONS]),
    details: z.string().trim().max(1000, "noteTooLong").default(""),
    messageId: z.string().optional(),
    conversationId: z.string().optional(),
    bookingId: z.string().optional(),
  })
  .refine((r) => (r.kind === "dispute" ? (DISPUTE_REASONS as readonly string[]).includes(r.reason) : (REPORT_REASONS as readonly string[]).includes(r.reason)), {
    message: "required",
    path: ["reason"],
  })
  .refine((r) => r.kind !== "dispute" || Boolean(r.bookingId), { message: "required", path: ["bookingId"] })
  .refine((r) => r.reason !== "other" || r.details.length >= 10, { message: "detailsRequired", path: ["details"] });
export type ReportInput = z.input<typeof reportSchema>;

export const resolveReportSchema = z.object({
  reportId: z.string().min(1),
  action: z.enum(["none", "warning", "suspend", "unpublish", "refund"]),
  dismiss: z.boolean().default(false),
  note: z.string().trim().min(3, "reasonRequired").max(500, "noteTooLong"),
  refundMinor: z.number().int().nonnegative().optional(),
});
export type ResolveReportInput = z.input<typeof resolveReportSchema>;
