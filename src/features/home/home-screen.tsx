"use client";

import { motion } from "motion/react";
import { Bell, CalendarCheck, Search, Sparkles, Star, Users } from "lucide-react";
import { AppLink } from "@/components/layout/app-link";
import { Screen } from "@/components/layout/screen";
import { LogoMark } from "@/components/illustrations/logo";
import { HeroIllustration } from "@/components/illustrations/hero-illustration";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ui/data-viz";
import { Card, ForwardChevron, SectionHeader } from "@/components/ui/primitives";
import { SUBJECT_CATEGORIES } from "@/domain/types";
import { isUpcoming } from "@/domain/booking-rules";
import { useRoleSwitch } from "@/features/demo/use-role-switch";
import { LessonCard } from "@/features/lessons/lesson-card";
import { categoryColors, categoryIcons, TutorCard, TutorCardSkeleton, TutorTile, TutorTileSkeleton } from "@/features/tutors/shared";
import { useFeaturedTutors, useNotifications, useStudentBookings, useSubjects, useTutorSearch } from "@/hooks/use-data";
import { useNow } from "@/hooks/use-now";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { fadeUp, stagger } from "@/lib/motion";
import { HomeSearch } from "./home-search";

function HomeHeader() {
  const { t, l } = useI18n();
  const { session } = useSession();
  const { data: notifications = [] } = useNotifications();
  const unread = notifications.filter((n) => !n.readAt).length;
  const now = useNow();
  const greeting = now === null ? t.home.guest : new Date(now).getHours() < 17 ? t.home.greetingMorning : t.home.greetingEvening;

  return (
    <header className="flex items-center justify-between px-5 pt-5">
      <div className="flex items-center gap-3">
        {session ? (
          <AppLink href="/profile">
            <Avatar name={l(session.user.displayName)} hue={session.user.avatarHue} size="md" />
          </AppLink>
        ) : (
          <LogoMark className="size-11" animated />
        )}
        <div>
          <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-[13px] text-ink-500">
            {session ? greeting : t.home.guest}
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="text-lg leading-tight font-extrabold"
          >
            {session ? l(session.user.displayName).split(" ")[0] : t.common.appName}
            <motion.span
              className="ms-1 inline-block origin-bottom"
              animate={{ rotate: [0, 18, -8, 14, 0] }}
              transition={{ duration: 1.4, delay: 0.6 }}
            >
              👋
            </motion.span>
          </motion.p>
        </div>
      </div>
      {session ? (
        <AppLink
          href="/notifications"
          className="relative grid size-11 place-items-center rounded-full bg-white shadow-card"
          aria-label={t.nav.notifications}
        >
          <motion.span
            animate={unread ? { rotate: [0, -16, 14, -10, 8, 0] } : undefined}
            transition={{ duration: 0.9, delay: 0.8, repeat: unread ? Infinity : 0, repeatDelay: 5 }}
          >
            <Bell className="size-5 text-ink-700" aria-hidden />
          </motion.span>
          {unread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute end-2 top-2 size-2.5 rounded-full border-2 border-white bg-coral-500"
            />
          )}
        </AppLink>
      ) : (
        <AppLink href="/auth/sign-in">
          <Button variant="outline" size="sm">
            {t.auth.signIn}
          </Button>
        </AppLink>
      )}
    </header>
  );
}

function Hero() {
  const { t, locale } = useI18n();
  return (
    <section className="px-5 pt-6">
      <motion.div variants={stagger(0.08)} initial="hidden" animate="show">
        <motion.h1 variants={fadeUp} className="text-[28px] leading-[1.25] font-extrabold tracking-tight text-balance">
          {t.home.heroTitle}
        </motion.h1>
        <motion.p variants={fadeUp} className="mt-2 text-[15px] text-ink-600">
          {t.home.heroSubtitle}
        </motion.p>
        <motion.div variants={fadeUp} className="mt-5">
          <HomeSearch />
        </motion.div>
      </motion.div>
      <div className="mt-2">
        <HeroIllustration
          lessonLabel={t.tutor.book}
          tutorName={locale === "ar" ? "د. يوسف — التحليل" : "Dr. Youssef — Calculus"}
        />
      </div>
    </section>
  );
}

