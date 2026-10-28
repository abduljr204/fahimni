import type { Session, UserAccount } from "@/domain/types";
import { parentSignUpSchema, passwordResetRequestSchema, passwordResetSchema, signInSchema, signUpSchema } from "@/domain/validation";
import type { AuthService, DemoControls } from "../contracts";
import { parseInput, ServiceError } from "../errors";
import { clone, latency, mockDb, newId } from "./mock-db";
import { deliverOutside, pushNotification } from "./mock-notifications";
import { rateLimit } from "./rate-limit";
import { DEMO_ADMIN_EMAIL, DEMO_PARENT_EMAIL, DEMO_STUDENT_EMAIL, DEMO_TUTOR_EMAIL, type MockState, type MockUser } from "./seed";

/**
 * Prototype authentication: accounts live in the in-browser database and the
 * "session" is just the signed-in user id. Production uses Supabase Auth instead.
 */

const listeners = new Set<(session: Session | null) => void>();

export function buildSession(state: MockState, userId: string | null): Session | null {
  if (!userId) return null;
  const user = state.users.find((u) => u.id === userId);
  if (!user) return null;
  return clone({
    user: toAccount(user),
    student: state.students.find((s) => s.userId === userId),
    tutorId: state.tutors.find((t) => t.userId === userId)?.id,
    managedStudents:
      user.role === "parent"
        ? state.students
            .filter((s) => s.guardianUserId === userId)
            .map((s) => {
              const child = state.users.find((u) => u.id === s.userId)!;
              return { userId: child.id, displayName: child.displayName, avatarHue: child.avatarHue, level: s.level };
            })
        : undefined,
    isDemo: true,
  });
}

/** Strips the prototype-only password before a user record leaves the store. */
function toAccount({ password, ...account }: MockUser): UserAccount {
  void password;
  return account;
}

export function setSession(userId: string | null): Session | null {
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
    rateLimit("signUp", "browser");
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
        birthYear: input.birthYear,
        createdAt: now,
        isDemo: true,
      });
      pushNotification(s, { userId, type: "welcome", data: {} });
    });
    rememberStudent(userId);
    return setSession(userId)!;
  },

  async signUpParent(raw) {
    const input = parseInput(parentSignUpSchema, raw);
    await latency(500, 900);
    rateLimit("signUp", "browser");
    if (mockDb.data.users.some((u) => u.email === input.email)) {
      throw new ServiceError("email_taken", undefined, { email: "emailTaken" });
    }
    const now = new Date().toISOString();
    const parentId = newId("u");
    mockDb.mutate((s) => {
      s.users.push({
        id: parentId,
        email: input.email,
        password: input.password,
        role: "parent",
        displayName: { ar: input.fullName, en: input.fullName },
        avatarHue: Math.floor(Math.random() * 360),
        preferredLocale: "ar",
        phone: input.phone,
        createdAt: now,
        isDemo: true,
      });
      addManagedChild(s, parentId, input.child, now);
      pushNotification(s, { userId: parentId, type: "welcome", data: {} });
    });
    return setSession(parentId)!;
  },

  async signIn(raw) {
    const input = parseInput(signInSchema, raw);
    await latency(400, 700);
    // Managed children have no password and can never sign in.
    const user = mockDb.data.users.find((u) => u.email === input.email && u.password && u.password === input.password);
    if (!user) throw new ServiceError("invalid_credentials");
    if (user.suspendedAt) throw new ServiceError("account_suspended");
    if (user.role === "student") rememberStudent(user.id);
    return setSession(user.id)!;
  },

  async signOut() {
    await latency(150, 300);
    setSession(null);
  },

  async requestPasswordReset(rawEmail) {
    const { email } = parseInput(passwordResetRequestSchema, { email: rawEmail });
    await latency(400, 700);
    rateLimit("passwordReset", email);
    const user = mockDb.data.users.find((u) => u.email === email && u.password);
    // Same answer whether or not the account exists.
    if (!user) return {};
    const token = `${newId("reset")}${Math.random().toString(36).slice(2, 10)}`;
    const path = `/auth/reset-password?token=${encodeURIComponent(token)}`;
    mockDb.mutate((s) => {
      s.passwordResets.push({ token, userId: user.id, expiresAt: new Date(Date.now() + 60 * 60_000).toISOString() });
      deliverOutside(s, user.id, "password_reset", { link: path });
    });
    return { demoResetPath: path };
  },

  async resetPassword(token, newPassword) {
    const input = parseInput(passwordResetSchema, { token, password: newPassword });
    await latency(400, 700);
    mockDb.mutate((s) => {
      const reset = s.passwordResets.find((r) => r.token === input.token);
      if (!reset || reset.usedAt || new Date(reset.expiresAt).getTime() < Date.now()) {
        throw new ServiceError("validation", undefined, { token: "resetLinkInvalid" });
      }
      const user = s.users.find((u) => u.id === reset.userId);
      if (!user) throw new ServiceError("validation", undefined, { token: "resetLinkInvalid" });
      user.password = input.password;
      reset.usedAt = new Date().toISOString();
    });
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
    { role: "admin", email: DEMO_ADMIN_EMAIL },
    { role: "parent", email: DEMO_PARENT_EMAIL },
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
      const email = { tutor: DEMO_TUTOR_EMAIL, admin: DEMO_ADMIN_EMAIL, parent: DEMO_PARENT_EMAIL }[role];
      userId = mockDb.data.users.find((u) => u.email === email)?.id;
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

/** Creates a younger student's account (no login) managed by `parentId`. Runs inside a mutation. */
export function addManagedChild(
  state: MockState,
  parentId: string,
  child: { fullName: string; level: "secondary" | "university_early" | "university_advanced" | "postgraduate"; school: string; studyYear: number; birthYear: number },
  now = new Date().toISOString(),
) {
  const childId = newId("u");
  const avatarHue = Math.floor(Math.random() * 360);
  state.users.push({
    id: childId,
    // Internal placeholder: managed children have no email or password and can't sign in.
    email: `${childId}@managed.fahimni`,
    password: "",
    role: "student",
    displayName: { ar: child.fullName, en: child.fullName },
    avatarHue,
    preferredLocale: "ar",
    createdAt: now,
    isDemo: true,
  });
  state.students.push({
    id: newId("sp"),
    userId: childId,
    university: { ar: child.school, en: child.school },
    major: { ar: child.school, en: child.school },
    studyYear: child.studyYear,
    level: child.level,
    birthYear: child.birthYear,
    guardianUserId: parentId,
    createdAt: now,
    isDemo: true,
  });
  return { userId: childId, displayName: { ar: child.fullName, en: child.fullName }, avatarHue, level: child.level };
}
