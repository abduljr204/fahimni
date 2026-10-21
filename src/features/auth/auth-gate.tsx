"use client";

import { motion } from "motion/react";
import { GraduationCap, LockKeyhole, Repeat } from "lucide-react";
import type { ReactNode } from "react";
import { AppLink } from "@/components/layout/app-link";
import { Button } from "@/components/ui/button";
import { Card, Skeleton } from "@/components/ui/primitives";
import { useRoleSwitch } from "@/features/demo/use-role-switch";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { useAppPath } from "@/components/layout/use-app-path";

export function SignInPrompt({ title, body }: { title?: string; body?: string }) {
  const { t } = useI18n();
  const { switchDemoRole } = useSession();
  const roles = useRoleSwitch();
  const path = useAppPath();
  const next = encodeURIComponent(path);

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="px-5 pt-6">
      <Card className="overflow-hidden p-6 text-center">
        <motion.div
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.1 }}
          className="mx-auto grid size-16 place-items-center rounded-3xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-float"
        >
          <LockKeyhole className="size-7" />
        </motion.div>
        <h2 className="mt-5 text-xl font-extrabold">{title ?? t.booking.signInTitle}</h2>
        <p className="mt-2 text-sm text-ink-500">{body ?? t.booking.signInBody}</p>
        <div className="mt-6 space-y-3">
          <AppLink href={`/auth/sign-up?next=${next}`} className="block">
            <Button block size="lg">
              {t.booking.createAccount}
            </Button>
          </AppLink>
          {switchDemoRole && (
            <Button
              variant="secondary"
              block
              loading={roles.pending === "student"}
              onClick={async () => {
                await switchDemoRole("student");
              }}
            >
              <GraduationCap className="size-4" /> {t.booking.useDemoStudent}
            </Button>
          )}
          <AppLink href={`/auth/sign-in?next=${next}`} className="block pt-1 text-sm font-semibold text-ink-500">
            {t.auth.haveAccount} <span className="text-brand-600">{t.auth.signIn}</span>
          </AppLink>
        </div>
      </Card>
    </motion.div>
  );
}

function TutorModeNotice() {
  const { t } = useI18n();
  const { switchDemoRole } = useSession();
  return (
    <div className="px-5 pt-6">
      <Card className="p-6 text-center">
        <Repeat className="mx-auto size-10 text-brand-500" />
        <p className="mt-4 text-[15px] text-ink-700">{t.booking.tutorCannotBook}</p>
        {switchDemoRole && (
          <Button className="mt-5" onClick={() => switchDemoRole("student")}>
            {t.booking.switchToStudent}
          </Button>
        )}
      </Card>
    </div>
  );
}

/**
 * Renders children only for a signed-in user (optionally of a given role).
 * In production this is a UX guard only; authorization is enforced on the server.
 */
export function AuthGate({ children, role, title, body }: { children: ReactNode; role?: "student" | "tutor"; title?: string; body?: string }) {
  const { status, role: current } = useSession();
  if (status === "loading") {
    return (
      <div className="space-y-3 px-5 pt-6">
        <Skeleton className="h-24 w-full rounded-3xl" />
        <Skeleton className="h-24 w-full rounded-3xl" />
      </div>
    );
  }
  if (status === "guest") return <SignInPrompt title={title} body={body} />;
  if (role === "student" && current !== "student") return <TutorModeNotice />;
  if (role === "tutor" && current !== "tutor") return <SignInPrompt title={title} body={body} />;
  return <>{children}</>;
}
