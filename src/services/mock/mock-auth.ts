import type { Session, UserAccount } from "@/domain/types";
import { signInSchema, signUpSchema } from "@/domain/validation";
import type { AuthService, DemoControls } from "../contracts";
import { parseInput, ServiceError } from "../errors";
import { clone, latency, mockDb, newId } from "./mock-db";
import { pushNotification } from "./mock-notifications";
import { DEMO_STUDENT_EMAIL, DEMO_TUTOR_EMAIL, type MockState, type MockUser } from "./seed";

/**
 * Prototype authentication: accounts live in the in-browser database and the
 * "session" is just the signed-in user id. Production uses Supabase Auth instead.
 */

const listeners = new Set<(session: Session | null) => void>();

function buildSession(state: MockState, userId: string | null): Session | null {
  if (!userId) return null;
  const user = state.users.find((u) => u.id === userId);
  if (!user) return null;
  return clone({
    user: toAccount(user),
    student: state.students.find((s) => s.userId === userId),
    tutorId: state.tutors.find((t) => t.userId === userId)?.id,
    isDemo: true,
  });
}

/** Strips the prototype-only password before a user record leaves the store. */
function toAccount({ password, ...account }: MockUser): UserAccount {
  void password;
  return account;
}

function setSession(userId: string | null): Session | null {
  const session = mockDb.mutate((s) => {
    s.sessionUserId = userId;
    return buildSession(s, userId);
  });
  listeners.forEach((l) => l(session));
  return session;
}

/** Remembers which student account to return to after visiting tutor mode. */
const LAST_STUDENT_KEY = "fahimni.prototype.lastStudent";

export const mockAuthService: AuthService = {
  async getSession() {
    return buildSession(mockDb.data, mockDb.data.sessionUserId);
  },

  async signUp(raw) {
    const input = parseInput(signUpSchema, raw);
    await latency(500, 900);
    if (mockDb.data.users.some((u) => u.email === input.email)) {
      throw new ServiceError("email_taken", undefined, { email: "emailTaken" });
    }
    const now = new Date().toISOString();
    const userId = newId("u");
    mockDb.mutate((s) => {
      s.users.push({
        id: userId,
        email: input.email,
        password: input.password,
        role: "student",
        displayName: { ar: input.fullName, en: input.fullName },
        avatarHue: Math.floor(Math.random() * 360),
        preferredLocale: "ar",
        createdAt: now,
        isDemo: true,
      });
      s.students.push({
        id: newId("sp"),
        userId,
        university: { ar: input.university, en: input.university },
        major: { ar: input.major, en: input.major },
        studyYear: input.studyYear,
        createdAt: now,
        isDemo: true,
      });
      pushNotification(s, { userId, type: "welcome", data: {} });
    });
    rememberStudent(userId);
    return setSession(userId)!;
  },

  async signIn(raw) {
    const input = parseInput(signInSchema, raw);
    await latency(400, 700);
    const user = mockDb.data.users.find((u) => u.email === input.email && u.password === input.password);
    if (!user) throw new ServiceError("invalid_credentials");
    if (user.role === "student") rememberStudent(user.id);
    return setSession(user.id)!;
  },

  async signOut() {
    await latency(150, 300);
    setSession(null);
  },

  onAuthStateChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

function rememberStudent(userId: string) {
  try {
    window.localStorage.setItem(LAST_STUDENT_KEY, userId);
  } catch {
    // Ignore storage errors; we fall back to the default demo student.
  }
}

export const mockDemoControls: DemoControls = {
  accounts: [
    { role: "student", email: DEMO_STUDENT_EMAIL },
    { role: "tutor", email: DEMO_TUTOR_EMAIL },
  ],

  async signInAs(role) {
    await latency(250, 450);
    let userId: string | undefined;
    if (role === "student") {
      try {
        userId = window.localStorage.getItem(LAST_STUDENT_KEY) ?? undefined;
      } catch {
        userId = undefined;
      }
      if (!mockDb.data.users.some((u) => u.id === userId && u.role === "student")) {
        userId = mockDb.data.users.find((u) => u.email === DEMO_STUDENT_EMAIL)?.id;
      }
    } else {
      userId = mockDb.data.users.find((u) => u.email === DEMO_TUTOR_EMAIL)?.id;
    }
    if (!userId) throw new ServiceError("not_found");
    return setSession(userId)!;
  },

  async reset() {
    await latency(300, 500);
    mockDb.reset();
    listeners.forEach((l) => l(buildSession(mockDb.data, mockDb.data.sessionUserId)));
  },
};
