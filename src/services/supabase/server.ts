import "server-only";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { appConfig } from "@/config/app-config";
import { serverConfig } from "@/config/server-config";
import { isServiceError, ServiceError, type ServiceErrorCode } from "../errors";
import { toServiceError } from "./errors";

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

function publicEnv() {
  const { url, anonKey } = appConfig.supabase;
  if (!url || !anonKey) throw new ServiceError("not_configured", "Supabase environment variables are missing.");
  return { url, anonKey };
}

/** Bypasses Row Level Security. Only for functions that take the verified user as an argument. */
export function serviceClient(): SupabaseClient {
  if (!serverConfig.SUPABASE_SERVICE_ROLE_KEY) throw new ServiceError("not_configured", "SUPABASE_SERVICE_ROLE_KEY is missing.");
  return createClient(publicEnv().url, serverConfig.SUPABASE_SERVICE_ROLE_KEY, noSession);
}

/** Acts as the signed-in user, so database functions see them as `auth.uid()`. */
export function userClient(token: string): SupabaseClient {
  const { url, anonKey } = publicEnv();
  return createClient(url, anonKey, { ...noSession, global: { headers: { Authorization: `Bearer ${token}` } } });
}

/** Verifies the bearer token with Supabase Auth; never trusts identity from the request body. */
export async function authenticate(request: Request): Promise<{ user: User; token: string }> {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new ServiceError("unauthorized");
  const { data, error } = await serviceClient().auth.getUser(token);
  if (error || !data.user) throw new ServiceError("unauthorized");
  return { user: data.user, token };
}

export async function rpc<T>(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw toServiceError(error);
  return data as T;
}

const STATUS: Partial<Record<ServiceErrorCode, number>> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation: 422,
  contact_blocked: 422,
  classroom_closed: 409,
  rate_limited: 429,
  account_suspended: 403,
  not_configured: 503,
};

export function errorResponse(error: unknown): NextResponse {
  if (isServiceError(error)) {
    return NextResponse.json({ error: error.code, fields: error.fields, details: error.details }, { status: STATUS[error.code] ?? 400 });
  }
  // Details stay in the server log; the caller gets a generic failure.
  console.error("Route Handler failed:", error);
  return NextResponse.json({ error: "not_configured" }, { status: 500 });
}
