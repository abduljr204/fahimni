import { z } from "zod";
import { brand } from "@/config/app-config";
import { MAX_COMMISSION_BPS } from "./pricing";

/**
 * Input schemas shared by forms (client-side feedback) and services (authoritative
 * validation). Production services must re-validate on the server; never trust the client.
 * Error messages are dictionary keys under `validation.*`.
 */

export const signUpSchema = z.object({
  fullName: z.string().trim().min(3, "nameTooShort").max(60, "nameTooLong"),
  email: z.email("emailInvalid").trim().toLowerCase(),
  password: z.string().min(8, "passwordTooShort").max(72, "passwordTooLong"),
  university: z.string().trim().min(2, "required").max(80),
  major: z.string().trim().min(2, "required").max(80),
  studyYear: z.coerce.number().int().min(1, "required").max(8),
  acceptTerms: z.literal(true, { error: "acceptTerms" }),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({
  email: z.email("emailInvalid").trim().toLowerCase(),
  password: z.string().min(1, "required"),
});
export type SignInInput = z.infer<typeof signInSchema>;

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
