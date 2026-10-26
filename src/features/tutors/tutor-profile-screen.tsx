"use client";

import { AnimatePresence, motion } from "motion/react";
import { Award, Clock, GraduationCap, Languages, Lock, MapPin, MessageCircle, Share2, UserX, Video, Zap } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { AppLink } from "@/components/layout/app-link";
import { Screen, TopBar } from "@/components/layout/screen";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AnimatedNumber } from "@/components/ui/data-viz";
import { EmptyState } from "@/components/ui/empty-state";
import { HeartButton } from "@/components/ui/heart-button";
import { Badge, Card, Chip, SectionHeader, Skeleton, Stars } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { brand } from "@/config/app-config";
import type { TutorProfile } from "@/domain/types";
import { useAvailableSlots, useOpenConversation, useTutor, useTutorReviews } from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";
import { useFavoriteToggle, useSubjectMap, VerifiedBadge } from "./shared";

function ProfileSkeleton() {
  return (
    <div className="px-5">
      <div className="flex flex-col items-center pt-6">
        <Skeleton className="size-24 rounded-full" />
        <Skeleton className="mt-4 h-6 w-40" />
        <Skeleton className="mt-2 h-4 w-56" />
      </div>
      <Skeleton className="mt-6 h-20 w-full rounded-3xl" />
      <Skeleton className="mt-4 h-40 w-full rounded-3xl" />
    </div>
  );
}

function Hero({ tutor }: { tutor: TutorProfile }) {
  const { t, l } = useI18n();
  return (
    <div className="relative px-5 pb-2 text-center">
      <motion.div
        className="absolute inset-x-0 -top-16 -z-10 h-56"
        style={{
          background: `radial-gradient(circle at 50% 30%, hsl(${tutor.avatarHue} 90% 86%), transparent 70%)`,
        }}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.8 }}
        aria-hidden
      />
      <motion.div
        initial={{ scale: 0.6, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 18 }}
        className="inline-block rounded-full bg-white p-1.5 shadow-card"
      >
        <Avatar name={l(tutor.displayName)} hue={tutor.avatarHue} src={tutor.avatarUrl} size="xl" online={tutor.responseTimeMinutes <= 15} />
      </motion.div>
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <h1 className="mt-3 flex items-center justify-center gap-1.5 text-2xl font-extrabold">
          {l(tutor.displayName)}
          {tutor.verification === "verified" && <VerifiedBadge className="size-6" />}
        </h1>
        <p className="mt-1 text-[15px] text-ink-600">{l(tutor.headline)}</p>
        <div className="mt-2.5 flex flex-wrap items-center justify-center gap-2 text-[13px] text-ink-500">
          <span className="inline-flex items-center gap-1">
            <GraduationCap className="size-4" aria-hidden /> {l(tutor.university)}
          </span>
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-4" aria-hidden /> {l(tutor.city)}
          </span>
        </div>
        <div className="mt-3 flex justify-center gap-2">
          {tutor.instantBook && (
            <Badge tone="accent">
              <Zap className="size-3 fill-accent-400" aria-hidden /> {t.search.instant}
            </Badge>
          )}
          {tutor.isDemo && <Badge tone="ink">{t.demo.demoAccount}</Badge>}
        </div>
      </motion.div>
    </div>
  );
}

function StatsRow({ tutor }: { tutor: TutorProfile }) {
  const { t, number, plural } = useI18n();
  const stats = [
    { value: tutor.rating, format: (n: number) => n.toFixed(1), label: plural(t.tutor.reviewsCount, tutor.reviewCount) },
    { value: tutor.lessonsCompleted, format: (n: number) => number(Math.round(n)), label: t.tutor.lessons },
    { value: tutor.yearsExperience, format: (n: number) => number(Math.round(n)), label: t.tutor.experience },
    { value: tutor.responseTimeMinutes, format: (n: number) => `${Math.round(n)}${t.common.minutes}`, label: t.tutor.responseTime },
  ];
  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="px-5 pt-4">
      <Card className="grid grid-cols-4 py-4">
        {stats.map((s, i) => (
          <div key={i} className={cn("flex flex-col items-center px-1 text-center", i > 0 && "border-s border-ink-100")}>
            <AnimatedNumber value={s.value} format={s.format} className="text-lg font-extrabold" />
            <span className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-ink-500">{s.label}</span>
          </div>
        ))}
      </Card>
    </motion.div>
  );
}

