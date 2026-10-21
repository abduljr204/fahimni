"use client";

import { AnimatePresence, motion } from "motion/react";
import { Plus, Trash2, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { PageTitle, Screen } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ui/data-viz";
import { Card, Skeleton, Switch } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { toMinutes } from "@/domain/booking-rules";
import type { AvailabilityWindow, TutorProfile } from "@/domain/types";
import { availabilitySchema } from "@/domain/validation";
import { useTutor, useUpdateAvailability } from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";
import { TutorOnly } from "./dashboard-screen";

const TIMES = Array.from({ length: 31 }, (_, i) => {
  const m = 7 * 60 + i * 30; // 07:00 → 22:00
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});
// The Libyan week starts on Saturday (the weekend is Friday and Saturday).
const ORDER = [6, 0, 1, 2, 3, 4, 5];

function TimeSelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="text-[11px] text-ink-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-xl border border-ink-200 bg-white px-3 text-sm font-semibold tabular-nums outline-none focus:border-brand-400"
        dir="ltr"
      >
        {TIMES.map((time) => (
          <option key={time} value={time}>
            {time}
          </option>
        ))}
      </select>
    </label>
  );
}

function Editor() {
  const { session } = useSession();
  const { data: tutor, isLoading } = useTutor(session?.tutorId);
  if (isLoading || !tutor) {
    return (
      <div className="space-y-3 px-5">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 rounded-3xl" />
        ))}
      </div>
    );
  }
  // Remount when the saved availability changes so the form starts from the stored values.
  return <EditorForm key={JSON.stringify([tutor.availability, tutor.instantBook])} tutor={tutor} />;
}

function EditorForm({ tutor }: { tutor: TutorProfile }) {
  const { t, number } = useI18n();
  const toast = useToast();
  const save = useUpdateAvailability();
  const [windows, setWindows] = useState<AvailabilityWindow[]>(tutor.availability);
  const [instantBook, setInstantBook] = useState(tutor.instantBook);
  const [dirty, setDirty] = useState(false);

  const hours = useMemo(() => windows.reduce((sum, w) => sum + Math.max(0, toMinutes(w.end) - toMinutes(w.start)), 0) / 60, [windows]);
  const valid = availabilitySchema.safeParse(windows).success;

  const update = (next: AvailabilityWindow[]) => {
    setWindows(next);
    setDirty(true);
  };

  return (
    <div className="px-5 pb-28">
      <Card className="mb-4 flex items-center gap-3 p-4">
        <span className="grid size-10 place-items-center rounded-2xl bg-accent-100 text-accent-600">
          <Zap className="size-5" />
        </span>
        <div className="flex-1">
          <p className="font-semibold">{t.schedule.instantBook}</p>
          <p className="text-[12px] text-ink-500">{t.schedule.instantBookHint}</p>
        </div>
        <Switch
          checked={instantBook}
          onChange={(v) => {
            setInstantBook(v);
            setDirty(true);
          }}
          label={t.schedule.instantBook}
        />
      </Card>

      <p className="mb-3 text-center text-sm font-semibold text-brand-700">
        <AnimatedNumber value={hours} format={(n) => number(Math.round(n * 2) / 2)} /> {t.schedule.hoursPerWeek}
      </p>

      <div className="space-y-3">
        {ORDER.map((weekday, i) => {
          const dayWindows = windows.map((w, idx) => ({ w, idx })).filter(({ w }) => w.weekday === weekday);
          const enabled = dayWindows.length > 0;
          return (
            <motion.div key={weekday} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
              <Card className={cn("p-4 transition-colors", !enabled && "bg-white/60")}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold">{t.schedule.weekdays[weekday]}</p>
                    {!enabled && <p className="text-[12px] text-ink-400">{t.schedule.unavailable}</p>}
                  </div>
                  <Switch
                    checked={enabled}
                    label={t.schedule.weekdays[weekday]}
                    onChange={(on) =>
                      update(on ? [...windows, { weekday, start: "17:00", end: "20:00" }] : windows.filter((w) => w.weekday !== weekday))
                    }
                  />
                </div>
                <AnimatePresence initial={false}>
                  {enabled && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="space-y-2.5 pt-3">
                        <AnimatePresence initial={false}>
                          {dayWindows.map(({ w, idx }) => (
                            <motion.div
                              key={idx}
                              layout
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.9 }}
                              className="flex items-end gap-2"
                            >
                              <TimeSelect label={t.schedule.from} value={w.start} onChange={(v) => update(windows.map((x, j) => (j === idx ? { ...x, start: v } : x)))} />
                              <TimeSelect label={t.schedule.to} value={w.end} onChange={(v) => update(windows.map((x, j) => (j === idx ? { ...x, end: v } : x)))} />
                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.85 }}
                                onClick={() => update(windows.filter((_, j) => j !== idx))}
                                className="grid size-10 shrink-0 place-items-center rounded-xl bg-coral-100 text-coral-600"
                                aria-label={t.common.cancel}
                              >
                                <Trash2 className="size-4" />
                              </motion.button>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                        {dayWindows.some(({ w }) => w.start >= w.end) && <p className="text-[12px] font-medium text-coral-600">{t.validation.invalidRange}</p>}
                        <button
                          type="button"
                          onClick={() => update([...windows, { weekday, start: "09:00", end: "12:00" }])}
                          className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand-600"
                        >
                          <Plus className="size-4" /> {t.schedule.addWindow}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          );
        })}
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
                save.mutate(
                  { availability: windows, instantBook },
                  {
                    onSuccess: () => {
                      setDirty(false);
                      toast.success(t.schedule.saved);
                    },
                    onError: () => toast.error(t.common.somethingWrong),
                  },
                )
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

export function ScheduleScreen() {
  const { t } = useI18n();
  return (
    <Screen>
      <PageTitle title={t.schedule.title} subtitle={t.schedule.subtitle} />
      <TutorOnly>
        <Editor />
      </TutorOnly>
    </Screen>
  );
}
