"use client";

import { AnimatePresence, motion } from "motion/react";
import { Info, Minus, Plus, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { PageTitle, Screen } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { Card, Chip, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { brand } from "@/config/app-config";
import { toMajor, toMinor } from "@/domain/money";
import { bpsToPercent, isRateWithinLimits, priceLesson } from "@/domain/pricing";
import type { Money, PlatformSettings, TutorProfile } from "@/domain/types";
import { usePlatformSettings, useTutor, useUpdateHourlyRate } from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";
import { isServiceError } from "@/services";
import { TutorOnly } from "./dashboard-screen";

function Editor() {
  const { session } = useSession();
  const { data: tutor, isLoading } = useTutor(session?.tutorId);
  const { data: settings } = usePlatformSettings();
  if (isLoading || !tutor || !settings) {
    return (
      <div className="space-y-3 px-5">
        <Skeleton className="h-48 rounded-3xl" />
        <Skeleton className="h-56 rounded-3xl" />
      </div>
    );
  }
  // Remount when the saved rate or the limits change so the form starts from stored values.
  return <PricingForm key={`${tutor.hourlyRate.amountMinor}-${settings.updatedAt}`} tutor={tutor} settings={settings} />;
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-ink-500">{label}</span>
      <motion.span key={value} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className={cn("font-semibold tabular-nums", className)}>
        {value}
      </motion.span>
    </div>
  );
}

function PricingForm({ tutor, settings }: { tutor: TutorProfile; settings: PlatformSettings }) {
  const { t, fmt, money, number, currencySymbol } = useI18n();
  const toast = useToast();
  const save = useUpdateHourlyRate();
  const { currency } = tutor.hourlyRate;
  const min = toMajor(settings.minHourlyRate.amountMinor, currency);
  const max = toMajor(settings.maxHourlyRate.amountMinor, currency);

  // Kept as text so the field can be cleared while typing.
  const [text, setText] = useState(String(toMajor(tutor.hourlyRate.amountMinor, currency)));
  const [duration, setDuration] = useState<number>(60);

  const major = text.trim() === "" ? NaN : Number(text);
  const rate: Money = { currency, amountMinor: Number.isFinite(major) ? toMinor(major, currency) : 0 };
  const valid = Number.isInteger(major) && isRateWithinLimits(rate, settings);
  const dirty = rate.amountMinor !== tutor.hourlyRate.amountMinor;
  const currentOutside = !isRateWithinLimits(tutor.hourlyRate, settings);

  // The split is shown for any whole price, even one outside the limits, so the tutor can still compare.
  const priceable = Number.isInteger(major) && major > 0;
  const preview = priceable ? priceLesson({ hourlyRate: rate, durationMinutes: duration, mode: "online", commissionBps: settings.commissionBps }) : undefined;
  const inPerson = priceable ? priceLesson({ hourlyRate: rate, durationMinutes: duration, mode: "in_person", commissionBps: settings.commissionBps }) : undefined;
  const percent = number(bpsToPercent(settings.commissionBps));
  const limits = { min: money(settings.minHourlyRate), max: money(settings.maxHourlyRate) };

  const step = (delta: number) => {
    const base = Number.isFinite(major) ? Math.round(major) : min;
    setText(String(Math.min(max, Math.max(min, base + delta))));
  };

  return (
    <div className="space-y-4 px-5 pb-28">
      {currentOutside && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-2.5 rounded-2xl bg-coral-100 p-3.5 text-[13px] font-medium text-coral-600">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          {fmt(t.pricing.outOfRange, limits)}
        </motion.div>
      )}

      <Card className="p-5">
        <label htmlFor="hourly-rate" className="block text-center text-sm font-semibold text-ink-600">
          {t.pricing.hourlyRate}
        </label>
        <div className="mt-3 flex items-center justify-center gap-3">
          <motion.button
            type="button"
            whileTap={{ scale: 0.85 }}
            onClick={() => step(-1)}
            disabled={Number.isFinite(major) && major <= min}
            className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ink-50 text-ink-700 disabled:opacity-40"
            aria-label={t.pricing.decrease}
          >
            <Minus className="size-5" />
          </motion.button>
          <div className="min-w-0 flex-1 text-center">
            <input
              id="hourly-rate"
              type="number"
              inputMode="numeric"
              min={min}
              max={max}
              step={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              dir="ltr"
              aria-invalid={!valid || undefined}
              aria-describedby="hourly-rate-hint"
              className={cn(
                "w-full bg-transparent text-center text-5xl font-extrabold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                valid ? "text-ink-900" : "text-coral-600",
              )}
            />
            <p className="mt-1 text-sm font-medium text-ink-500">
              {currencySymbol(currency)} {t.common.perHour}
            </p>
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.85 }}
            onClick={() => step(1)}
            disabled={Number.isFinite(major) && major >= max}
            className="grid size-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-700 disabled:opacity-40"
            aria-label={t.pricing.increase}
          >
            <Plus className="size-5" />
          </motion.button>
        </div>

        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={Number.isFinite(major) ? Math.min(max, Math.max(min, major)) : min}
          onChange={(e) => setText(e.target.value)}
          aria-label={t.pricing.hourlyRate}
          className="mt-5 w-full accent-brand-600"
        />
        <p id="hourly-rate-hint" className={cn("mt-2 text-center text-[12px]", valid ? "text-ink-500" : "font-medium text-coral-600")}>
          {valid ? fmt(t.pricing.limits, limits) : fmt(t.validation.rateOutOfRange, limits)}
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-bold">{t.pricing.preview}</h2>
        <div className="mt-3 flex gap-2">
          {brand.lessonDurations.map((d) => (
            <Chip key={d} selected={duration === d} onClick={() => setDuration(d)} layoutGroup="pricing-duration" className="h-9 flex-1 justify-center shadow-none ring-1 ring-ink-200">
              {d} {t.common.minutes}
            </Chip>
          ))}
        </div>
        <AnimatePresence mode="wait">
          {preview && inPerson ? (
            <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3">
              <Row label={t.pricing.studentPays} value={money(preview.total)} />
              <Row label={fmt(t.pricing.commission, { percent })} value={`− ${money(preview.commission)}`} className="text-ink-500" />
              <div className="mt-1.5 flex items-center justify-between border-t border-dashed border-ink-200 pt-3">
                <span className="font-bold">{t.pricing.youReceive}</span>
                <motion.span key={preview.tutorEarnings.amountMinor} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-2xl font-extrabold text-mint-600 tabular-nums">
                  {money(preview.tutorEarnings)}
                </motion.span>
              </div>
              {tutor.modes.includes("in_person") && (
                <p className="mt-3 rounded-2xl bg-ink-50 p-3 text-[13px] text-ink-600">
                  {fmt(t.pricing.inPersonNote, { commission: money(inPerson.dueInApp), cash: money(inPerson.dueInCash) })}
                </p>
              )}
            </motion.div>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Skeleton className="mt-3 h-28 rounded-2xl" />
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      <div className="flex gap-2.5 rounded-2xl bg-brand-50 p-3.5 text-[13px] text-brand-800">
        <Info className="mt-0.5 size-4 shrink-0 text-brand-600" />
        {t.pricing.onlyNew}
      </div>

      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed inset-x-0 bottom-[calc(var(--nav-height)+1.5rem)] z-30 mx-auto w-full max-w-[var(--app-max-width)] px-5"
          >
            <Button
              block
              size="lg"
              disabled={!valid}
              loading={save.isPending}
              onClick={() =>
                save.mutate(rate, {
                  onSuccess: () => toast.success(t.pricing.saved),
                  onError: (error) =>
                    toast.error(isServiceError(error, "validation") ? fmt(t.validation.rateOutOfRange, limits) : t.common.somethingWrong),
                })
              }
            >
              {t.common.save}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function PricingScreen() {
  const { t } = useI18n();
  return (
    <Screen>
      <PageTitle title={t.pricing.title} subtitle={t.pricing.subtitle} />
      <TutorOnly>
        <Editor />
      </TutorOnly>
    </Screen>
  );
}
