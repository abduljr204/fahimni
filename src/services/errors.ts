import type { z } from "zod";
import { fieldErrors } from "@/domain/validation";

/** Typed service errors. `code` maps to a dictionary key so the UI can show a localized message. */
export type ServiceErrorCode =
  | "invalid_credentials"
  | "email_taken"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "slot_unavailable"
  | "price_changed"
  | "not_configured"
  | "demo_data_in_production";

export class ServiceError extends Error {
  constructor(
    public readonly code: ServiceErrorCode,
    message?: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message ?? code);
    this.name = "ServiceError";
  }
}

export function isServiceError(error: unknown, code?: ServiceErrorCode): error is ServiceError {
  return error instanceof ServiceError && (code === undefined || error.code === code);
}

/**
 * Guard used by production services: demo records must never surface as real data.
 * Throws if any record is flagged `isDemo`.
 */
export function assertNotDemo<T extends { isDemo?: boolean }>(records: T | T[]): void {
  const list = Array.isArray(records) ? records : [records];
  if (list.some((r) => r?.isDemo)) {
    throw new ServiceError("demo_data_in_production", "Demo records cannot be served in production mode.");
  }
}

/** Validates service input, converting Zod issues into a `validation` ServiceError. */
export function parseInput<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const result = schema.safeParse(raw);
  if (!result.success) throw new ServiceError("validation", undefined, fieldErrors(result.error));
  return result.data;
}
