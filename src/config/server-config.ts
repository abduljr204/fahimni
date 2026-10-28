import "server-only";
import { z } from "zod";

/**
 * Server-only secrets. Importing this file from a Client Component fails the build,
 * which keeps keys such as SUPABASE_SERVICE_ROLE_KEY out of the browser bundle.
 */
const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  PAYMENT_PROVIDER_SECRET_KEY: z.string().min(1).optional(),
  /** Video provider (e.g. LiveKit): used only to mint per-lesson access tokens. */
  VIDEO_PROVIDER_API_KEY: z.string().min(1).optional(),
  VIDEO_PROVIDER_API_SECRET: z.string().min(1).optional(),
  VIDEO_PROVIDER_URL: z.url().optional(),
  /** Email (e.g. Resend, SES): password resets, lesson news, receipts. */
  EMAIL_PROVIDER_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(3).optional(),
  /** SMS provider with Libyan coverage: lesson reminders. */
  SMS_PROVIDER_API_KEY: z.string().min(1).optional(),
  SMS_SENDER_ID: z.string().min(1).optional(),
  /** Web Push private key; the public key is NEXT_PUBLIC_VAPID_PUBLIC_KEY. */
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
});

export const serverConfig = serverEnvSchema.parse({
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
  PAYMENT_PROVIDER_SECRET_KEY: process.env.PAYMENT_PROVIDER_SECRET_KEY || undefined,
  VIDEO_PROVIDER_API_KEY: process.env.VIDEO_PROVIDER_API_KEY || undefined,
  VIDEO_PROVIDER_API_SECRET: process.env.VIDEO_PROVIDER_API_SECRET || undefined,
  VIDEO_PROVIDER_URL: process.env.VIDEO_PROVIDER_URL || undefined,
  EMAIL_PROVIDER_API_KEY: process.env.EMAIL_PROVIDER_API_KEY || undefined,
  EMAIL_FROM: process.env.EMAIL_FROM || undefined,
  SMS_PROVIDER_API_KEY: process.env.SMS_PROVIDER_API_KEY || undefined,
  SMS_SENDER_ID: process.env.SMS_SENDER_ID || undefined,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || undefined,
});
