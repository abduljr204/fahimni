import { NextResponse } from "next/server";
import { detectContactDetails } from "@/domain/contact-guard";
import { createProposalSchema } from "@/domain/validation";
import { parseInput, ServiceError } from "@/services/errors";
import { authenticate, errorResponse, rpc, serviceClient } from "@/services/supabase/server";

/** Creates a lesson proposal. Before payment, the area can't be an exact address. */
export async function POST(request: Request) {
  try {
    const { user } = await authenticate(request);
    const input = parseInput(createProposalSchema, await request.json().catch(() => null));
    const admin = serviceClient();

    if (input.area && input.mode === "in_person") {
      const unlocked = await rpc<boolean>(admin, "conversation_unlocked", { c: input.conversationId });
      const findings = unlocked ? [] : detectContactDetails(input.area);
      if (findings.length) throw new ServiceError("contact_blocked", undefined, { area: "exactPlace" }, findings);
    }

    const proposal = await rpc(admin, "create_proposal_as", {
      p_actor: user.id,
      p_conversation: input.conversationId,
      p_subject: input.subjectId,
      p_objectives: input.objectives,
      p_starts_at: input.startsAt,
      p_duration: input.durationMinutes,
      p_mode: input.mode,
      p_area: input.area ?? null,
    });
    return NextResponse.json(proposal);
  } catch (error) {
    return errorResponse(error);
  }
}
