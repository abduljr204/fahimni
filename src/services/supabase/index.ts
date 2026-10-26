import type { AppServices } from "../contracts";
import { ServiceError } from "../errors";

/**
 * PRODUCTION MODE services (Phase 4).
 *
 * Each repository/service in `contracts.ts` will be implemented here on top of
 * `@supabase/supabase-js` and the schema in `supabase/migrations`. Writes that need
 * elevated privileges (payments, booking confirmation) go through Route Handlers or
 * database functions that run with the service-role key on the server only.
 *
 * Until then, every call fails loudly. There is deliberately no fallback to demo data.
 */
export function createSupabaseServices(): AppServices {
  const notConfigured = (): never => {
    throw new ServiceError(
      "not_configured",
      "Production services are not implemented yet. Set NEXT_PUBLIC_APP_MODE=prototype or complete Phase 4.",
    );
  };
  const service = new Proxy(
    {},
    {
      get: (_target, prop) => (prop === "kind" ? "live" : notConfigured),
    },
  );

  return {
    mode: "production",
    auth: service as AppServices["auth"],
    tutors: service as AppServices["tutors"],
    subjects: service as AppServices["subjects"],
    reviews: service as AppServices["reviews"],
    favorites: service as AppServices["favorites"],
    bookings: service as AppServices["bookings"],
    messaging: service as AppServices["messaging"],
    proposals: service as AppServices["proposals"],
    classroom: service as AppServices["classroom"],
    notifications: service as AppServices["notifications"],
    payments: service as AppServices["payments"],
    dashboard: service as AppServices["dashboard"],
    platform: service as AppServices["platform"],
  };
}

/** True once the production services above are implemented and configured. */
export const productionServicesReady = false;
