"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { UserRole } from "@/domain/types";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { useToast } from "@/components/ui/toast";

const HOME: Record<UserRole, string> = { student: "/", tutor: "/tutor", admin: "/admin" };

/** Prototype helper: jumps between the demo student, tutor and admin experiences. */
export function useRoleSwitch() {
  const { switchDemoRole } = useSession();
  const { t, href } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, setPending] = useState<UserRole | null>(null);

  const switchTo = async (role: UserRole) => {
    if (!switchDemoRole) return;
    setPending(role);
    try {
      await switchDemoRole(role);
      const switched = { student: t.profile.switchedToStudent, tutor: t.profile.switchedToTutor, admin: t.profile.switchedToAdmin };
      toast.demo(switched[role], t.demo.demoAccount);
      router.push(href(HOME[role]));
    } catch {
      toast.error(t.common.somethingWrong);
    } finally {
      setPending(null);
    }
  };

  return { available: Boolean(switchDemoRole), switchTo, pending };
}
