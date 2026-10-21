"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { useToast } from "@/components/ui/toast";

/** Prototype helper: jumps between the demo student and demo tutor experiences. */
export function useRoleSwitch() {
  const { switchDemoRole } = useSession();
  const { t, href } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [pending, setPending] = useState<"student" | "tutor" | null>(null);

  const switchTo = async (role: "student" | "tutor") => {
    if (!switchDemoRole) return;
    setPending(role);
    try {
      await switchDemoRole(role);
      toast.demo(role === "tutor" ? t.profile.switchedToTutor : t.profile.switchedToStudent, t.demo.demoAccount);
      router.push(href(role === "tutor" ? "/tutor" : "/"));
    } catch {
      toast.error(t.common.somethingWrong);
    } finally {
      setPending(null);
    }
  };

  return { available: Boolean(switchDemoRole), switchTo, pending };
}
