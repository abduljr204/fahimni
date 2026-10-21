"use client";

import { AnimatePresence, motion } from "motion/react";
import { CalendarX, Check, MapPin, Video } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { Card, Chip, Skeleton } from "@/components/ui/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { brand } from "@/config/app-config";
import { priceForDuration } from "@/domain/booking-rules";
import type { DaySlots, LessonMode, Subject, TutorProfile } from "@/domain/types";
import { intlLocales } from "@/i18n/config";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";
import { spring } from "@/lib/motion";

/** Animated three-step progress indicator. */
export function StepProgress({ step, labels }: { step: number; labels: string[] }) {
  return (
    <div className="px-5">
      <div className="relative flex items-center justify-between">
        <div className="absolute inset-x-4 top-4 h-1 rounded-full bg-ink-200" aria-hidden />
        <motion.div
          className="absolute inset-x-4 top-4 h-1 origin-left rounded-full bg-gradient-to-r from-brand-500 to-brand-600 rtl:origin-right rtl:bg-gradient-to-l"
          initial={false}
          animate={{ scaleX: step / (labels.length - 1) }}
          transition={spring.gentle}
          aria-hidden
        />
        {labels.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <div key={label} className="relative flex flex-col items-center gap-1.5">
              <motion.span
                initial={false}
                animate={{ scale: active ? 1.12 : 1 }}
                transition={spring.bouncy}
                className={cn(
                  "grid size-9 place-items-center rounded-full border-[3px] text-sm font-bold transition-colors duration-300",
                  done && "border-brand-600 bg-brand-600 text-white",
                  active && "border-brand-600 bg-white text-brand-700 shadow-float",
                  !done && !active && "border-ink-200 bg-white text-ink-400",
                )}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {done ? (
                    <motion.span key="check" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={spring.bouncy}>
                      <Check className="size-4" strokeWidth={3} />
                    </motion.span>
                  ) : (
                    <motion.span key="n" initial={{ scale: 0 }} animate={{ scale: 1 }}>
                      {i + 1}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.span>
              <span className={cn("text-[12px] font-semibold transition-colors", active || done ? "text-ink-900" : "text-ink-400")}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SubjectStep({
  tutor,
  subjects,
  subjectId,
  duration,
  mode,
  onChange,
}: {
  tutor: TutorProfile;
  subjects: Subject[];
  subjectId?: string;
  duration: number;
  mode: LessonMode;
  onChange: (patch: { subjectId?: string; duration?: number; mode?: LessonMode }) => void;
}) {
  const { t, l, money } = useI18n();
  return (
    <div className="space-y-7">
      <section>
        <h2 className="mb-3 text-lg font-bold">{t.booking.chooseSubject}</h2>
        <div className="space-y-2.5">
          {subjects.map((s, i) => {
            const selected = s.id === subjectId;
            return (
              <motion.button
                key={s.id}
                type="button"
                onClick={() => onChange({ subjectId: s.id })}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                whileTap={{ scale: 0.98 }}
                aria-pressed={selected}
                className={cn(
                  "flex w-full items-center justify-between rounded-2xl border-2 bg-white p-4 text-start transition-colors duration-200",
                  selected ? "border-brand-500 bg-brand-50/60" : "border-transparent shadow-card",
                )}
              >
                <span className="font-semibold">{l(s.name)}</span>
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full border-2 transition-colors",
                    selected ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300",
                  )}
                >
                  {selected && (
                    <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.bouncy}>
                      <Check className="size-3.5" strokeWidth={3} />
                    </motion.span>
                  )}
                </span>
              </motion.button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">{t.booking.duration}</h2>
        <div className="grid grid-cols-3 gap-2.5">
          {brand.lessonDurations.map((d) => {
            const selected = d === duration;
            return (
              <motion.button
                key={d}
                type="button"
                whileTap={{ scale: 0.95 }}
                onClick={() => onChange({ duration: d })}
                aria-pressed={selected}
                className={cn(
                  "relative rounded-2xl p-3 text-center transition-colors",
                  selected ? "text-white" : "bg-white text-ink-800 shadow-card",
                )}
              >
                {selected && (
                  <motion.span layoutId="duration-pill" className="absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-float" transition={spring.snappy} />
                )}
                <span className="relative block text-lg font-extrabold">{d}</span>
                <span className={cn("relative block text-[12px]", selected ? "text-white/80" : "text-ink-500")}>
                  {money(priceForDuration(tutor.hourlyRate, d), { compact: true })}
                </span>
              </motion.button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">{t.booking.mode}</h2>
        <div className="flex gap-2.5">
          {tutor.modes.map((m) => (
            <Chip
              key={m}
              selected={mode === m}
              onClick={() => onChange({ mode: m })}
              icon={m === "online" ? <Video className="size-4" /> : <MapPin className="size-4" />}
              className="h-12 flex-1 justify-center"
            >
              {m === "online" ? t.common.online : t.common.inPerson}
            </Chip>
          ))}
        </div>
      </section>
    </div>
  );
}

export function TimeStep({
  days,
  loading,
  date,
  startsAt,
  onDate,
  onTime,
}: {
  days?: DaySlots[];
  loading: boolean;
  date?: string;
  startsAt?: string;
  onDate: (date: string) => void;
  onTime: (iso: string) => void;
}) {
  const { t, weekday, time, intlMonth } = useMonthFormatter();
  const stripRef = useRef<HTMLDivElement>(null);
  const selectedDay = days?.find((d) => d.date === date);
  const available = useMemo(() => selectedDay?.slots.filter((s) => s.available) ?? [], [selectedDay]);

  useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>("[aria-pressed=true]")?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [date]);

  if (loading && !days) {
    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 flex-1 rounded-2xl" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{t.booking.chooseDate}</h2>
          {date && <span className="text-sm font-semibold text-brand-700">{intlMonth(date)}</span>}
        </div>
        <div ref={stripRef} className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 py-1">
          {days?.map((d, i) => {
            const count = d.slots.filter((s) => s.available).length;
            const selected = d.date === date;
            const [y, m, dd] = d.date.split("-").map(Number);
            const local = new Date(y, m - 1, dd);
            return (
              <motion.button
                key={d.date}
                type="button"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.025 }}
                whileTap={{ scale: 0.92 }}
                disabled={count === 0}
                onClick={() => onDate(d.date)}
                aria-pressed={selected}
                className={cn(
                  "relative flex w-16 shrink-0 flex-col items-center rounded-2xl py-3 transition-colors disabled:opacity-40",
                  selected ? "text-white" : "bg-white text-ink-800 shadow-card",
                )}
              >
                {selected && (
                  <motion.span layoutId="date-pill" className="absolute inset-0 rounded-2xl bg-ink-900" transition={spring.snappy} />
                )}
                <span className={cn("relative text-[11px] font-medium", selected ? "text-white/70" : "text-ink-500")}>{weekday(local)}</span>
                <span className="relative text-xl font-extrabold">{dd}</span>
                <span className="relative mt-1 flex gap-0.5">
                  {Array.from({ length: Math.min(3, Math.ceil(count / 3)) }).map((_, k) => (
                    <span key={k} className={cn("size-1 rounded-full", selected ? "bg-accent-400" : "bg-brand-400")} />
                  ))}
                </span>
              </motion.button>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">{t.booking.chooseTime}</h2>
        <AnimatePresence mode="wait">
          {available.length === 0 ? (
            <motion.div key={`empty-${date}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <Card>
                <EmptyState icon={<CalendarX />} title={t.booking.noSlotsDay} body={t.booking.tryAnotherDay} className="py-6" />
              </Card>
            </motion.div>
          ) : (
            <motion.div
              key={date}
              className="grid grid-cols-3 gap-2.5"
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.03 } } }}
            >
              {available.map((slot) => {
                const selected = slot.startsAt === startsAt;
                return (
                  <motion.button
                    key={slot.startsAt}
                    type="button"
                    variants={{ hidden: { opacity: 0, scale: 0.85 }, show: { opacity: 1, scale: 1 } }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => onTime(slot.startsAt)}
                    aria-pressed={selected}
                    className={cn(
                      "relative h-12 rounded-2xl text-[15px] font-bold tabular-nums transition-colors",
                      selected ? "text-white" : "bg-white text-ink-800 shadow-card hover:text-brand-700",
                    )}
                  >
                    {selected && (
                      <motion.span layoutId="time-pill" className="absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-float" transition={spring.snappy} />
                    )}
                    <span className="relative">{time(slot.startsAt)}</span>
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}

function useMonthFormatter() {
  const i18n = useI18n();
  const monthFmt = useMemo(
    () => new Intl.DateTimeFormat(intlLocales[i18n.locale], { month: "long", year: "numeric" }),
    [i18n.locale],
  );
  return {
    ...i18n,
    intlMonth: (date: string) => {
      const [y, m, d] = date.split("-").map(Number);
      return monthFmt.format(new Date(y, m - 1, d));
    },
  };
}
