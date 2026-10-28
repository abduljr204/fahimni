import { ServiceError } from "../errors";

/**
 * Spam protection: a sliding-window limit per user and action. The prototype keeps the
 * counters in memory; production should use a shared store (e.g. Upstash Redis or a
 * Postgres table) in the Route Handlers, keyed by user id and IP address.
 */
export const LIMITS = {
  message: { max: 20, windowMs: 60_000 },
  booking: { max: 5, windowMs: 10 * 60_000 },
  proposal: { max: 10, windowMs: 60 * 60_000 },
  report: { max: 5, windowMs: 60 * 60_000 },
  signUp: { max: 3, windowMs: 10 * 60_000 },
  passwordReset: { max: 3, windowMs: 15 * 60_000 },
} as const;

const hits = new Map<string, number[]>();

export function rateLimit(action: keyof typeof LIMITS, key: string, now = Date.now()): void {
  const { max, windowMs } = LIMITS[action];
  const id = `${action}:${key}`;
  const recent = (hits.get(id) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new ServiceError("rate_limited");
  recent.push(now);
  hits.set(id, recent);
}

/** Test helper. */
export function resetRateLimits(): void {
  hits.clear();
}
