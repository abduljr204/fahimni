import { NextResponse } from "next/server";
import { deleteAccountSchema } from "@/domain/validation";
import { parseInput, ServiceError } from "@/services/errors";
import { authenticate, errorResponse, rpc, serviceClient } from "@/services/supabase/server";

/**
 * Deletes the signed-in user's account and personal data. Refused while they have upcoming paid
 * lessons. Bookings and payments stay, anonymised, for accounting.
 */
export async function DELETE(request: Request) {
  try {
    const { user } = await authenticate(request);
    const { confirmEmail } = parseInput(deleteAccountSchema, await request.json().catch(() => null));
    if (confirmEmail !== user.email?.toLowerCase()) {
      throw new ServiceError("validation", undefined, { confirmEmail: "emailMismatch" });
    }

    const admin = serviceClient();
    const { documentPaths } = await rpc<{ documentPaths: string[] }>(admin, "delete_account_data", { p_user: user.id });
    if (documentPaths.length) await admin.storage.from("tutor-documents").remove(documentPaths);

    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
