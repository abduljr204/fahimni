import { z } from "zod";
import { brand } from "@/config/app-config";

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

export const createBookingSchema = z.object({
  tutorId: z.string().min(1),
  subjectId: z.string().min(1, "pickSubject"),
  startsAt: z.iso.datetime({ offset: true, error: "pickTime" }),
  durationMinutes: z
    .number()
    .refine((d) => (brand.lessonDurations as readonly number[]).includes(d), "required"),
  mode: z.enum(["online", "in_person"]),
  note: z.string().trim().max(500, "noteTooLong").optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const sendMessageSchema = z.object({
  conversationId: z.string().min(1),
  body: z.string().trim().min(1, "required").max(2000, "messageTooLong"),
});

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
