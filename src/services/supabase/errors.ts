import { ServiceError, type ServiceErrorCode } from "../errors";

const KNOWN_CODES: readonly ServiceErrorCode[] = [
  "unauthorized",
  "forbidden",
  "not_found",
  "validation",
  "slot_unavailable",
  "price_changed",
  "contact_blocked",
  "classroom_closed",
  "proposal_unavailable",
  "account_suspended",
  "rate_limited",
  "not_configured",
];

function parseJson(text?: string | null): Record<string, string> | undefined {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Database functions raise the service error code as the exception message, with any
 * structured data as JSON in the detail: form fields for `validation`, details otherwise.
 */
export function toServiceError(error: { message?: string; code?: string; details?: string | null }): Error {
  switch (error.code) {
    case "23P01": // The exclusion constraint on bookings: someone took the slot first.
      return new ServiceError("slot_unavailable");
    case "22P02": // Not a valid id, so it can't exist.
      return new ServiceError("not_found");
    case "23514": // A check constraint rejected a value.
      return new ServiceError("validation");
    case "42501":
      return new ServiceError("forbidden");
    case "PGRST301":
    case "PGRST303":
      return new ServiceError("unauthorized");
  }
  const code = KNOWN_CODES.find((c) => c === error.message);
  if (code) {
    const extra = parseJson(error.details);
    return code === "validation" ? new ServiceError(code, undefined, extra) : new ServiceError(code, undefined, undefined, extra);
  }
  if (error.message === "rate_out_of_range") return new ServiceError("validation", undefined, { amountMinor: "rateOutOfRange" });
  return new Error(error.message ?? "Unexpected database error");
}
