"use client";

import { AnimatePresence, motion } from "motion/react";
import { Bell, CalendarCheck, CalendarClock, Check, Eye, FlaskConical, Inbox, MessageCircleReply, Star, TrendingDown, TrendingUp, X } from "lucide-react";
import type { ReactNode } from "react";
import { AppLink } from "@/components/layout/app-link";
import { Screen } from "@/components/layout/screen";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AnimatedNumber, BarChart, ProgressRing } from "@/components/ui/data-viz";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge, Card, ForwardChevron, SectionHeader, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { isUpcoming } from "@/domain/booking-rules";
import { toMajor, toMinor } from "@/domain/money";
import { SignInPrompt } from "@/features/auth/auth-gate";
import { useRoleSwitch } from "@/features/demo/use-role-switch";
import { LessonCard } from "@/features/lessons/lesson-card";
import { useNotifications, useRespondToBooking, useTutorBookings, useTutorStats } from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { fadeUp, stagger } from "@/lib/motion";

function StatTile({ icon, label, children, tone }: { icon: ReactNode; label: string; children: ReactNode; tone: string }) {
  return (
    <motion.div variants={fadeUp} whileHover={{ y: -3 }}>
      <Card className="h-full p-4">
        <span className={`grid size-10 place-items-center rounded-2xl ${tone}`}>{icon}</span>
        <div className="mt-3 text-2xl font-extrabold">{children}</div>
        <p className="mt-0.5 text-[12px] text-ink-500">{label}</p>
      </Card>
    </motion.div>
  );
}

