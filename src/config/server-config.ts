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
});

export const serverConfig = serverEnvSchema.parse({
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
  PAYMENT_PROVIDER_SECRET_KEY: process.env.PAYMENT_PROVIDER_SECRET_KEY || undefined,
  VIDEO_PROVIDER_API_KEY: process.env.VIDEO_PROVIDER_API_KEY || undefined,
  VIDEO_PROVIDER_API_SECRET: process.env.VIDEO_PROVIDER_API_SECRET || undefined,
  VIDEO_PROVIDER_URL: process.env.VIDEO_PROVIDER_URL || undefined,
});
