import "server-only";
import { z } from "zod";

/**
 * Server-only secrets. Importing this file from a Client Component fails the build,
 * which keeps keys such as SUPABASE_SERVICE_ROLE_KEY out of the browser bundle.
 */
const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  PAYMENT_PROVIDER_SECRET_KEY: z.string().min(1).optional(),
});

export const serverConfig = serverEnvSchema.parse({
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
  PAYMENT_PROVIDER_SECRET_KEY: process.env.PAYMENT_PROVIDER_SECRET_KEY || undefined,
});
