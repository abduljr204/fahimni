import type { AuthError } from "@supabase/supabase-js";
import type { Session } from "@/domain/types";
import { parentSignUpSchema, passwordResetRequestSchema, passwordResetSchema, signInSchema, signUpSchema } from "@/domain/validation";
import type { AuthService } from "../contracts";
import { parseInput, ServiceError } from "../errors";
import { call, supabase } from "./client";

const listeners = new Set<(session: Session | null) => void>();
let lastUserId: string | null | undefined;

export function emitSession(session: Session | null): void {
  lastUserId = session?.user.id ?? null;
  listeners.forEach((l) => l(session));
}

export async function loadSession(): Promise<Session | null> {
  const { data } = await supabase().auth.getSession();
  if (!data.session) return null;
  return call<Session | null>("get_session");
}

function authError(error: AuthError): ServiceError {
  if (error.code === "user_already_exists" || error.code === "email_exists") {
    return new ServiceError("email_taken", undefined, { email: "emailTaken" });
  }
  if (error.code === "invalid_credentials") return new ServiceError("invalid_credentials");
  if (error.status === 429) return new ServiceError("rate_limited");
  return new ServiceError("validation", error.message);
}

/** Creates the auth user; a database trigger creates their profile from `metadata`. */
export async function createAccount(email: string, password: string, metadata: Record<string, unknown>): Promise<void> {
  const { data, error } = await supabase().auth.signUp({ email, password, options: { data: metadata } });
  if (error) throw authError(error);
  // No session means Supabase is waiting for the person to confirm their email address.
  if (!data.session) throw new ServiceError("not_configured", "Confirm email must be off in Supabase Auth; see docs/PRODUCTION_SETUP.md.");
}

async function completeSignIn(): Promise<Session> {
  const session = await loadSession();
  if (!session) throw new ServiceError("unauthorized");
  emitSession(session);
  return session;
}

export const supabaseAuthService: AuthService = {
  getSession: loadSession,

  async signUp(raw) {
    const input = parseInput(signUpSchema, raw);
    await createAccount(input.email, input.password, {
      role: "student",
      full_name: input.fullName,
      university: input.university,
      major: input.major,
      study_year: input.studyYear,
      birth_year: input.birthYear,
    });
    return completeSignIn();
  },

  async signUpParent(raw) {
    const input = parseInput(parentSignUpSchema, raw);
    await createAccount(input.email, input.password, { role: "parent", full_name: input.fullName, phone: input.phone, child: input.child });
    return completeSignIn();
  },

  async signIn(raw) {
    const input = parseInput(signInSchema, raw);
    const { error } = await supabase().auth.signInWithPassword({ email: input.email, password: input.password });
    if (error) throw authError(error);
    const session = await loadSession();
    if (!session) throw new ServiceError("invalid_credentials");
    if (session.user.suspendedAt) {
      await supabase().auth.signOut({ scope: "local" });
      throw new ServiceError("account_suspended");
    }
    emitSession(session);
    return session;
  },

  async signOut() {
    await supabase().auth.signOut({ scope: "local" });
    emitSession(null);
  },

  async requestPasswordReset(rawEmail) {
    const { email } = parseInput(passwordResetRequestSchema, { email: rawEmail });
    const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/reset-password` });
    if (error?.status === 429) throw new ServiceError("rate_limited");
    // Same answer whether or not the account exists.
    return {};
  },

  // `token` is the fragment of Supabase's reset link: access_token=…&refresh_token=…&type=recovery.
  async resetPassword(token, newPassword) {
    const input = parseInput(passwordResetSchema, { token, password: newPassword });
    const link = new URLSearchParams(input.token);
    const access_token = link.get("access_token");
    const refresh_token = link.get("refresh_token");
    if (!access_token || !refresh_token || link.get("type") !== "recovery") {
      throw new ServiceError("validation", undefined, { token: "resetLinkInvalid" });
    }
    const { error } = await supabase().auth.setSession({ access_token, refresh_token });
    if (error) throw new ServiceError("validation", undefined, { token: "resetLinkInvalid" });
    const updated = await supabase().auth.updateUser({ password: input.password });
    if (updated.error) throw new ServiceError("validation", undefined, { password: "passwordTooShort" });
    await supabase().auth.signOut({ scope: "local" });
    emitSession(null);
  },

  onAuthStateChange(listener) {
    listeners.add(listener);
    const { data } = supabase().auth.onAuthStateChange((event, authSession) => {
      // Tab refocus repeats SIGNED_IN and tokens refresh hourly; only a change of user matters.
      const userId = authSession?.user.id ?? null;
      if (event === "INITIAL_SESSION" || userId === lastUserId) return;
      // Supabase holds a lock during this callback, so database calls must wait until it ends.
      setTimeout(() => {
        loadSession().then(emitSession, () => emitSession(null));
      }, 0);
    });
    return () => {
      listeners.delete(listener);
      data.subscription.unsubscribe();
    };
  },
};
