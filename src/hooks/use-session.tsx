"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@/domain/types";
import type { SignInInput, SignUpInput } from "@/domain/validation";
import { getServices } from "@/services";

type SessionStatus = "loading" | "authenticated" | "guest";

interface SessionContextValue {
  status: SessionStatus;
  session: Session | null;
  /** The experience currently shown. Tutors see the dashboard navigation. */
  role: "student" | "tutor" | null;
  signIn(input: SignInInput): Promise<Session>;
  signUp(input: SignUpInput): Promise<Session>;
  signOut(): Promise<void>;
  /** Prototype only: jump between the demo student and demo tutor. */
  switchDemoRole?(role: "student" | "tutor"): Promise<Session>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const services = getServices();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");

  useEffect(() => {
    let active = true;
    services.auth
      .getSession()
      .then((s) => {
        if (!active) return;
        setSession(s);
        setStatus(s ? "authenticated" : "guest");
      })
      .catch(() => active && setStatus("guest"));

    const unsubscribe = services.auth.onAuthStateChange((s) => {
      setSession(s);
      setStatus(s ? "authenticated" : "guest");
      // User-scoped caches belong to the previous user.
      queryClient.invalidateQueries();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [services, queryClient]);

  const signIn = useCallback((input: SignInInput) => services.auth.signIn(input), [services]);
  const signUp = useCallback((input: SignUpInput) => services.auth.signUp(input), [services]);
  const signOut = useCallback(() => services.auth.signOut(), [services]);
  const demo = services.demo;
  const switchDemoRole = useMemo(() => (demo ? (role: "student" | "tutor") => demo.signInAs(role) : undefined), [demo]);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      session,
      role: session ? (session.user.role === "tutor" ? "tutor" : "student") : null,
      signIn,
      signUp,
      signOut,
      switchDemoRole,
    }),
    [status, session, signIn, signUp, signOut, switchDemoRole],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
