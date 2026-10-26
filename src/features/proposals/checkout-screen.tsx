"use client";

import { motion } from "motion/react";
import { BookOpen, CalendarDays, CircleCheck, Clock, FileX2, Lock, MapPin, Target, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useState, type ReactNode } from "react";
import { AppLink } from "@/components/layout/app-link";
import { Screen, TopBar } from "@/components/layout/screen";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { allowedSettlements, defaultSettlement, withSettlement } from "@/domain/pricing";
import type { ProposalDetails, Settlement } from "@/domain/types";
import { AuthGate } from "@/features/auth/auth-gate";
import { CancellationTerms } from "@/features/pricing/cancellation-terms";
import { PaymentOptionPicker } from "@/features/pricing/payment-options";
import { PaymentSplit, PriceBreakdown } from "@/features/pricing/price-breakdown";
import { useAcceptProposal, usePlatformSettings, useProposal } from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";
import { getServices, isServiceError } from "@/services";

function Row({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</span>
      <span className="flex-1 text-sm text-ink-500">{label}</span>
      <span className="text-end text-sm font-bold">{value}</span>
    </div>
  );
}

function Paid({ proposal }: { proposal: ProposalDetails }) {
  const { t, l, fmt } = useI18n();
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="px-5 pt-10 text-center">
      <motion.span
        initial={{ scale: 0, rotate: -30 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 14 }}
        className="mx-auto grid size-20 place-items-center rounded-full bg-mint-500 text-white shadow-lg"
      >
        <CircleCheck className="size-10" />
      </motion.span>
      <h1 className="mt-6 text-2xl font-extrabold">{t.checkout.paid}</h1>
      <p className="mx-auto mt-2 max-w-xs text-[15px] text-ink-600">{fmt(t.checkout.paidBody, { name: l(proposal.tutor.displayName) })}</p>
      <div className="mt-7 space-y-3">
        <AppLink href={`/messages/${proposal.conversationId}`} className="block">
          <Button block size="lg">
            {t.checkout.backToChat}
          </Button>
        </AppLink>
        <AppLink href="/lessons" className="block">
          <Button block variant="outline">
            {t.booking.viewLessons}
          </Button>
        </AppLink>
      </div>
    </motion.div>
  );
}

