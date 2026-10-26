"use client";

import { motion } from "motion/react";
import { CalendarDays, Clock, FileText, FlaskConical, MapPin, Target, Video, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { AppLink } from "@/components/layout/app-link";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { LessonProposal, ProposalStatus } from "@/domain/types";
import { useSubjectMap } from "@/features/tutors/shared";
import { useRespondToProposal } from "@/hooks/use-data";
import { useI18n } from "@/i18n/i18n-provider";

const tones: Record<ProposalStatus, "accent" | "mint" | "coral" | "ink"> = {
  pending: "accent",
  accepted: "mint",
  declined: "coral",
  withdrawn: "ink",
  expired: "ink",
};

function Detail({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-ink-700">
      <span className="text-ink-400">{icon}</span>
      {children}
    </span>
  );
}

/**
 * A tutor's lesson offer inside the chat. The learner's side reviews it on the checkout
 * screen before paying; the tutor can withdraw it while it is unanswered.
 */
export function ProposalCard({ proposal, viewerIsTutor, showSimulated }: { proposal: LessonProposal; viewerIsTutor: boolean; showSimulated: boolean }) {
  const { t, l, fmt, dayLabel, time, money, date } = useI18n();
  const toast = useToast();
  const subjects = useSubjectMap();
  const respond = useRespondToProposal();
  const pending = proposal.status === "pending";

  const act = (action: "decline" | "withdraw") =>
    respond.mutate(
      { proposalId: proposal.id, action },
      {
        onSuccess: () => toast.info(action === "decline" ? t.proposal.declined : t.proposal.withdrawn),
        onError: () => toast.error(t.common.somethingWrong),
      },
    );

  return (
    <motion.div initial={{ opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="flex justify-center">
      <Card className="w-full max-w-[92%] overflow-hidden border border-brand-100">
        <div className="flex items-center justify-between gap-2 bg-brand-50 px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-[13px] font-bold text-brand-700">
            <FileText className="size-4" /> {t.proposal.title}
          </span>
          <Badge tone={tones[proposal.status]}>{t.proposal.status[proposal.status]}</Badge>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-[15px] font-bold">{l(subjects.get(proposal.subjectId)?.name)}</p>
          <p className="flex gap-1.5 text-[13px] text-ink-600">
            <Target className="mt-0.5 size-3.5 shrink-0 text-brand-500" />
            {proposal.objectives}
          </p>
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-ink-50 p-3">
            <Detail icon={<CalendarDays className="size-3.5" />}>{dayLabel(proposal.startsAt)}</Detail>
            <Detail icon={<Clock className="size-3.5" />}>
              {time(proposal.startsAt)} · {proposal.durationMinutes} {t.common.minutes}
            </Detail>
            <Detail icon={proposal.mode === "online" ? <Video className="size-3.5" /> : <MapPin className="size-3.5" />}>
              {proposal.mode === "online" ? t.common.online : t.common.inPerson}
            </Detail>
            <Detail icon={<Wallet className="size-3.5" />}>
              <span className="font-bold">{money(proposal.pricing.total)}</span>
            </Detail>
            {proposal.area && (
              <span className="col-span-2">
                <Detail icon={<MapPin className="size-3.5" />}>{proposal.area}</Detail>
              </span>
            )}
          </div>
          {pending && <p className="text-[12px] text-ink-500">{fmt(t.proposal.expiresAt, { date: `${date(proposal.expiresAt)} ${time(proposal.expiresAt)}` })}</p>}
          {showSimulated && proposal.isSimulated && (
            <p className="flex items-center gap-1 text-[11px] font-medium text-accent-600">
              <FlaskConical className="size-3" /> {t.proposal.simulated}
            </p>
          )}

          {pending && !viewerIsTutor && (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <AppLink href={`/proposals/${proposal.id}`} className="block">
                <Button block size="sm">
                  {t.proposal.review}
                </Button>
              </AppLink>
              <Button size="sm" variant="outline" loading={respond.isPending} onClick={() => act("decline")}>
                {t.proposal.decline}
              </Button>
            </div>
          )}
          {pending && viewerIsTutor && (
            <Button size="sm" variant="outline" block loading={respond.isPending} onClick={() => act("withdraw")}>
              {t.proposal.withdraw}
            </Button>
          )}
          {proposal.status === "accepted" && (
            <AppLink href="/lessons" className="block">
              <Button size="sm" variant="secondary" block>
                {t.proposal.viewLesson}
              </Button>
            </AppLink>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
