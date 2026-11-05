import { NextResponse } from "next/server";
import { z } from "zod";
import { appConfig } from "@/config/app-config";
import { serverConfig } from "@/config/server-config";
import type { ClassroomTicket } from "@/domain/types";
import { isServiceError } from "@/services/errors";
import { authenticate, errorResponse, rpc, userClient } from "@/services/supabase/server";
import { issueVideoToken } from "@/services/video/server";

const bodySchema = z.object({
  userId: z.string().min(1).max(64),
  displayName: z.string().trim().min(1).max(60),
  role: z.enum(["tutor", "student", "guardian"]),
});

/** Prototype only: tokens last as long as the classroom could reasonably stay open. */
const TEST_TOKEN_LIFETIME_MS = 3 * 60 * 60_000;

/**
 * Production: the database decides who may enter, as the signed-in user, inside the lesson's entry
 * window. Identity and role come from there, never from the request.
 */
async function liveTicket(request: Request, bookingId: string): Promise<NextResponse> {
  try {
    const { token } = await authenticate(request);
    const ticket = await rpc<Omit<ClassroomTicket, "token" | "provider" | "serverUrl">>(userClient(token), "classroom_ticket", { p_booking: bookingId });
    const issued = await issueVideoToken({
      bookingId,
      userId: ticket.me.userId,
      role: ticket.me.role,
      displayName: ticket.me.displayName.ar ?? ticket.me.displayName.en ?? "Participant",
      expiresAt: new Date(ticket.expiresAt),
    });
    return NextResponse.json({ ...ticket, ...issued });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Prototype accounts live in the browser, so this branch can't verify who is asking. It answers
 * only under `next dev` with VIDEO_TEST_MODE=true, where the caller is the developer.
 */
async function testTicket(request: Request, bookingId: string): Promise<NextResponse> {
  const testMode = process.env.NODE_ENV !== "production" && serverConfig.VIDEO_TEST_MODE === "true";
  if (!testMode) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "validation" }, { status: 400 });

  const expiresAt = new Date(Date.now() + TEST_TOKEN_LIFETIME_MS);
  try {
    const issued = await issueVideoToken({ bookingId, ...parsed.data, expiresAt });
    return NextResponse.json({ ...issued, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    const message = isServiceError(error) ? error.message : "Video service unavailable";
    console.error("Classroom token failed:", message);
    return NextResponse.json({ error: "not_configured" }, { status: 502 });
  }
}

export async function POST(request: Request, ctx: RouteContext<"/api/classroom/[bookingId]/token">) {
  const { bookingId } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(bookingId)) return NextResponse.json({ error: "validation" }, { status: 400 });
  return appConfig.isPrototype ? testTicket(request, bookingId) : liveTicket(request, bookingId);
}
