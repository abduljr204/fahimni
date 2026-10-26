"use client";

import { MapPin, Video } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { BottomSheet } from "@/components/ui/overlays";
import { Chip } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { brand } from "@/config/app-config";
import { detectContactDetails } from "@/domain/contact-guard";
import { priceLesson } from "@/domain/pricing";
import type { DaySlots, LessonMode, TutorProfile } from "@/domain/types";
import { createProposalSchema, fieldErrors } from "@/domain/validation";
import { TimeStep } from "@/features/booking/booking-steps";
import { useSubjectMap } from "@/features/tutors/shared";
import { useAvailableSlots, useCreateProposal, usePlatformSettings } from "@/hooks/use-data";
import { useI18n } from "@/i18n/i18n-provider";
import { isServiceError } from "@/services";

const hasSlots = (d?: DaySlots) => Boolean(d?.slots.some((s) => s.available));

/** Tutor's form for offering a lesson from the conversation. The price follows the tutor's current rate. */
export function ProposalForm({
  open,
  onClose,
  conversationId,
  tutor,
  unlocked,
}: {
  open: boolean;
  onClose: () => void;
  conversationId: string;
  tutor: TutorProfile;
  unlocked: boolean;
}) {
  const { t, l, fmt, money } = useI18n();
  const toast = useToast();
  const subjects = useSubjectMap();
  const create = useCreateProposal();
  const { data: settings } = usePlatformSettings();

  const [subjectId, setSubjectId] = useState(tutor.subjectIds[0]);
  const [duration, setDuration] = useState<number>(60);
  const [mode, setMode] = useState<LessonMode>(tutor.modes[0]);
  const [date, setDate] = useState<string>();
  const [startsAt, setStartsAt] = useState<string>();
  const [objectives, setObjectives] = useState("");
  const [area, setArea] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState(0);

  const { data: days, isLoading } = useAvailableSlots(tutor.id, duration, 14);
  const resolvedDate = hasSlots(days?.find((d) => d.date === date)) ? date : days?.find(hasSlots)?.date;
  const resolvedStart = days?.find((d) => d.date === resolvedDate)?.slots.some((s) => s.startsAt === startsAt && s.available) ? startsAt : undefined;
  const noSlots = days !== undefined && !days.some(hasSlots);

  const total = useMemo(
    () => (settings ? priceLesson({ hourlyRate: tutor.hourlyRate, durationMinutes: duration, mode, commissionBps: settings.commissionBps }).total : undefined),
    [settings, tutor.hourlyRate, duration, mode],
  );

  const message = (key?: string) => (key ? ((t.validation as Record<string, string>)[key] ?? t.validation.required) : undefined);

  const submit = () => {
    setAttempt((n) => n + 1);
    const input = {
      conversationId,
      subjectId,
      objectives,
      startsAt: resolvedStart ?? "",
      durationMinutes: duration,
      mode,
      area: mode === "in_person" && area.trim() ? area : undefined,
    };
    const parsed = createProposalSchema.safeParse(input);
    const next = parsed.success ? {} : fieldErrors(parsed.error);
    // Before payment only a general area is allowed; the service checks this too.
    if (input.area && !unlocked && detectContactDetails(input.area).length) next.area = "exactPlace";
    setErrors(next);
    if (!parsed.success || next.area) return;

    create.mutate(parsed.data, {
      onSuccess: () => {
        toast.success(t.proposal.sent);
        setObjectives("");
        setArea("");
        setStartsAt(undefined);
        onClose();
      },
      onError: (error) => {
        if (isServiceError(error, "slot_unavailable")) toast.error(t.booking.slotTaken);
        else if (isServiceError(error, "contact_blocked")) setErrors({ area: "exactPlace" });
        else toast.error(t.common.somethingWrong);
      },
    });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t.proposal.formTitle}
      footer={
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-ink-500">{t.proposal.total}</p>
            <p className="text-lg font-extrabold">{total ? money(total) : "—"}</p>
            <p className="truncate text-[11px] text-ink-400">{fmt(t.proposal.priceFromRate, { rate: money(tutor.hourlyRate) })}</p>
          </div>
          <Button size="lg" className="ms-auto flex-1" loading={create.isPending} disabled={noSlots} onClick={submit}>
            {t.proposal.send}
          </Button>
        </div>
      }
    >
      <div className="space-y-6 pb-2">
        <fieldset>
          <legend className="mb-2.5 text-sm font-bold">{t.proposal.subject}</legend>
          <div className="flex flex-wrap gap-2">
            {tutor.subjectIds.map((id) => (
              <Chip key={id} selected={subjectId === id} onClick={() => setSubjectId(id)} className="h-9 shadow-none ring-1 ring-ink-200">
                {l(subjects.get(id)?.name)}
              </Chip>
            ))}
          </div>
        </fieldset>

        <Textarea
          label={t.proposal.objectives}
          placeholder={t.proposal.objectivesPlaceholder}
          value={objectives}
          maxLength={600}
          error={attempt ? message(errors.objectives) : undefined}
          onChange={(e) => setObjectives(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-4">
          <fieldset>
            <legend className="mb-2.5 text-sm font-bold">{t.proposal.duration}</legend>
            <div className="flex flex-wrap gap-2">
              {brand.lessonDurations.map((d) => (
                <Chip key={d} selected={duration === d} onClick={() => setDuration(d)} className="h-9 shadow-none ring-1 ring-ink-200">
                  {d}
                </Chip>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2.5 text-sm font-bold">{t.proposal.format}</legend>
            <div className="flex flex-wrap gap-2">
              {tutor.modes.map((m) => (
                <Chip
                  key={m}
                  selected={mode === m}
                  onClick={() => setMode(m)}
                  icon={m === "online" ? <Video className="size-3.5" /> : <MapPin className="size-3.5" />}
                  className="h-9 shadow-none ring-1 ring-ink-200"
                >
                  {m === "online" ? t.common.online : t.common.inPerson}
                </Chip>
              ))}
            </div>
          </fieldset>
        </div>

        {mode === "in_person" && (
          <Input
            label={t.proposal.area}
            placeholder={t.proposal.areaPlaceholder}
            hint={t.proposal.areaHint}
            value={area}
            maxLength={80}
            error={message(errors.area)}
            shakeKey={attempt}
            onChange={(e) => setArea(e.target.value)}
          />
        )}

        <section>
          {noSlots ? (
            <p className="rounded-2xl bg-ink-50 p-3 text-[13px] text-ink-600">{t.proposal.noSlots}</p>
          ) : (
            <TimeStep
              days={days}
              loading={isLoading}
              date={resolvedDate}
              startsAt={resolvedStart}
              onDate={(d) => {
                setDate(d);
                setStartsAt(undefined);
              }}
              onTime={setStartsAt}
            />
          )}
          {attempt > 0 && errors.startsAt && <p className="mt-2 text-[13px] font-medium text-coral-600">{t.validation.pickTime}</p>}
        </section>
      </div>
    </BottomSheet>
  );
}
