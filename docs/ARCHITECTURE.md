# Architecture & production conversion guide

The prototype is built so that going live means **implementing service interfaces
and configuring infrastructure, not rewriting screens**.

## Layers

```
src/
├─ app/[lang]/…          Routes only. Thin server pages that render a feature screen.
├─ features/…            Screens and feature components (UI + view state).
├─ components/ui|layout  Reusable, data-agnostic UI primitives and the app shell.
├─ hooks/use-data.ts     The ONLY bridge from UI to data (TanStack Query wrappers).
├─ services/
│  ├─ contracts.ts       Interfaces: AuthService, TutorRepository, BookingService, …
│  ├─ index.ts           getServices(): picks the implementation from the app mode.
│  ├─ mock/              PROTOTYPE implementation (seed data, simulator, localStorage).
│  └─ supabase/          PRODUCTION implementation (Phase 4 — currently fails loudly).
├─ domain/               Framework-free types, business rules, Zod validation.
├─ i18n/                 Locale config, ar/en dictionaries, formatting provider.
└─ config/               Typed environment config (public vs server-only).
supabase/migrations/     Production schema with Row Level Security and booking functions.
```

Rules that keep the seams clean:

- Screens never import from `services/mock` or `services/supabase`; they call hooks.
- Hooks never know which backend is active; they call `getServices()`.
- Business rules (slot generation, pricing, cancellation) live in `domain/` and are
  mirrored by database functions so the server stays authoritative.
- All user-facing strings live in `i18n/dictionaries`. `ar.ts` defines the shape;
  a missing English key is a type error.

## Prototype vs production safety

- `NEXT_PUBLIC_APP_MODE` selects the implementation (`src/config/app-config.ts`).
- Every seeded or simulated record carries `isDemo: true`; production services must call
  `assertNotDemo()` (`src/services/errors.ts`) on anything they return.
- Production mode never falls back to mock data. Until `productionServicesReady` is
  true it renders a "not configured" screen.
- Secrets live only in `src/config/server-config.ts`, which imports `server-only`, so
  using it from a Client Component fails the build.

## Phase 4 checklist (after prototype approval)

1. Create a Supabase project and run `supabase/migrations/0001_init.sql`. Seed `subjects`.
2. `npm i @supabase/supabase-js @supabase/ssr`; add a browser client and a server client.
3. Implement each interface in `src/services/supabase/` (one file per service, mirroring
   `services/mock/`):
   - `auth` → Supabase Auth (email + password, email verification).
   - `tutors`, `subjects`, `reviews`, `favorites` → table queries (RLS enforces access).
   - `bookings.create / respond / cancel`, `reviews.create` → the `create_booking`,
     `respond_to_booking`, `cancel_booking` and `submit_review` RPCs. The exclusion
     constraint prevents double-booking.
   - `bookings.getAvailableSlots` → availability windows + bookings, then
     `domain/booking-rules.generateDaySlots` (or a SQL function).
   - `messaging.subscribe`, `notifications.subscribe` → Supabase Realtime channels.
   - `proposals`, `classroom`, messaging moderation and video tokens → see
     [PRE_BOOKING_AND_CLASSROOM.md](PRE_BOOKING_AND_CLASSROOM.md) (migration 0003).
   - `payments` → a Route Handler that talks to the payment provider with the secret key;
     only mark bookings paid from the provider's webhook.
4. Flip `productionServicesReady` to true and set the env vars (see `.env.example`).
5. Replace `services.demo` usage: it is undefined in production, and the UI already hides
   role switching and reset when it is missing. Tutor onboarding needs its own flow.

## Phase 5 (launch preparation)

- Protected routes: add a session check in `src/proxy.ts` (redirect to sign-in) in
  addition to RLS. Never rely on the client-side `AuthGate` for security.
- Validation: every RPC and Route Handler re-validates with the Zod schemas in
  `domain/validation.ts`.
- Rate-limit sign-up, messaging and booking endpoints.
- Monitoring: error tracking (e.g. Sentry) via `instrumentation.ts`, uptime checks,
  database backups.
- Admin: tutor verification queue (the `verification` column is admin-only by trigger).
- Legal: terms, privacy policy, data retention and deletion flow.
- E2E tests for sign-up → search → book → message → tutor accept, in both languages.

## Animation system

Motion tokens live in `src/lib/motion.ts` (springs, fades, staggers). `<MotionConfig
reducedMotion="user">` in `app/providers.tsx` plus the CSS media query in `globals.css`
honour the OS reduced-motion setting, and confetti is skipped in that case.

## Next.js 16 notes

- `cacheComponents` is on: routes are kept alive with React `<Activity>` when you
  navigate away, so screens that finish a flow (booking) reset themselves on hide.
- Components that read the URL (`usePathname`) or the clock must be inside `<Suspense>`
  or use `useNow()`, otherwise `next build` fails prerendering.
- `middleware` is now `proxy` (`src/proxy.ts`) and handles locale redirects.
