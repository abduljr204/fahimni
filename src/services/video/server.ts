import "server-only";
import { serverConfig } from "@/config/server-config";
import type { ClassroomRole } from "@/domain/types";
import { ServiceError } from "../errors";

/**
 * PRODUCTION integration point: issues video-access tokens. Called from a Route Handler
 * (e.g. `POST /api/classroom/[bookingId]/token`) that runs with the user's session:
 *
 *  1. Call the database function `classroom_access(booking_id)` as the signed-in user
 *     (supabase/migrations/0003_pre_booking_and_classroom.sql). It returns the caller's role
 *     only if they are the tutor, the booked student or that student's parent, the lesson is
 *     online, confirmed and paid, and the entry window is open. Otherwise it raises.
 *  2. Mint a short-lived token for room `lesson-<bookingId>` with that identity and role,
 *     using the provider's server SDK and the secret below. Disable recording in the room
 *     options; recording must stay off unless both sides opt in (see the docs).
 *  3. Return a `ClassroomTicket`. The token expires with the classroom window, so a shared
 *     URL or a leaked token stops working quickly.
 */
export interface VideoTokenRequest {
  bookingId: string;
  userId: string;
  role: ClassroomRole;
  displayName: string;
  expiresAt: Date;
}

export async function issueVideoToken(request: VideoTokenRequest): Promise<{ token: string; serverUrl: string }> {
  if (!serverConfig.VIDEO_PROVIDER_API_KEY || !serverConfig.VIDEO_PROVIDER_API_SECRET || !serverConfig.VIDEO_PROVIDER_URL) {
    throw new ServiceError("not_configured", "VIDEO_PROVIDER_API_KEY, VIDEO_PROVIDER_API_SECRET and VIDEO_PROVIDER_URL must be set.");
  }
  void request;
  // Example with LiveKit: new AccessToken(key, secret, { identity: userId, ttl }).addGrant({ room, roomJoin: true, canPublish: true }).
  throw new ServiceError("not_configured", "No video provider adapter is implemented yet.");
}
