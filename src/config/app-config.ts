import { z } from "zod";

/**
 * Runtime configuration.
 *
 * Only `NEXT_PUBLIC_*` variables are readable in the browser. Secrets such as the
 * Supabase service-role key must never be prefixed with NEXT_PUBLIC_ and must only
 * be read from server code (see `src/config/server-config.ts`).
 */

export const APP_MODES = ["prototype", "production"] as const;
export type AppMode = (typeof APP_MODES)[number];

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_MODE: z.enum(APP_MODES).default("prototype"),
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
});

// Next.js inlines NEXT_PUBLIC_* values at build time, so they must be referenced literally.
const parsed = publicEnvSchema.safeParse({
  NEXT_PUBLIC_APP_MODE: process.env.NEXT_PUBLIC_APP_MODE || undefined,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
});

if (!parsed.success) {
  throw new Error(`Invalid public environment configuration: ${parsed.error.message}`);
}

const env = parsed.data;

export const appConfig = {
  mode: env.NEXT_PUBLIC_APP_MODE,
  isPrototype: env.NEXT_PUBLIC_APP_MODE === "prototype",
  supabase: {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    get isConfigured() {
      return Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    },
  },
} as const;

/** Product-level settings that are not secrets and may differ per market. */
export const brand = {
  name: { ar: "نقراو", en: "Naqraw" },
  tagline: { ar: "نقراو مع بعض", en: "Let's study together" },
  currency: "MAD",
  supportEmail: "hello@naqraw.example",
  lessonDurations: [30, 60, 90] as const,
  bookingWindowDays: 14,
} as const;
