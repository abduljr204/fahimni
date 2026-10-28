"use client";

import { motion } from "motion/react";
import { BadgeCheck, Bot, FileText, Flag, Inbox, ShieldX } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Textarea } from "@/components/ui/field";
import { BottomSheet } from "@/components/ui/overlays";
import { Badge, Card, Chip, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { toMajor, toMinor } from "@/domain/money";
import type { ApplicationDetails, Attachment, ModerationAction, ReportDetails } from "@/domain/types";
import { useSubjectMap } from "@/features/tutors/shared";
import { useApplications, useReportQueue, useResolveReport, useReviewApplication } from "@/hooks/use-data";
import { useI18n } from "@/i18n/i18n-provider";

async function openFile(file: Pick<Attachment, "url">) {
  const blob = await (await fetch(file.url)).blob();
  window.open(URL.createObjectURL(blob), "_blank", "noopener");
}

// ─── Verification ───────────────────────────────────────────────────────────

function ApplicationCard({ app, onReject }: { app: ApplicationDetails; onReject: (app: ApplicationDetails) => void }) {
  const { t, l, fmt, money, relative } = useI18n();
  const toast = useToast();
  const subjects = useSubjectMap();
  const review = useReviewApplication();
  const { tutor } = app;

  return (
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}>
      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <Avatar name={l(tutor.displayName)} hue={tutor.avatarHue} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{l(tutor.displayName)}</p>
            <p className="truncate text-[12px] text-ink-500" dir="ltr">
              {app.email}
            </p>
          </div>
          <span className="text-[12px] text-ink-400">{fmt(t.admin.appliedAt, { time: relative(app.createdAt) })}</span>
        </div>
        <p className="text-[14px] font-semibold">{l(tutor.headline)}</p>
        <p className="line-clamp-3 text-[13px] text-ink-600">{l(tutor.bio)}</p>
        <div className="flex flex-wrap gap-1.5">
          {tutor.subjectIds.map((id) => (
            <Badge key={id} tone="brand">
              {l(subjects.get(id)?.name)}
            </Badge>
          ))}
        </div>
        <ul className="list-inside list-disc text-[13px] text-ink-600">
          {tutor.qualifications.map((q, i) => (
            <li key={i}>{l(q)}</li>
          ))}
        </ul>
        <p className="text-[13px] text-ink-500">
          {l(tutor.city)} · {money(tutor.hourlyRate)} {t.common.perHour}
        </p>
        <div>
          <p className="mb-1.5 text-[12px] font-semibold text-ink-500">{t.admin.documents}</p>
          <div className="grid grid-cols-2 gap-2">
            {app.documents.map((d) => (
              <button key={d.file.id} type="button" onClick={() => void openFile(d.file)} className="overflow-hidden rounded-2xl bg-ink-50 text-start">
                {d.file.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local demo document
                  <img src={d.file.url} alt={d.file.name} className="h-24 w-full object-cover" />
                ) : (
                  <span className="grid h-24 place-items-center text-brand-600">
                    <FileText className="size-8" />
                  </span>
                )}
                <span className="block truncate px-2 py-1.5 text-[12px] font-semibold">{t.admin.documentKinds[d.kind]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => onReject(app)}>
            <ShieldX className="size-4" /> {t.admin.reject}
          </Button>
          <Button
            loading={review.isPending}
            onClick={() =>
              review.mutate(
                { applicationId: app.id, approve: true },
                { onSuccess: () => toast.success(t.admin.approved), onError: () => toast.error(t.common.somethingWrong) },
              )
            }
          >
            <BadgeCheck className="size-4" /> {t.admin.approve}
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}

export function VerificationPanel() {
  const { t } = useI18n();
  const toast = useToast();
  const { data, isLoading } = useApplications();
  const review = useReviewApplication();
  const [rejecting, setRejecting] = useState<ApplicationDetails | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();

  if (isLoading) return <Skeleton className="mx-5 h-72 rounded-3xl" />;
  return (
    <section className="space-y-3 px-5">
      {!data?.length ? (
        <Card>
          <EmptyState icon={<Inbox />} title={t.admin.verificationEmpty} className="py-8" />
        </Card>
      ) : (
        data.map((app) => <ApplicationCard key={app.id} app={app} onReject={setRejecting} />)
      )}
      <BottomSheet
        open={Boolean(rejecting)}
        onClose={() => setRejecting(null)}
        title={t.admin.reject}
        footer={
          <Button
            block
            size="lg"
            variant="danger"
            loading={review.isPending}
            onClick={() => {
              if (!rejecting) return;
              if (note.trim().length < 5) {
                setError(t.validation.reasonRequired);
                return;
              }
              review.mutate(
                { applicationId: rejecting.id, approve: false, note },
                {
                  onSuccess: () => {
                    toast.info(t.admin.rejected);
                    setRejecting(null);
                    setNote("");
                    setError(undefined);
                  },
                  onError: () => toast.error(t.common.somethingWrong),
                },
              );
            }}
          >
            {t.admin.reject}
          </Button>
        }
      >
        <Textarea label={t.admin.rejectReason} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} error={error} />
      </BottomSheet>
    </section>
  );
}

// ─── Reports & disputes ─────────────────────────────────────────────────────

function ResolveSheet({ report, onClose }: { report: ReportDetails | null; onClose: () => void }) {
  const { t, money, fmt } = useI18n();
  const toast = useToast();
  const resolve = useResolveReport();
  const [action, setAction] = useState<ModerationAction>("warning");
  const [note, setNote] = useState("");
  const [refund, setRefund] = useState("");
  const [error, setError] = useState<string>();
  if (!report) return null;

  const paid = report.booking?.pricing.dueInApp;
  const actions: ModerationAction[] = [
    "none",
    "warning",
    "suspend",
    ...(report.targetRole === "tutor" ? (["unpublish"] as const) : []),
    ...(report.kind === "dispute" && paid ? (["refund"] as const) : []),
  ];

  const submit = (dismiss: boolean) => {
    if (note.trim().length < 3) {
      setError(t.validation.reasonRequired);
      return;
    }
    const refundMinor = action === "refund" && paid ? toMinor(Number(refund || toMajor(paid.amountMinor, paid.currency)), paid.currency) : undefined;
    resolve.mutate(
      { reportId: report.id, action: dismiss ? "none" : action, dismiss, note, refundMinor },
      {
        onSuccess: () => {
          toast.success(t.admin.resolved);
          setNote("");
          setRefund("");
          setError(undefined);
          onClose();
        },
        onError: () => toast.error(t.common.somethingWrong),
      },
    );
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t.admin.resolve}
      footer={
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <Button variant="ghost" loading={resolve.isPending && resolve.variables?.dismiss} onClick={() => submit(true)}>
            {t.admin.dismiss}
          </Button>
          <Button variant={action === "suspend" ? "danger" : "primary"} loading={resolve.isPending && !resolve.variables?.dismiss} onClick={() => submit(false)}>
            {t.admin.moderationActions[action]}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {actions.map((a) => (
            <Chip key={a} selected={action === a} onClick={() => setAction(a)} className="h-9 shadow-none ring-1 ring-ink-200">
              {t.admin.moderationActions[a]}
            </Chip>
          ))}
        </div>
        {action === "refund" && paid && (
          <Input
            label={`${t.admin.refundAmount} (${paid.currency})`}
            type="number"
            inputMode="decimal"
            dir="ltr"
            placeholder={String(toMajor(paid.amountMinor, paid.currency))}
            value={refund}
            onChange={(e) => setRefund(e.target.value)}
            hint={fmt(t.admin.paidInAppLabel, { amount: money(paid) })}
          />
        )}
        <Textarea label={t.admin.actionNote} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} error={error} />
      </div>
    </BottomSheet>
  );
}

function ReportCard({ report, onResolve }: { report: ReportDetails; onResolve: () => void }) {
  const { t, l, fmt, relative, dayLabel, money } = useI18n();
  const reason = report.kind === "dispute" ? t.report.disputeReasons[report.reason as keyof typeof t.report.disputeReasons] : t.report.reasons[report.reason as keyof typeof t.report.reasons];
  return (
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="space-y-2.5 p-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={report.kind === "dispute" ? "accent" : "coral"}>
            <Flag className="size-3" /> {t.admin.reportKinds[report.kind]}
          </Badge>
          {report.auto && (
            <Badge tone="ink">
              <Bot className="size-3" /> {t.admin.autoFlag}
            </Badge>
          )}
          <span className="ms-auto text-[12px] text-ink-400">{relative(report.createdAt)}</span>
        </div>
        <p className="font-bold">{reason}</p>
        <p className="text-[13px] text-ink-600">
          {fmt(t.admin.about, { name: l(report.targetName) })} · {t.profile[report.targetRole === "tutor" ? "tutor" : report.targetRole === "parent" ? "parent" : "student"]}
          {report.targetSuspended && (
            <Badge tone="coral" className="ms-1.5">
              {t.admin.suspendedBadge}
            </Badge>
          )}
          {report.reporterName && <span className="block text-ink-500">{fmt(t.admin.reportedBy, { name: l(report.reporterName) })}</span>}
        </p>
        {/* User-written text keeps its own direction (an English note in the Arabic UI, and vice versa). */}
        {report.auto ? (
          <p className="text-[13px] text-ink-700">{t.admin.autoFlagBody}</p>
        ) : (
          report.details && (
            <p dir="auto" className="text-start text-[13px] text-ink-700">
              {report.details}
            </p>
          )
        )}
        {report.evidence && (
          <div className="rounded-2xl bg-coral-100/60 p-3 text-[13px]">
            <p className="text-[11px] font-semibold text-coral-600">{t.admin.evidence}</p>
            <p dir="auto" className="mt-0.5 text-start text-ink-800 italic">
              {report.evidence}
            </p>
          </div>
        )}
        {report.booking && (
          <p className="rounded-2xl bg-ink-50 p-3 text-[13px] text-ink-700">
            {l(report.booking.subject)} · {dayLabel(report.booking.startsAt)} · {fmt(t.admin.paidInAppLabel, { amount: money(report.booking.pricing.dueInApp) })}
          </p>
        )}
        <Button block variant="secondary" onClick={onResolve}>
          {t.admin.resolve}
        </Button>
      </Card>
    </motion.div>
  );
}

export function ReportsPanel() {
  const { t } = useI18n();
  const { data, isLoading } = useReportQueue();
  const [resolving, setResolving] = useState<ReportDetails | null>(null);
  if (isLoading) return <Skeleton className="mx-5 h-72 rounded-3xl" />;
  return (
    <section className="space-y-3 px-5">
      {!data?.length ? (
        <Card>
          <EmptyState icon={<Inbox />} title={t.admin.reportsEmpty} className="py-8" />
        </Card>
      ) : (
        data.map((r) => <ReportCard key={r.id} report={r} onResolve={() => setResolving(r)} />)
      )}
      <ResolveSheet key={resolving?.id} report={resolving} onClose={() => setResolving(null)} />
    </section>
  );
}
