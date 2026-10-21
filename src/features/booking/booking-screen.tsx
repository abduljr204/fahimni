"use client";

import { AnimatePresence, motion } from "motion/react";
import { BookOpen, CalendarDays, Clock, FlaskConical, MapPin, ShieldCheck, Video } from "lucide-react";
import { use, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Screen, TopBar } from "@/components/layout/screen";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ui/data-viz";
import { Textarea } from "@/components/ui/field";
import { BackChevron, Card, ForwardChevron, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { brand } from "@/config/app-config";
import { localDateKey, priceForDuration } from "@/domain/booking-rules";
import type { Booking, DaySlots, LessonMode } from "@/domain/types";
import { createBookingSchema } from "@/domain/validation";
import { AuthGate } from "@/features/auth/auth-gate";
import { useSubjectMap } from "@/features/tutors/shared";
import { useAvailableSlots, useCreateBooking, useTutor } from "@/hooks/use-data";
import { useI18n } from "@/i18n/i18n-provider";
import { isServiceError } from "@/services";
import { BookingSuccess } from "./booking-success";
import { StepProgress, SubjectStep, TimeStep } from "./booking-steps";

interface Draft {
  subjectId?: string;
  duration: number;
  mode: LessonMode;
  date?: string;
  startsAt?: string;
  note: string;
}

function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</span>
      <span className="flex-1 text-sm text-ink-500">{label}</span>
      <span className="text-sm font-bold">{value}</span>
    </div>
  );
}