function Categories() {
  const { t } = useI18n();
  return (
    <section className="px-5 pt-4">
      <SectionHeader title={t.home.categories} />
      <motion.ul
        variants={stagger(0.05)}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-60px" }}
        className="grid grid-cols-4 gap-3"
      >
        {SUBJECT_CATEGORIES.map((c) => {
          const Icon = categoryIcons[c];
          return (
            <motion.li key={c} variants={fadeUp}>
              <AppLink href={`/tutors?category=${c}`} className="group flex flex-col items-center gap-2 text-center">
                <motion.span
                  whileHover={{ y: -4, rotate: -4 }}
                  whileTap={{ scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  className={`grid size-15 place-items-center rounded-[20px] bg-gradient-to-br shadow-card ${categoryColors[c]}`}
                >
                  <Icon className="size-6" aria-hidden />
                </motion.span>
                <span className="line-clamp-2 text-[12px] leading-tight font-medium text-ink-700">{t.categories[c]}</span>
              </AppLink>
            </motion.li>
          );
        })}
      </motion.ul>
    </section>
  );
}

function UpcomingLesson() {
  const { t } = useI18n();
  const { session, role } = useSession();
  const { data } = useStudentBookings();
  if (!session || role !== "student") return null;
  const next = data?.filter((b) => b.status === "confirmed" && isUpcoming(b))[0];
  if (!next) return null;
  return (
    <section className="px-5 pt-2">
      <SectionHeader
        title={t.home.upcomingTitle}
        action={
          <AppLink href="/lessons" className="text-sm font-semibold text-brand-600">
            {t.common.seeAll}
          </AppLink>
        }
      />
      <AppLink href="/lessons" className="block">
        <LessonCard booking={next} highlight />
      </AppLink>
    </section>
  );
}

function Featured() {
  const { t } = useI18n();
  const { data, isLoading } = useFeaturedTutors();
  return (
    <section className="pt-8">
      <SectionHeader
        className="px-5"
        title={t.home.featured}
        action={
          <AppLink href="/tutors" className="flex items-center gap-0.5 text-sm font-semibold text-brand-600">
            {t.common.seeAll}
            <ForwardChevron className="size-4" />
          </AppLink>
        }
      />
      <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-5 px-5 pt-1 pb-4">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <TutorTileSkeleton key={i} />)
          : data?.map((tutor, i) => (
              <motion.div
                key={tutor.id}
                initial={{ opacity: 0, x: 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ type: "spring", stiffness: 260, damping: 26, delay: i * 0.06 }}
              >
                <TutorTile tutor={tutor} />
              </motion.div>
            ))}
      </div>
    </section>
  );
}

function Stats() {
  const { t, number } = useI18n();
  const { data: tutors } = useTutorSearch({});
  const { data: subjects } = useSubjects();
  const avg = tutors?.length ? tutors.reduce((s, x) => s + x.rating, 0) / tutors.length : 0;
  const items = [
    { icon: Users, value: tutors?.length ?? 0, label: t.home.stats.tutors, format: (n: number) => number(Math.round(n)) },
    { icon: CalendarCheck, value: subjects?.length ?? 0, label: t.home.stats.subjects, format: (n: number) => number(Math.round(n)) },
    { icon: Star, value: avg, label: t.home.stats.rating, format: (n: number) => n.toFixed(1) },
  ];
  return (
    <section className="px-5 pt-4">
      <Card className="grid grid-cols-3 divide-x divide-ink-100 py-4 rtl:divide-x-reverse">
        {items.map(({ icon: Icon, value, label, format }) => (
          <div key={label} className="flex flex-col items-center gap-1">
            <Icon className="size-4 text-brand-500" aria-hidden />
            <AnimatedNumber value={value} format={format} className="text-xl font-extrabold" />
            <span className="text-[12px] text-ink-500">{label}</span>
          </div>
        ))}
      </Card>
    </section>
  );
}

function TopRated() {
  const { t } = useI18n();
  const { data, isLoading } = useTutorSearch({ sort: "rating" });
  return (
    <section className="px-5 pt-8">
      <SectionHeader title={t.home.topRated} />
      <div className="space-y-3">
        {isLoading
          ? Array.from({ length: 2 }).map((_, i) => <TutorCardSkeleton key={i} />)
          : data?.slice(0, 4).map((tutor) => (
              <motion.div
                key={tutor.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
              >
                <TutorCard tutor={tutor} />
              </motion.div>
            ))}
      </div>
    </section>
  );
}

function HowItWorks() {
  const { t } = useI18n();
  const icons = [Search, CalendarCheck, Sparkles];
  return (
    <section className="px-5 pt-10">
      <SectionHeader title={t.home.howItWorks} />
      <Card className="relative p-5">
        <motion.span
          className="absolute start-[39px] top-12 bottom-12 w-0.5 origin-top bg-gradient-to-b from-brand-300 to-accent-300"
          initial={{ scaleY: 0 }}
          whileInView={{ scaleY: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
          aria-hidden
        />
        <ol className="space-y-6">
          {t.home.steps.map((step, i) => {
            const Icon = icons[i];
            return (
              <motion.li
                key={step.title}
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 + i * 0.15, type: "spring", stiffness: 260, damping: 24 }}
                className="relative flex gap-4"
              >
                <span className="relative grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-600 text-white shadow-float">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="font-bold">
                    <span className="me-1.5 text-brand-500">{i + 1}.</span>
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-500">{step.body}</p>
                </div>
              </motion.li>
            );
          })}
        </ol>
      </Card>
    </section>
  );
}

function BecomeTutor() {
  const { t } = useI18n();
  const roles = useRoleSwitch();
  const { role } = useSession();
  if (role === "tutor") return null;
  return (
    <section className="px-5 pt-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="relative overflow-hidden rounded-[28px] bg-ink-900 p-6 text-white"
      >
        <motion.div
          className="absolute -end-10 -top-10 size-40 rounded-full bg-brand-500/50 blur-2xl"
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 6, repeat: Infinity }}
          aria-hidden
        />
        <motion.div
          className="absolute -start-8 -bottom-12 size-36 rounded-full bg-accent-400/30 blur-2xl"
          animate={{ scale: [1.1, 0.9, 1.1] }}
          transition={{ duration: 7, repeat: Infinity }}
          aria-hidden
        />
        <div className="relative">
          <p className="text-xl font-extrabold">{t.home.becomeTutorTitle}</p>
          <p className="mt-1.5 text-sm text-white/70">{t.home.becomeTutorBody}</p>
          {roles.available && (
            <Button
              variant="accent"
              className="mt-5"
              loading={roles.pending === "tutor"}
              onClick={() => roles.switchTo("tutor")}
            >
              {t.home.becomeTutorCta}
              <ForwardChevron className="size-4" />
            </Button>
          )}
        </div>
      </motion.div>
    </section>
  );
}

export function HomeScreen() {
  return (
    <Screen>
      <HomeHeader />
      <Hero />
      <UpcomingLesson />
      <Categories />
      <Featured />
      <Stats />
      <TopRated />
      <HowItWorks />
      <BecomeTutor />
    </Screen>
  );
}
