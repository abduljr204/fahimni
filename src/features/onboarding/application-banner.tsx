"use client";

import { motion } from "motion/react";
import { Hourglass, ShieldX } from "lucide-react";
import { AppLink } from "@/components/layout/app-link";
import { ForwardChevron } from "@/components/ui/primitives";
import { useMyApplication, useTutor } from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";

/** Tells a new tutor where their verification stands; hidden once the profile is live. */
export function ApplicationBanner() {
  const { t, fmt } = useI18n();
  const { session } = useSession();
  const { data: application } = useMyApplication();
  const { data: tutor } = useTutor(session?.tutorId);
  if (!application || !tutor || tutor.published) return null;
  const rejected = application.status === "rejected";

  return (
    <motion.section initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="px-5 pt-4">
      <div className={`flex gap-3 rounded-3xl p-4 ${rejected ? "bg-coral-100 text-coral-600" : "bg-accent-100 text-accent-600"}`}>
        {rejected ? <ShieldX className="mt-0.5 size-5 shrink-0" /> : <Hourglass className="mt-0.5 size-5 shrink-0" />}
        <div className="min-w-0 text-[13px]">
          <p className="text-[15px] font-bold">{rejected ? t.onboarding.rejectedTitle : t.onboarding.pendingTitle}</p>
          <p className="mt-1">{rejected ? fmt(t.onboarding.rejectedBody, { note: application.note ?? "—" }) : t.onboarding.pendingBody}</p>
          {!rejected && (
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-semibold">
              <AppLink href="/tutor/schedule" className="inline-flex items-center gap-0.5">
                {t.dashboard.manageSchedule} <ForwardChevron className="size-3.5" />
              </AppLink>
              <AppLink href="/tutor/pricing" className="inline-flex items-center gap-0.5">
                {t.dashboard.editPrice} <ForwardChevron className="size-3.5" />
              </AppLink>
            </div>
          )}
        </div>
      </div>
    </motion.section>
  );
}