function About({ tutor }: { tutor: TutorProfile }) {
  const { t, l } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const bio = l(tutor.bio);
  const long = bio.length > 160;
  return (
    <section className="px-5 pt-6">
      <SectionHeader title={t.tutor.about} />
      <Card className="p-4">
        <motion.p layout className={cn("text-[15px] leading-relaxed text-ink-700", !expanded && long && "line-clamp-3")}>
          {bio}
        </motion.p>
        {long && (
          <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-2 text-sm font-semibold text-brand-600">
            {expanded ? t.common.readLess : t.common.readMore}
          </button>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-100 pt-4 text-sm">
          <div>
            <p className="flex items-center gap-1.5 text-[12px] text-ink-500">
              <Languages className="size-3.5" aria-hidden /> {t.tutor.languages}
            </p>
            <p className="mt-1 font-semibold">{tutor.languages.map((x) => t.languagesSpoken[x]).join(" · ")}</p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-[12px] text-ink-500">
              <Video className="size-3.5" aria-hidden /> {t.tutor.modes}
            </p>
            <p className="mt-1 font-semibold">
              {tutor.modes.map((m) => (m === "online" ? t.common.online : t.common.inPerson)).join(" · ")}
            </p>
          </div>
        </div>
      </Card>
    </section>
  );
}

/** Qualifications, levels taught and experience, so students can judge fit before paying. */
function Credentials({ tutor }: { tutor: TutorProfile }) {
  const { t, l, fmt, number } = useI18n();
  return (
    <section className="px-5 pt-6">
      <SectionHeader title={t.tutor.qualifications} />
      <Card className="p-4">
        <ul className="space-y-2.5">
          {tutor.qualifications.map((q, i) => (
            <li key={i} className="flex gap-2.5 text-[14px] text-ink-700">
              <Award className="mt-0.5 size-4 shrink-0 text-brand-600" />
              {l(q)}
            </li>
          ))}
          <li className="flex gap-2.5 text-[14px] text-ink-700">
            <GraduationCap className="mt-0.5 size-4 shrink-0 text-brand-600" />
            {fmt(t.tutor.experienceYears, { n: number(tutor.yearsExperience) })}
          </li>
        </ul>
        <div className="mt-4 border-t border-ink-100 pt-4">
          <p className="mb-2 text-[12px] text-ink-500">{t.tutor.gradeLevels}</p>
          <div className="flex flex-wrap gap-1.5">
            {tutor.gradeLevels.map((g) => (
              <Badge key={g} tone="brand">
                {t.tutor.gradeLevelNames[g]}
              </Badge>
            ))}
          </div>
        </div>
      </Card>
    </section>
  );
}

/** Invites questions before booking and explains that contact details come after payment. */
function AskFirst({ tutor }: { tutor: TutorProfile }) {
  const { t } = useI18n();
  const { ask: onAsk, loading } = useAskTutor(tutor);
  return (
    <section className="px-5 pt-6">
      <Card className="flex items-start gap-3 p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
          <Lock className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-ink-600">{t.tutor.askHint}</p>
          <Button size="sm" variant="secondary" className="mt-3" loading={loading} onClick={onAsk}>
            <MessageCircle className="size-4" /> {t.tutor.askQuestion}
          </Button>
        </div>
      </Card>
    </section>
  );
}

function Subjects({ tutor, selected, onSelect }: { tutor: TutorProfile; selected?: string; onSelect: (id: string) => void }) {
  const { t, l } = useI18n();
  const subjects = useSubjectMap();
  return (
    <section className="px-5 pt-6">
      <SectionHeader title={t.tutor.subjects} />
      <p className="-mt-2 mb-3 text-[13px] text-ink-500">{t.tutor.pickSubject}</p>
      <div className="flex flex-wrap gap-2">
        {tutor.subjectIds.map((id) => {
          const s = subjects.get(id);
          if (!s) return null;
          return (
            <Chip key={id} selected={selected === id} onClick={() => onSelect(id)}>
              {l(s.name)}
            </Chip>
          );
        })}
      </div>
    </section>
  );
}

function AvailabilityPreview({ tutor, subjectId }: { tutor: TutorProfile; subjectId?: string }) {
  const { t, weekday, shortDate, time } = useI18n();
  const { data, isLoading } = useAvailableSlots(tutor.id, 60, 7);
  const days = (data ?? []).map((d) => ({ ...d, slots: d.slots.filter((s) => s.available) })).filter((d) => d.slots.length).slice(0, 4);
  return (
    <section className="px-5 pt-6">
      <SectionHeader title={t.tutor.availability} />
      {isLoading ? (
        <div className="flex gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32 flex-1 rounded-3xl" />
          ))}
        </div>
      ) : days.length === 0 ? (
        <Card className="p-4 text-center text-sm text-ink-500">{t.tutor.noSlots}</Card>
      ) : (
        <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-2">
          {days.map((day, i) => (
            <motion.div
              key={day.date}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07 }}
            >
              <Card className="w-32 shrink-0 p-3">
                <p className="text-[13px] font-bold">{weekday(day.slots[0].startsAt)}</p>
                <p className="text-[12px] text-ink-500">{shortDate(day.slots[0].startsAt)}</p>
                <div className="mt-2.5 space-y-1.5">
                  {day.slots.slice(0, 3).map((slot) => (
                    <AppLink
                      key={slot.startsAt}
                      href={`/book/${tutor.id}?start=${encodeURIComponent(slot.startsAt)}${subjectId ? `&subject=${subjectId}` : ""}`}
                      className="block rounded-xl bg-brand-50 py-1.5 text-center text-[13px] font-semibold text-brand-700 transition-colors hover:bg-brand-600 hover:text-white"
                    >
                      {time(slot.startsAt)}
                    </AppLink>
                  ))}
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}

function Reviews({ tutor }: { tutor: TutorProfile }) {
  const { t, l, plural, relative } = useI18n();
  const subjects = useSubjectMap();
  const { data, isLoading } = useTutorReviews(tutor.id);
  return (
    <section className="px-5 pt-6">
      <SectionHeader
        title={t.tutor.reviews}
        action={
          <span className="flex items-center gap-1.5 text-sm font-semibold text-ink-600">
            <Stars value={tutor.rating} /> {plural(t.tutor.reviewsCount, tutor.reviewCount)}
          </span>
        }
      />
      <div className="space-y-3">
        {isLoading
          ? [0, 1].map((i) => <Skeleton key={i} className="h-28 rounded-3xl" />)
          : data?.map((r, i) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={l(r.authorName)} hue={r.authorHue} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{l(r.authorName)}</p>
                      <p className="truncate text-[12px] text-ink-500">
                        {r.subjectId && l(subjects.get(r.subjectId)?.name)} · {relative(r.createdAt)}
                      </p>
                    </div>
                    <Stars value={r.rating} />
                  </div>
                  {l(r.comment) && <p className="mt-3 text-[14px] leading-relaxed text-ink-700">{l(r.comment)}</p>}
                </Card>
              </motion.div>
            ))}
      </div>
    </section>
  );
}

/** Opens (or creates) the pre-booking conversation with this tutor. */
function useAskTutor(tutor: TutorProfile) {
  const { t, href } = useI18n();
  const { session } = useSession();
  const router = useRouter();
  const toast = useToast();
  const open = useOpenConversation();
  const ask = () => {
    if (!session) {
      toast.info(t.messages.signInToChat);
      router.push(href(`/auth/sign-up?next=${encodeURIComponent(`/tutors/${tutor.id}`)}`));
      return;
    }
    open.mutate(tutor.id, {
      onSuccess: (c) => router.push(href(`/messages/${c.id}`)),
      onError: () => toast.error(t.common.somethingWrong),
    });
  };
  return { ask, loading: open.isPending };
}

function BookingBar({ tutor, subjectId }: { tutor: TutorProfile; subjectId?: string }) {
  const { t, money } = useI18n();
  const { session, role } = useSession();
  const { ask: message, loading } = useAskTutor(tutor);
  const isOwnProfile = session?.tutorId === tutor.id;

  return (
    <motion.div
      initial={{ y: 120 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 30, delay: 0.3 }}
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[var(--app-max-width)] px-3 pb-3"
    >
      <div className="flex items-center gap-3 rounded-[26px] border border-white/60 bg-white/92 p-3 shadow-nav backdrop-blur-xl">
        <div className="ps-2">
          <p className="text-[11px] text-ink-500">{t.tutor.from}</p>
          <p className="text-lg leading-tight font-extrabold">
            {money(tutor.hourlyRate, { compact: true })}
            <span className="ms-1 text-[12px] font-medium text-ink-500">{t.common.perHour}</span>
          </p>
        </div>
        <div className="ms-auto flex gap-2">
          {!isOwnProfile && (
            <Button variant="secondary" size="icon" onClick={message} loading={loading} aria-label={t.tutor.message}>
              <MessageCircle className="size-5" />
            </Button>
          )}
          <AppLink href={`/book/${tutor.id}${subjectId ? `?subject=${subjectId}` : ""}`} aria-disabled={isOwnProfile || role === "tutor"}>
            <Button size="lg" className="h-12 px-6" disabled={isOwnProfile}>
              {t.tutor.book}
            </Button>
          </AppLink>
        </div>
      </div>
    </motion.div>
  );
}

export function TutorProfileScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const toast = useToast();
  const { data: tutor, isLoading } = useTutor(id);
  const { session, role } = useSession();
  const fav = useFavoriteToggle();
  const [subjectId, setSubjectId] = useState<string>();

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: brand.name.en, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success(t.common.copied);
      }
    } catch {
      // User cancelled the share sheet.
    }
  };

  return (
    <Screen variant="push" className="pb-32" withNav={false}>
      <TopBar
        transparent
        backHref="/tutors"
        actions={
          tutor && (
            <>
              <motion.button
                type="button"
                whileTap={{ scale: 0.88 }}
                onClick={share}
                className="grid size-11 place-items-center rounded-full bg-white text-ink-700 shadow-card"
                aria-label={t.tutor.share}
              >
                <Share2 className="size-5" />
              </motion.button>
              <HeartButton
                active={fav.isFavorite(tutor.id)}
                onToggle={() => fav.toggle(tutor.id)}
                label={fav.isFavorite(tutor.id) ? t.tutor.unfavorite : t.tutor.favorite}
              />
            </>
          )
        }
      />
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div key="loading" exit={{ opacity: 0 }}>
            <ProfileSkeleton />
          </motion.div>
        ) : !tutor ? (
          <EmptyState key="missing" icon={<UserX />} title={t.tutor.notFound} />
        ) : (
          <motion.div key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Hero tutor={tutor} />
            <StatsRow tutor={tutor} />
            <Subjects tutor={tutor} selected={subjectId} onSelect={(sid) => setSubjectId((cur) => (cur === sid ? undefined : sid))} />
            <About tutor={tutor} />
            <Credentials tutor={tutor} />
            {session?.tutorId !== tutor.id && role !== "tutor" && <AskFirst tutor={tutor} />}
            <AvailabilityPreview tutor={tutor} subjectId={subjectId} />
            <Reviews tutor={tutor} />
            <p className="flex items-center justify-center gap-1.5 px-5 pt-6 text-center text-[12px] text-ink-500">
              <Clock className="size-3.5" aria-hidden />
              {tutor.instantBook ? t.tutor.instantHint : t.tutor.requestHint}
            </p>
            <BookingBar tutor={tutor} subjectId={subjectId} />
          </motion.div>
        )}
      </AnimatePresence>
    </Screen>
  );
}