function Requests() {
  const { t, l, dayLabel, time, money } = useI18n();
  const toast = useToast();
  const { data, isLoading } = useTutorBookings();
  const respond = useRespondToBooking();
  const pending = (data ?? []).filter((b) => b.status === "pending" && isUpcoming(b));

  return (
    <section className="px-5 pt-8">
      <SectionHeader
        title={t.dashboard.requests}
        action={pending.length > 0 && <Badge tone="accent">{pending.length}</Badge>}
      />
      {isLoading ? (
        <Skeleton className="h-36 rounded-3xl" />
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout" initial={false}>
            {pending.length === 0 ? (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <Card>
                  <EmptyState icon={<Inbox />} title={t.dashboard.noRequestsTitle} body={t.dashboard.noRequestsBody} className="py-7" />
                </Card>
              </motion.div>
            ) : (
              pending.map((b, i) => (
                <motion.div
                  key={b.id}
                  layout
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, x: 60, transition: { duration: 0.25 } }}
                  transition={{ type: "spring", stiffness: 300, damping: 28, delay: i * 0.05 }}
                >
                  <Card className="relative overflow-hidden p-4">
                    <motion.span
                      className="absolute inset-y-0 start-0 w-1 bg-accent-400"
                      initial={{ scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={{ delay: 0.2 + i * 0.05 }}
                    />
                    <div className="flex items-center gap-3">
                      <Avatar name={l(b.student.displayName)} hue={b.student.avatarHue} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold">{l(b.student.displayName)}</p>
                        <p className="truncate text-[13px] text-ink-500">{l(b.subject.name)}</p>
                      </div>
                      <div className="text-end text-[13px]">
                        <p className="font-bold">{dayLabel(b.startsAt)}</p>
                        <p className="text-ink-500">
                          {time(b.startsAt)} · {money(b.price, { compact: true })}
                        </p>
                      </div>
                    </div>
                    {b.note && <p className="mt-3 rounded-2xl bg-ink-50 p-3 text-[13px] text-ink-600">“{b.note}”</p>}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        loading={respond.isPending && respond.variables?.bookingId === b.id && !respond.variables.accept}
                        onClick={() => respond.mutate({ bookingId: b.id, accept: false }, { onSuccess: () => toast.info(t.dashboard.declined) })}
                      >
                        <X className="size-4" /> {t.dashboard.decline}
                      </Button>
                      <Button
                        size="sm"
                        loading={respond.isPending && respond.variables?.bookingId === b.id && respond.variables.accept}
                        onClick={() => respond.mutate({ bookingId: b.id, accept: true }, { onSuccess: () => toast.success(t.dashboard.accepted) })}
                      >
                        <Check className="size-4" /> {t.dashboard.accept}
                      </Button>
                    </div>
                  </Card>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      )}
    </section>
  );
}

function Upcoming() {
  const { t } = useI18n();
  const { data } = useTutorBookings();
  const upcoming = (data ?? []).filter((b) => b.status === "confirmed" && isUpcoming(b)).slice(0, 3);
  return (
    <section className="px-5 pt-8">
      <SectionHeader
        title={t.dashboard.upcoming}
        action={
          <AppLink href="/lessons" className="text-sm font-semibold text-brand-600">
            {t.common.seeAll}
          </AppLink>
        }
      />
      <div className="space-y-3">
        {upcoming.length === 0 ? (
          <Card className="p-5 text-center text-sm text-ink-500">{t.dashboard.noUpcoming}</Card>
        ) : (
          upcoming.map((b, i) => <LessonCard key={b.id} booking={b} perspective="tutor" index={i} highlight={i === 0} />)
        )}
      </div>
    </section>
  );
}

function Dashboard() {
  const { t, l, fmt, money, number } = useI18n();
  const { session } = useSession();
  const { data: stats, isLoading } = useTutorStats();
  const { data: notifications = [] } = useNotifications();
  const unread = notifications.filter((n) => !n.readAt).length;
  const today = new Date().getDay();
  const delta = stats
    ? Math.round(((stats.earningsThisMonth.amountMinor - stats.earningsLastMonth.amountMinor) / Math.max(1, stats.earningsLastMonth.amountMinor)) * 100)
    : 0;

  return (
    <>
      <header className="flex items-center justify-between px-5 pt-6">
        <div>
          <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-[24px] font-extrabold">
            {fmt(t.dashboard.hello, { name: l(session?.user.displayName).split(" ")[0] })}
          </motion.h1>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="text-sm text-ink-500">
            {t.dashboard.subtitle}
          </motion.p>
        </div>
        <AppLink href="/notifications" className="relative grid size-11 place-items-center rounded-full bg-white shadow-card" aria-label={t.nav.notifications}>
          <Bell className="size-5 text-ink-700" />
          {unread > 0 && (
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute -end-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-canvas bg-coral-500 px-1 text-[10px] font-bold text-white">
              {unread}
            </motion.span>
          )}
        </AppLink>
      </header>

      <section className="px-5 pt-5">
        {isLoading || !stats ? (
          <Skeleton className="h-40 rounded-[28px]" />
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
            className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 p-5 text-white shadow-float"
          >
            <motion.span className="absolute -end-12 -top-12 size-44 rounded-full bg-white/10" animate={{ scale: [1, 1.15, 1] }} transition={{ duration: 7, repeat: Infinity }} />
            <motion.span className="absolute -bottom-16 start-10 size-40 rounded-full bg-accent-400/20 blur-xl" animate={{ x: [0, 20, 0] }} transition={{ duration: 8, repeat: Infinity }} />
            <div className="relative flex items-start justify-between">
              <p className="text-sm text-white/75">{t.dashboard.earnings}</p>
              <Badge tone="dark" className="bg-white/15">
                <FlaskConical className="size-3" /> {t.dashboard.demoEarnings}
              </Badge>
            </div>
            <AnimatedNumber
              value={toMajor(stats.earningsThisMonth.amountMinor, stats.earningsThisMonth.currency)}
              format={(n) => money({ currency: stats.earningsThisMonth.currency, amountMinor: toMinor(Math.round(n), stats.earningsThisMonth.currency) }, { compact: true })}
              className="relative mt-2 block text-4xl font-extrabold tracking-tight"
              duration={1.4}
            />
            <div className="relative mt-3 flex items-center gap-2 text-[13px]">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${delta >= 0 ? "bg-mint-400/25 text-mint-100" : "bg-coral-400/25 text-coral-100"}`}>
                {delta >= 0 ? <TrendingUp className="size-3.5 rtl:-scale-x-100" /> : <TrendingDown className="size-3.5 rtl:-scale-x-100" />}
                {delta >= 0 ? "+" : ""}
                {delta}%
              </span>
              <span className="text-white/70">{t.dashboard.vsLastMonth}</span>
            </div>
          </motion.div>
        )}
      </section>

      {stats && (
        <motion.section variants={stagger(0.07, 0.15)} initial="hidden" animate="show" className="grid grid-cols-2 gap-3 px-5 pt-4">
          <StatTile icon={<CalendarCheck className="size-5" />} label={t.dashboard.lessonsMonth} tone="bg-brand-50 text-brand-600">
            <AnimatedNumber value={stats.lessonsThisMonth} format={(n) => number(Math.round(n))} />
          </StatTile>
          <StatTile icon={<Star className="size-5" />} label={t.dashboard.rating} tone="bg-accent-100 text-accent-600">
            <AnimatedNumber value={stats.averageRating} format={(n) => n.toFixed(1)} />
          </StatTile>
          <StatTile icon={<MessageCircleReply className="size-5" />} label={t.dashboard.responseRate} tone="bg-mint-100 text-mint-600">
            <AnimatedNumber value={stats.responseRate} format={(n) => `${Math.round(n)}%`} />
          </StatTile>
          <StatTile icon={<Eye className="size-5" />} label={t.dashboard.profileViews} tone="bg-coral-100 text-coral-600">
            <AnimatedNumber value={stats.profileViews} format={(n) => number(Math.round(n))} />
          </StatTile>
        </motion.section>
      )}

      {stats && (
        <section className="px-5 pt-8">
          <SectionHeader title={t.dashboard.thisWeek} action={<CalendarClock className="size-5 text-ink-400" />} />
          <Card className="p-5 pt-8">
            <BarChart values={stats.weeklyLessons} labels={t.dashboard.weekdaysShort} highlightIndex={today} />
          </Card>
        </section>
      )}

      <Requests />
      <Upcoming />

      {stats && (
        <section className="px-5 pt-8">
          <Card className="flex items-center gap-4 p-5">
            <ProgressRing value={stats.profileCompleteness} size={76}>
              <span className="text-base font-extrabold">{stats.profileCompleteness}%</span>
            </ProgressRing>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{t.dashboard.profileStrength}</p>
              <p className="mt-0.5 text-[13px] text-ink-500">{t.dashboard.profileTip}</p>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                <AppLink href={`/tutors/${session?.tutorId}`} className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-brand-600">
                  {t.dashboard.viewProfile} <ForwardChevron className="size-3.5" />
                </AppLink>
                <AppLink href="/tutor/schedule" className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-brand-600">
                  {t.dashboard.manageSchedule} <ForwardChevron className="size-3.5" />
                </AppLink>
              </div>
            </div>
          </Card>
        </section>
      )}
    </>
  );
}

/** Students who open the dashboard are offered the demo tutor account. */
export function TutorOnly({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { status, role } = useSession();
  const roles = useRoleSwitch();
  if (status === "loading") return <Skeleton className="mx-5 mt-6 h-40 rounded-3xl" />;
  if (status === "guest" && !roles.available) return <SignInPrompt />;
  if (role !== "tutor") {
    return (
      <div className="px-5 pt-10">
        <Card className="p-6 text-center">
          <p className="text-lg font-extrabold">{t.home.becomeTutorTitle}</p>
          <p className="mt-1.5 text-sm text-ink-500">{t.home.becomeTutorBody}</p>
          <Button className="mt-5" loading={roles.pending === "tutor"} onClick={() => roles.switchTo("tutor")}>
            {t.home.becomeTutorCta}
          </Button>
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}

export function DashboardScreen() {
  return (
    <Screen>
      <TutorOnly>
        <Dashboard />
      </TutorOnly>
    </Screen>
  );
}
