"use client";

import { motion, useReducedMotion } from "motion/react";
import { CalendarPlus, Clock, House, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AppLink } from "@/components/layout/app-link";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/primitives";
import { toICS } from "@/domain/booking-rules";
import type { Booking, Subject, TutorProfile } from "@/domain/types";
import { useOpenConversation } from "@/hooks/use-data";
import { useI18n } from "@/i18n/i18n-provider";

async function celebrate() {
  const confetti = (await import("canvas-confetti")).default;
  const colors = ["#7058f4", "#ffbb38", "#34d39e", "#ff7a7a", "#ada1ff"];
  const base = { colors, disableForReducedMotion: true, zIndex: 90, ticks: 220 };
  confetti({ ...base, particleCount: 90, spread: 75, startVelocity: 42, origin: { y: 0.35 } });
  window.setTimeout(() => {
    confetti({ ...base, particleCount: 50, angle: 60, spread: 60, origin: { x: 0, y: 0.6 } });
    confetti({ ...base, particleCount: 50, angle: 120, spread: 60, origin: { x: 1, y: 0.6 } });
  }, 250);
}

function SuccessMark({ pending }: { pending: boolean }) {
  return (
    <div className="relative mx-auto grid size-28 place-items-center">
      <motion.span
        className={`absolute inset-0 rounded-full ${pending ? "bg-accent-200" : "bg-mint-100"}`}
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.15, 1] }}
        transition={{ duration: 0.6 }}
      />
      <motion.span
        className={`absolute inset-0 rounded-full ${pending ? "bg-accent-300" : "bg-mint-400"}`}
        initial={{ scale: 1, opacity: 0.5 }}
        animate={{ scale: 1.6, opacity: 0 }}
        transition={{ duration: 1.2, delay: 0.4, repeat: 2 }}
      />
      <motion.span
        className={`relative grid size-20 place-items-center rounded-full ${pending ? "bg-accent-400" : "bg-mint-500"} text-white shadow-lg`}
        initial={{ scale: 0, rotate: -45 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.15 }}
      >
        {pending ? (
          <motion.span initial={{ rotate: -180 }} animate={{ rotate: 0 }} transition={{ duration: 0.8, delay: 0.3 }}>
            <Clock className="size-10" strokeWidth={2.5} />
          </motion.span>
        ) : (
          <svg viewBox="0 0 24 24" className="size-10" fill="none" aria-hidden>
            <motion.path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.5, delay: 0.45, ease: "easeOut" }}
            />
          </svg>
        )}
      </motion.span>
    </div>
  );
}

export function BookingSuccess({ booking, tutor, subject }: { booking: Booking; tutor: TutorProfile; subject: Subject }) {
  const { t, l, fmt, dayLabel, time, money, href } = useI18n();
  const router = useRouter();
  const open = useOpenConversation();
  const reduced = useReducedMotion();
  const pending = booking.status === "pending";

  useEffect(() => {
    if (!reduced) void celebrate();
  }, [reduced]);

  const downloadIcs = () => {
    const ics = toICS({
      uid: `${booking.id}@naqraw`,
      title: `${l(subject.name)} — ${l(tutor.displayName)}`,
      description: fmt(t.booking.lessonWith, { name: l(tutor.displayName) }),
      startsAt: booking.startsAt,
      durationMinutes: booking.durationMinutes,
      location: booking.meetingUrl ?? l(booking.location),
    });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "naqraw-lesson.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-5 pt-10 text-center">
      <SuccessMark pending={pending} />
      <motion.h1
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="mt-6 text-2xl font-extrabold"
      >
        {pending ? t.booking.requestSent : t.booking.confirmed}
      </motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} className="mx-auto mt-2 max-w-xs text-[15px] text-ink-600">
        {fmt(pending ? t.booking.requestBody : t.booking.confirmedBody, { name: l(tutor.displayName) })}
      </motion.p>

      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, type: "spring", stiffness: 200, damping: 22 }}>
        <Card className="mt-7 p-4 text-start">
          <div className="flex items-center gap-3">
            <Avatar name={l(tutor.displayName)} hue={tutor.avatarHue} size="md" />
            <div className="min-w-0 flex-1">
              <p className="font-bold">{l(subject.name)}</p>
              <p className="text-[13px] text-ink-500">{l(tutor.displayName)}</p>
            </div>
            <Badge tone={pending ? "accent" : "mint"}>{t.lessons.status[booking.status]}</Badge>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-ink-50 p-3 text-center text-[13px]">
            <div>
              <p className="text-ink-500">{t.booking.date}</p>
              <p className="mt-0.5 truncate font-bold">{dayLabel(booking.startsAt)}</p>
            </div>
            <div>
              <p className="text-ink-500">{t.booking.time}</p>
              <p className="mt-0.5 font-bold">{time(booking.startsAt)}</p>
            </div>
            <div>
              <p className="text-ink-500">{t.booking.total}</p>
              <p className="mt-0.5 font-bold">{money(booking.price, { compact: true })}</p>
            </div>
          </div>
          <p className="mt-3 text-center text-[12px] font-medium text-accent-600">{t.booking.paymentSimulated}</p>
        </Card>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.85 }}
        className="mt-6 space-y-3"
      >
        <AppLink href="/lessons" className="block">
          <Button block size="lg">
            {t.booking.viewLessons}
          </Button>
        </AppLink>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            loading={open.isPending}
            onClick={() => open.mutate(tutor.id, { onSuccess: (c) => router.push(href(`/messages/${c.id}`)) })}
          >
            <MessageCircle className="size-4" /> {t.booking.messageTutor}
          </Button>
          <Button variant="outline" onClick={downloadIcs}>
            <CalendarPlus className="size-4" /> {t.booking.addToCalendar}
          </Button>
        </div>
        <AppLink href="/" className="inline-flex items-center gap-1.5 pt-2 text-sm font-semibold text-ink-500">
          <House className="size-4" /> {t.booking.bookAnother}
        </AppLink>
      </motion.div>
    </motion.div>
  );
}