function BookingFlow({ tutorId, initialSubject, initialStart }: { tutorId: string; initialSubject?: string; initialStart?: string }) {
  const { t, l, dayLabel, time, money, fmt, dir } = useI18n();
  const toast = useToast();
  const { data: tutor, isLoading } = useTutor(tutorId);
  const subjectMap = useSubjectMap();
  const create = useCreateBooking();

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [result, setResult] = useState<Booking | null>(null);
  const [draft, setDraft] = useState<Draft>(() => ({
    subjectId: initialSubject,
    duration: 60,
    mode: "online",
    startsAt: initialStart,
    date: initialStart ? localDateKey(new Date(initialStart)) : undefined,
    note: "",
  }));

  const { data: days, isLoading: slotsLoading } = useAvailableSlots(tutorId, draft.duration, brand.bookingWindowDays);

  // Defaults that depend on loaded data (tutor, slots) are derived, not copied into state.
  const resolved = useMemo(() => {
    const hasSlots = (d?: DaySlots) => Boolean(d?.slots.some((x) => x.available));
    const subjectId =
      draft.subjectId && tutor?.subjectIds.includes(draft.subjectId)
        ? draft.subjectId
        : tutor?.subjectIds.length === 1
          ? tutor.subjectIds[0]
          : undefined;
    const mode = tutor && !tutor.modes.includes(draft.mode) ? tutor.modes[0] : draft.mode;
    const date = hasSlots(days?.find((x) => x.date === draft.date)) ? draft.date : (days?.find(hasSlots)?.date ?? draft.date);
    const day = days?.find((x) => x.date === date);
    const startsAt = days && !day?.slots.some((x) => x.startsAt === draft.startsAt && x.available) ? undefined : draft.startsAt;
    return { ...draft, subjectId, mode, date, startsAt };
  }, [draft, tutor, days]);

  // Activity keeps this screen alive after navigating away; start fresh next time once booked.
  const done = useRef(false);
  useLayoutEffect(() => {
    return () => {
      if (done.current) {
        done.current = false;
        setResult(null);
        setStep(0);
        setDraft((d) => ({ ...d, startsAt: undefined, note: "" }));
      }
    };
  }, []);

  const subjects = useMemo(() => (tutor?.subjectIds ?? []).map((id) => subjectMap.get(id)).filter((s) => s !== undefined), [tutor, subjectMap]);
  const subject = resolved.subjectId ? subjectMap.get(resolved.subjectId) : undefined;
  const price = tutor ? priceForDuration(tutor.hourlyRate, resolved.duration) : undefined;

  const canContinue = step === 0 ? Boolean(resolved.subjectId) : step === 1 ? Boolean(resolved.startsAt) : true;

  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const confirm = () => {
    if (!tutor) return;
    const input = {
      tutorId: tutor.id,
      subjectId: resolved.subjectId ?? "",
      startsAt: resolved.startsAt ?? "",
      durationMinutes: resolved.duration,
      mode: resolved.mode,
      note: resolved.note || undefined,
    };
    const parsed = createBookingSchema.safeParse(input);
    if (!parsed.success) {
      toast.error(t.validation.pickTime);
      return;
    }
    create.mutate(parsed.data, {
      onSuccess: (booking) => {
        done.current = true;
        setResult(booking);
      },
      onError: (error) => {
        if (isServiceError(error, "slot_unavailable")) {
          toast.error(t.booking.slotTaken);
          setDraft((d) => ({ ...d, startsAt: undefined }));
          go(1);
        } else toast.error(t.common.somethingWrong);
      },
    });
  };

  if (isLoading || !tutor) {
    return (
      <div className="space-y-4 px-5 pt-4">
        <Skeleton className="h-16 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    );
  }

  if (result && subject) return <BookingSuccess booking={result} tutor={tutor} subject={subject} />;

  // Slide in from the reading direction: forward steps come from the end side.
  const sign = dir === "rtl" ? -1 : 1;
  const stepVariants = {
    enter: (d: number) => ({ opacity: 0, x: 48 * d * sign }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: -48 * d * sign }),
  };

  return (
    <>
      <div className="flex items-center gap-3 px-5 pb-5">
        <Avatar name={l(tutor.displayName)} hue={tutor.avatarHue} size="md" />
        <div className="min-w-0">
          <p className="truncate font-bold">{fmt(t.booking.lessonWith, { name: l(tutor.displayName) })}</p>
          <p className="text-[13px] text-ink-500">{fmt(t.booking.stepOf, { current: step + 1, total: 3 })}</p>
        </div>
      </div>
      <StepProgress step={step} labels={t.booking.steps} />

      <div className="relative overflow-hidden px-5 pt-7 pb-36">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={stepVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 340, damping: 32 }}
          >
            {step === 0 && (
              <SubjectStep
                tutor={tutor}
                subjects={subjects}
                subjectId={resolved.subjectId}
                duration={resolved.duration}
                mode={resolved.mode}
                onChange={(patch) =>
                  setDraft((d) => ({
                    ...d,
                    ...(patch.subjectId !== undefined && { subjectId: patch.subjectId }),
                    ...(patch.duration !== undefined && { duration: patch.duration }),
                    ...(patch.mode !== undefined && { mode: patch.mode }),
                  }))
                }
              />
            )}
            {step === 1 && (
              <TimeStep
                days={days}
                loading={slotsLoading}
                date={resolved.date}
                startsAt={resolved.startsAt}
                onDate={(date) => setDraft((d) => ({ ...d, date, startsAt: undefined }))}
                onTime={(startsAt) => setDraft((d) => ({ ...d, startsAt }))}
              />
            )}
            {step === 2 && subject && resolved.startsAt && price && (
              <div className="space-y-5">
                <Card className="p-4">
                  <h2 className="mb-1 text-lg font-bold">{t.booking.summary}</h2>
                  <div className="divide-y divide-ink-100">
                    <SummaryRow icon={<BookOpen className="size-4" />} label={t.booking.subject} value={l(subject.name)} />
                    <SummaryRow icon={<CalendarDays className="size-4" />} label={t.booking.date} value={dayLabel(resolved.startsAt)} />
                    <SummaryRow
                      icon={<Clock className="size-4" />}
                      label={t.booking.time}
                      value={`${time(resolved.startsAt)} · ${resolved.duration} ${t.common.minutes}`}
                    />
                    <SummaryRow
                      icon={resolved.mode === "online" ? <Video className="size-4" /> : <MapPin className="size-4" />}
                      label={t.booking.mode}
                      value={resolved.mode === "online" ? t.common.online : t.common.inPerson}
                    />
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="flex justify-between py-1.5 text-sm">
                    <span className="text-ink-500">{t.booking.lessonPrice}</span>
                    <span className="font-semibold">{money(price)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 text-sm">
                    <span className="text-ink-500">{t.booking.platformFee}</span>
                    <span className="font-semibold text-mint-600">{t.booking.free}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-dashed border-ink-200 pt-3">
                    <span className="font-bold">{t.booking.total}</span>
                    <AnimatedNumber
                      value={price.amountMinor / 100}
                      format={(n) => money({ currency: price.currency, amountMinor: Math.round(n) * 100 })}
                      className="text-xl font-extrabold text-brand-700"
                    />
                  </div>
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="mt-3 flex items-center gap-2 rounded-xl bg-accent-100 px-3 py-2 text-[13px] font-medium text-accent-600"
                  >
                    <FlaskConical className="size-4 shrink-0" />
                    {t.booking.paymentSimulated}
                  </motion.div>
                </Card>

                <Textarea
                  label={t.booking.noteLabel}
                  placeholder={t.booking.notePlaceholder}
                  value={resolved.note}
                  maxLength={500}
                  onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                />
                <p className="flex items-center justify-center gap-1.5 text-[13px] text-ink-500">
                  <ShieldCheck className="size-4 text-mint-500" /> {t.booking.freeCancellation}
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <motion.div
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[var(--app-max-width)] px-3 pb-3"
      >
        <div className="flex items-center gap-3 rounded-[26px] border border-white/60 bg-white/92 p-3 shadow-nav backdrop-blur-xl">
          {step > 0 ? (
            <Button variant="outline" size="icon" className="h-12" onClick={() => go(step - 1)} aria-label={t.common.back}>
              <BackChevron className="size-5" />
            </Button>
          ) : (
            price && (
              <div className="ps-2">
                <p className="text-[11px] text-ink-500">{t.booking.total}</p>
                <motion.p key={price.amountMinor} initial={{ y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="text-lg font-extrabold">
                  {money(price, { compact: true })}
                </motion.p>
              </div>
            )
          )}
          {step < 2 ? (
            <Button size="lg" className="ms-auto h-12 flex-1" disabled={!canContinue} onClick={() => go(step + 1)}>
              {t.common.continue}
              <ForwardChevron className="size-4" />
            </Button>
          ) : (
            <Button size="lg" className="ms-auto h-12 flex-1" loading={create.isPending} onClick={confirm}>
              {t.booking.confirm}
            </Button>
          )}
        </div>
      </motion.div>
    </>
  );
}

export function BookingScreen({
  params,
  searchParams,
}: {
  params: Promise<{ tutorId: string }>;
  searchParams: Promise<{ subject?: string; start?: string }>;
}) {
  const { tutorId } = use(params);
  const query = use(searchParams);
  const { t } = useI18n();
  return (
    <Screen variant="push" withNav={false}>
      <TopBar title={t.booking.title} backHref={`/tutors/${tutorId}`} />
      <AuthGate role="student">
        <BookingFlow key={`${tutorId}-${query.subject ?? ""}-${query.start ?? ""}`} tutorId={tutorId} initialSubject={query.subject} initialStart={query.start} />
      </AuthGate>
    </Screen>
  );
}
