import { NextResponse } from "next/server";
import { detectContactDetails } from "@/domain/contact-guard";
import { storedMessageSchema } from "@/domain/validation";
import { parseInput, ServiceError } from "@/services/errors";
import { authenticate, errorResponse, rpc, serviceClient } from "@/services/supabase/server";

/**
 * Sends a chat message. Until the pair has a confirmed, paid booking, messages containing contact
 * details are refused here, on the server, so the check can't be skipped from the browser.
 */
export async function POST(request: Request) {
  try {
    const { user } = await authenticate(request);
    const input = parseInput(storedMessageSchema, await request.json().catch(() => null));
    const admin = serviceClient();

    const unlocked = await rpc<boolean>(admin, "conversation_unlocked", { c: input.conversationId });
    if (!unlocked) {
      const text = [input.body, ...input.attachments.map((a) => a.name)].join("\n");
      const findings = detectContactDetails(text);
      if (findings.length) {
        await rpc(admin, "record_blocked_attempt", { p_user: user.id, p_body: text });
        throw new ServiceError("contact_blocked", undefined, undefined, findings);
      }
    }

    const message = await rpc(admin, "send_message_as", {
      p_sender: user.id,
      p_conversation: input.conversationId,
      p_body: input.body,
      p_attachments: input.attachments,
    });
    return NextResponse.json(message);
  } catch (error) {
    return errorResponse(error);
  }
}