function Checkout({ proposalId }: { proposalId: string }) {
  const { t, l, fmt, money, dayLabel, time } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const { session } = useSession();
  const { data: proposal, isLoading, error, refetch } = useProposal(proposalId);
  const { data: settings } = usePlatformSettings();
  const accept = useAcceptProposal();
  const [choice, setChoice] = useState<Settlement>();
  const [agreed, setAgreed] = useState(false);
  const [done, setDone] = useState(false);

  if (isLoading || (!settings && !error)) {
    return (
      <div className="space-y-4 px-5 pt-4">
        <Skeleton className="h-24 rounded-3xl" />
        <Skeleton className="h-56 rounded-3xl" />
      </div>
    );
  }
  if (error || !proposal || !settings) return <EmptyState icon={<FileX2 />} title={t.checkout.unavailable} body={t.checkout.unavailableBody} />;
  if (done) return <Paid proposal={proposal} />;

  const isLearnerSide = proposal.studentId === session?.user.id || session?.managedStudents?.some((s) => s.userId === proposal.studentId);
  const options = allowedSettlements(proposal.mode, settings);
  const settlement = choice && options.includes(choice) ? choice : defaultSettlement(proposal.mode, settings);
  const pricingFor = (s: Settlement) => withSettlement(proposal.pricing, proposal.durationMinutes, proposal.mode, s);
  const pricing = pricingFor(settlement);
  const pending = proposal.status === "pending";
  const child = session?.managedStudents?.find((s) => s.userId === proposal.studentId);

  const confirm = () =>
    accept.mutate(
      {
        proposalId: proposal.id,
        settlement,
        expectedTotalMinor: pricing.total.amountMinor,
        expectedDueInAppMinor: pricing.dueInApp.amountMinor,
      },
      {
        onSuccess: () => setDone(true),
        onError: (e) => {
          if (isServiceError(e, "price_changed")) toast.error(t.booking.priceChanged);
          else if (isServiceError(e, "slot_unavailable")) toast.error(t.booking.slotTaken);
          else if (isServiceError(e, "proposal_unavailable")) toast.error(t.checkout.unavailable);
          else toast.error(t.common.somethingWrong);
          void refetch();
        },
      },
    );

  return (
    <>
      <div className="space-y-4 px-5 pb-40">
        <Card className="flex items-center gap-3 p-4">
          <Avatar name={l(proposal.tutor.displayName)} hue={proposal.tutor.avatarHue} size="md" />
          <div className="min-w-0">
            <p className="truncate font-bold">{fmt(t.booking.lessonWith, { name: l(proposal.tutor.displayName) })}</p>
            <p className="truncate text-[13px] text-ink-500">
              {child ? fmt(t.checkout.forStudent, { name: l(child.displayName) }) : l(proposal.tutor.headline)}
            </p>
          </div>
        </Card>

        {!pending && (
          <Card className="p-4 text-center text-sm font-semibold text-ink-600">
            {t.proposal.status[proposal.status]} · {t.checkout.unavailableBody}
          </Card>
        )}

        <Card className="p-4">
          <h2 className="mb-1 text-lg font-bold">{t.booking.summary}</h2>
          <div className="divide-y divide-ink-100">
            <Row icon={<BookOpen className="size-4" />} label={t.booking.subject} value={l(proposal.subject.name)} />
            <Row icon={<CalendarDays className="size-4" />} label={t.booking.date} value={dayLabel(proposal.startsAt)} />
            <Row icon={<Clock className="size-4" />} label={t.booking.time} value={`${time(proposal.startsAt)} · ${proposal.durationMinutes} ${t.common.minutes}`} />
            <Row
              icon={proposal.mode === "online" ? <Video className="size-4" /> : <MapPin className="size-4" />}
              label={t.booking.mode}
              value={proposal.mode === "online" ? t.common.online : t.common.inPerson}
            />
            {proposal.mode === "in_person" && (
              <>
                {proposal.area && <Row icon={<MapPin className="size-4" />} label={t.checkout.area} value={proposal.area} />}
                <Row icon={<Lock className="size-4" />} label={t.checkout.meetingPlace} value={<span className="font-medium text-ink-500">{t.checkout.meetingAfterPayment}</span>} />
              </>
            )}
          </div>
          <div className="mt-2 rounded-2xl bg-ink-50 p-3">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-500">
              <Target className="size-3.5" /> {t.checkout.objectives}
            </p>
            <p className="mt-1 text-[14px] text-ink-800">{proposal.objectives}</p>
          </div>
        </Card>

        {options.length > 1 && (
          <Card className="p-4">
            <h2 className="mb-3 text-lg font-bold">{t.checkout.paymentOption}</h2>
            <PaymentOptionPicker options={options} value={settlement} onChange={setChoice} pricingFor={pricingFor} />
          </Card>
        )}

        <Card className="p-4">
          <h2 className="mb-1 text-lg font-bold">{t.booking.priceBreakdown}</h2>
          <PriceBreakdown pricing={pricing} durationMinutes={proposal.durationMinutes} />
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-lg font-bold">{t.booking.howYouPay}</h2>
          <PaymentSplit pricing={pricing} simulated={getServices().payments.kind === "simulated"} />
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 text-lg font-bold">{t.checkout.terms}</h2>
          <CancellationTerms pricing={pricing} startsAt={proposal.startsAt} />
          {isLearnerSide && pending && (
            <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-2xl bg-ink-50 p-3 text-[14px] font-medium">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="size-5 accent-brand-600" />
              {t.checkout.agree}
            </label>
          )}
        </Card>

        {!isLearnerSide && <p className="text-center text-[13px] text-ink-500">{t.checkout.notYours}</p>}
      </div>

      {isLearnerSide && pending && (
        <motion.div
          initial={{ y: 100 }}
          animate={{ y: 0 }}
          className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[var(--app-max-width)] px-3 pb-3"
        >
          <div className="rounded-[26px] border border-white/60 bg-white/92 p-3 shadow-nav backdrop-blur-xl">
            <Button size="lg" block className={cn("h-12")} disabled={!agreed} loading={accept.isPending} onClick={confirm}>
              {fmt(t.checkout.pay, { amount: money(pricing.dueInApp) })}
            </Button>
            <button type="button" onClick={() => router.back()} className="mt-2 w-full text-center text-[13px] font-semibold text-ink-500">
              {t.common.back}
            </button>
          </div>
        </motion.div>
      )}
    </>
  );
}

export function CheckoutScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  return (
    <Screen variant="push" withNav={false}>
      <TopBar title={t.checkout.title} backHref="/messages" />
      <AuthGate>
        <Checkout key={id} proposalId={id} />
      </AuthGate>
    </Screen>
  );
}
