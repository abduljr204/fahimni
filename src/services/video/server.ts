import "server-only";
import { serverConfig } from "@/config/server-config";
import type { ClassroomRole } from "@/domain/types";
import { ServiceError } from "../errors";

/**
 * Issues video-access tokens with Daily (https://docs.daily.co/reference/rest-api). The API
 * key stays on the server; browsers only ever receive a short-lived token for one room.
 *
 * Who may ask is decided by the caller, `POST /api/classroom/[bookingId]/token`, which in
 * production first calls the database function `classroom_ticket` as the signed-in user
 * (supabase/migrations/0005_production_api.sql).
 */

const DAILY_API = "https://api.daily.co/v1";

export interface VideoTokenRequest {
  bookingId: string;
  userId: string;
  role: ClassroomRole;
  displayName: string;
  expiresAt: Date;
}

async function daily(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> }> {
  const response = await fetch(`${DAILY_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serverConfig.VIDEO_PROVIDER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return { status: response.status, json: (await response.json().catch(() => ({}))) as Record<string, unknown> };
}

/** Creates the lesson's private room, or extends it if it already exists. Recording stays off. */
async function ensureRoom(name: string, exp: number): Promise<void> {
  const properties = { exp, eject_at_room_exp: true, max_participants: 4 };
  const created = await daily("/rooms", { name, privacy: "private", properties });
  if (created.status < 300) return;
  // Daily answers 400 when the name is taken: the other participant got there first.
  const updated = await daily(`/rooms/${encodeURIComponent(name)}`, { properties });
  if (updated.status >= 300) throw new ServiceError("not_configured", `Daily refused the room (${updated.status}).`);
}

export async function issueVideoToken(request: VideoTokenRequest): Promise<{ token: string; serverUrl: string; roomName: string }> {
  if (!serverConfig.VIDEO_PROVIDER_API_KEY || !serverConfig.VIDEO_PROVIDER_URL) {
    throw new ServiceError("not_configured", "VIDEO_PROVIDER_API_KEY and VIDEO_PROVIDER_URL must be set.");
  }
  const roomName = `lesson-${request.bookingId}`;
  const exp = Math.floor(request.expiresAt.getTime() / 1000);
  await ensureRoom(roomName, exp);

  const { status, json } = await daily("/meeting-tokens", {
    properties: {
      room_name: roomName,
      user_id: request.userId,
      user_name: request.displayName,
      exp,
      is_owner: false,
      // Enforced by Daily, not just hidden in the UI: only the tutor can share a screen.
      enable_screenshare: request.role === "tutor",
    },
  });
  if (status >= 300 || typeof json.token !== "string") throw new ServiceError("not_configured", `Daily refused the token (${status}).`);
  return { token: json.token, serverUrl: `${serverConfig.VIDEO_PROVIDER_URL.replace(/\/$/, "")}/${roomName}`, roomName };
}
