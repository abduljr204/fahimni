"use client";

import { Flag } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { BottomSheet } from "@/components/ui/overlays";
import { Chip } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { DisputeReason, ReportReason } from "@/domain/types";
import { fieldErrors, reportSchema } from "@/domain/validation";
import { useReport } from "@/hooks/use-data";
import { useI18n } from "@/i18n/i18n-provider";
import { isServiceError } from "@/services";

export interface ReportTarget {
  kind: "report" | "dispute";
  targetUserId: string;
  messageId?: string;
  conversationId?: string;
  bookingId?: string;
  /** Shown under the title, e.g. the reported message. */
  context?: string;
}

const REPORT_REASONS: ReportReason[] = ["harassment", "off_platform", "inappropriate", "spam", "fake_profile", "safety", "other"];
const DISPUTE_REASONS: DisputeReason[] = ["no_show", "quality", "billing", "other"];

/** One sheet for every report: a message, a person, a tutor profile or a lesson dispute. */
export function ReportSheet({ target, onClose }: { target: ReportTarget | null; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const report = useReport();
  const [reason, setReason] = useState<ReportReason | DisputeReason>();
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string>();

  const dispute = target?.kind === "dispute";
  const reasons = dispute ? DISPUTE_REASONS : REPORT_REASONS;
  const label = (r: ReportReason | DisputeReason) =>
    dispute ? t.report.disputeReasons[r as DisputeReason] : t.report.reasons[r as ReportReason];
  const messages: Record<string, string> = t.validation;

  const close = () => {
    setReason(undefined);
    setDetails("");
    setError(undefined);
    onClose();
  };

  const submit = () => {
    if (!target) return;
    const input = { ...target, reason: reason ?? "", details };
    const parsed = reportSchema.safeParse(input);
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      setError(messages[errs.details ?? errs.reason ?? "required"] ?? t.validation.required);
      return;
    }
    report.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(t.report.sent);
        close();
      },
      onError: (e) => {
        const key = isServiceError(e) ? Object.values(e.fields ?? {})[0] : undefined;
        if (key && messages[key]) setError(messages[key]);
        else if (isServiceError(e, "rate_limited")) toast.error(t.errors.rateLimited);
        else toast.error(t.common.somethingWrong);
      },
    });
  };

  return (
    <BottomSheet
      open={Boolean(target)}
      onClose={close}
      title={dispute ? t.report.disputeTitle : t.report.title}
      footer={
        <Button block size="lg" variant="danger" loading={report.isPending} onClick={submit}>
          <Flag className="size-4" /> {t.report.submit}
        </Button>
      }
    >
      <div className="space-y-4">
        {target?.context && <p className="rounded-2xl bg-ink-50 p-3 text-[13px] text-ink-600 italic">“{target.context}”</p>}
        <fieldset>
          <legend className="mb-2.5 text-sm font-bold">{t.report.reasonLabel}</legend>
          <div className="flex flex-wrap gap-2">
            {reasons.map((r) => (
              <Chip
                key={r}
                selected={reason === r}
                onClick={() => {
                  setReason(r);
                  setError(undefined);
                }}
                className="h-9 shadow-none ring-1 ring-ink-200"
              >
                {label(r)}
              </Chip>
            ))}
          </div>
        </fieldset>
        <Textarea
          label={t.report.details}
          placeholder={t.report.detailsPlaceholder}
          value={details}
          maxLength={1000}
          onChange={(e) => setDetails(e.target.value)}
          error={error}
        />
      </div>
    </BottomSheet>
  );
}
