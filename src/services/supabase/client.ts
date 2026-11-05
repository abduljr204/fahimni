import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { appConfig } from "@/config/app-config";
import type { Attachment } from "@/domain/types";
import type { AttachmentInput } from "@/domain/validation";
import { ServiceError, type ServiceErrorCode } from "../errors";
import { toServiceError } from "./errors";

let client: SupabaseClient | null = null;

/** The browser's connection, signed in as the current user. Only ever holds the public key. */
export function supabase(): SupabaseClient {
  if (!client) {
    const { url, anonKey } = appConfig.supabase;
    if (!url || !anonKey) throw new ServiceError("not_configured", "Supabase environment variables are missing.");
    client = createClient(url, anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  }
  return client;
}

/** Calls a database function from supabase/migrations/0005_production_api.sql. */
export async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw toServiceError(error);
  return data as T;
}

/** Calls a Route Handler for the rules that need server code, as the signed-in user. */
export async function callServer<T>(path: string, method: "POST" | "DELETE", body?: unknown): Promise<T> {
  const { data } = await supabase().auth.getSession();
  if (!data.session) throw new ServiceError("unauthorized");
  const response = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const code = (json?.error ?? "not_configured") as ServiceErrorCode;
    throw new ServiceError(code, json?.message, json?.fields, json?.details);
  }
  return json as T;
}

// ─── Private files ──────────────────────────────────────────────────────────

export type Bucket = "chat-attachments" | "tutor-documents";

export interface StoredFile {
  path: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

/** Forms hold picked files as data URLs; this moves one into private storage under `folder`. */
export async function uploadFile(bucket: Bucket, folder: string, file: AttachmentInput): Promise<StoredFile> {
  const blob = await (await fetch(file.url)).blob();
  const path = `${folder}/${crypto.randomUUID()}.${EXTENSIONS[file.mimeType] ?? "bin"}`;
  const { error } = await supabase().storage.from(bucket).upload(path, blob, { contentType: file.mimeType });
  if (error) throw new ServiceError("forbidden", error.message);
  return { path, name: file.name, mimeType: file.mimeType, sizeBytes: file.sizeBytes, width: file.width, height: file.height };
}

const SIGNED_URL_SECONDS = 60 * 60;

/** Fills in short-lived links for stored files. Files the viewer can't read keep an empty link. */
export async function signFiles<T extends Attachment & { path?: string }>(bucket: Bucket, files: T[]): Promise<T[]> {
  const paths = files.map((f) => f.path).filter((p): p is string => Boolean(p));
  if (paths.length === 0) return files;
  const { data } = await supabase().storage.from(bucket).createSignedUrls(paths, SIGNED_URL_SECONDS);
  const urls = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return files.map((f) => ({ ...f, url: (f.path && urls.get(f.path)) || "" }));
}
