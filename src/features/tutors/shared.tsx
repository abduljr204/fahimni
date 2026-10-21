"use client";

import { motion } from "motion/react";
import { Atom, BadgeCheck, ChartColumn, Code2, Cog, Languages, MapPin, Scale, Sigma, Stethoscope, Video, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { AppLink } from "@/components/layout/app-link";
import { Avatar } from "@/components/ui/avatar";
import { HeartButton } from "@/components/ui/heart-button";
import { Badge, Card, RatingPill, Skeleton } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import type { Subject, SubjectCategory, TutorProfile } from "@/domain/types";
import { useFavorites, useSubjects, useToggleFavorite } from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";

export const categoryIcons: Record<SubjectCategory, LucideIcon> = {
  math: Sigma,
  science: Atom,
  engineering: Cog,
  medicine: Stethoscope,
  it: Code2,
  business: ChartColumn,
  languages: Languages,
  law: Scale,
};

export const categoryColors: Record<SubjectCategory, string> = {
  math: "from-accent-300 to-accent-400 text-ink-900",
  science: "from-brand-400 to-brand-600 text-white",
  engineering: "from-[#60a5fa] to-[#2563eb] text-white",
  medicine: "from-mint-400 to-mint-600 text-white",
  it: "from-ink-700 to-ink-900 text-white",
  business: "from-[#fb923c] to-[#ea580c] text-white",
  languages: "from-coral-400 to-coral-600 text-white",
  law: "from-[#a78bfa] to-[#7c3aed] text-white",
};

export function useSubjectMap(): Map<string, Subject> {
  const { data } = useSubjects();
  return useMemo(() => new Map((data ?? []).map((s) => [s.id, s])), [data]);
}

/** Favourite state + toggle that sends guests to sign-up. */
export function useFavoriteToggle() {
  const { session } = useSession();
  const { data: favorites = [] } = useFavorites();
  const toggle = useToggleFavorite();
  const toast = useToast();
  const router = useRouter();
  const { t, href } = useI18n();

  return {
    isFavorite: (id: string) => favorites.includes(id),
    toggle: (id: string) => {
      if (!session) {
        toast.info(t.booking.signInTitle);
        router.push(href("/auth/sign-up"));
        return;
      }
      const wasFavorite = favorites.includes(id);
      toggle.mutate(id, {
        onSuccess: () => toast.success(wasFavorite ? t.tutor.favoriteRemoved : t.tutor.favoriteAdded),
      });
    },
  };
}

export function VerifiedBadge({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <BadgeCheck className={cn("size-[18px] shrink-0 fill-brand-500 text-white", className)} aria-label={t.common.verified} />
  );
}

/** Full-width tutor card used in search results and lists. */
export function TutorCard({ tutor, index = 0 }: { tutor: TutorProfile; index?: number }) {
  const { t, l, money, plural } = useI18n();
  const subjects = useSubjectMap();
  const fav = useFavoriteToggle();
  const names = tutor.subjectIds.map((id) => subjects.get(id)).filter(Boolean) as Subject[];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.18 } }}
      transition={{ type: "spring", stiffness: 300, damping: 28, delay: Math.min(index, 8) * 0.04 }}
    >
      <AppLink href={`/tutors/${tutor.id}`} className="block">
        <motion.div whileTap={{ scale: 0.98 }} whileHover={{ y: -2 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
          <Card className="relative p-4 transition-shadow hover:shadow-[0_14px_36px_-16px_rgb(24_22_58/0.25)]">
            <div className="flex gap-3.5">
              <Avatar name={l(tutor.displayName)} hue={tutor.avatarHue} src={tutor.avatarUrl} size="lg" online={tutor.responseTimeMinutes <= 15} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 pe-10">
                  <h3 className="truncate text-[15px] font-bold">{l(tutor.displayName)}</h3>
                  {tutor.verification === "verified" && <VerifiedBadge />}
                </div>
                <p className="mt-0.5 line-clamp-1 text-[13px] text-ink-500">{l(tutor.headline)}</p>
                <div className="mt-2 flex items-center gap-3">
                  <RatingPill rating={tutor.rating} count={plural(t.tutor.reviewsCount, tutor.reviewCount)} className="text-[13px]" />
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {names.slice(0, 2).map((s) => (
                <Badge key={s.id} tone="ink" className="font-medium">
                  {l(s.name)}
                </Badge>
              ))}
              {names.length > 2 && <Badge tone="ink">+{names.length - 2}</Badge>}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-ink-100 pt-3">
              <div className="flex items-center gap-2 text-[12px] text-ink-500">
                {tutor.modes.includes("online") && (
                  <span className="inline-flex items-center gap-1">
                    <Video className="size-3.5" aria-hidden /> {t.common.online}
                  </span>
                )}
                {tutor.modes.includes("in_person") && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="size-3.5" aria-hidden /> {l(tutor.city)}
                  </span>
                )}
                {tutor.instantBook && (
                  <span className="inline-flex items-center gap-0.5 font-semibold text-accent-600">
                    <Zap className="size-3.5 fill-accent-400 text-accent-500" aria-hidden />
                  </span>
                )}
              </div>
              <p className="text-[15px] font-extrabold text-ink-900">
                {money(tutor.hourlyRate, { compact: true })}
                <span className="ms-1 text-[12px] font-medium text-ink-500">{t.common.perHour}</span>
              </p>
            </div>
            <HeartButton
              size="sm"
              className="absolute end-3 top-3"
              active={fav.isFavorite(tutor.id)}
              onToggle={() => fav.toggle(tutor.id)}
              label={fav.isFavorite(tutor.id) ? t.tutor.unfavorite : t.tutor.favorite}
            />
          </Card>
        </motion.div>
      </AppLink>
    </motion.div>
  );
}

/** Compact vertical card for horizontal carousels. */
export function TutorTile({ tutor }: { tutor: TutorProfile }) {
  const { t, l, money } = useI18n();
  const subjects = useSubjectMap();
  const fav = useFavoriteToggle();
  const first = subjects.get(tutor.subjectIds[0]);

  return (
    <AppLink href={`/tutors/${tutor.id}`} className="block w-[188px] shrink-0 snap-start">
      <motion.div whileTap={{ scale: 0.97 }} whileHover={{ y: -3 }} transition={{ type: "spring", stiffness: 400, damping: 25 }}>
        <Card className="relative overflow-hidden p-0">
          <div
            className="relative grid h-28 place-items-center"
            style={{
              background: `linear-gradient(140deg, hsl(${tutor.avatarHue} 90% 92%), hsl(${(tutor.avatarHue + 40) % 360} 80% 84%))`,
            }}
          >
            <Avatar name={l(tutor.displayName)} hue={tutor.avatarHue} src={tutor.avatarUrl} size="lg" className="ring-4 ring-white/70 rounded-full" />
            {tutor.instantBook && (
              <Badge tone="dark" className="absolute start-2.5 top-2.5 gap-0.5 text-[10px]">
                <Zap className="size-3 fill-accent-400 text-accent-400" aria-hidden />
                {t.search.instant}
              </Badge>
            )}
            <HeartButton
              size="sm"
              className="absolute end-2 top-2"
              active={fav.isFavorite(tutor.id)}
              onToggle={() => fav.toggle(tutor.id)}
              label={fav.isFavorite(tutor.id) ? t.tutor.unfavorite : t.tutor.favorite}
            />
          </div>
          <div className="p-3.5">
            <div className="flex items-center gap-1">
              <h3 className="truncate text-sm font-bold">{l(tutor.displayName)}</h3>
              {tutor.verification === "verified" && <VerifiedBadge className="size-4" />}
            </div>
            <p className="mt-0.5 truncate text-[12px] text-ink-500">{first ? l(first.name) : l(tutor.headline)}</p>
            <div className="mt-2.5 flex items-center justify-between">
              <RatingPill rating={tutor.rating} className="text-[13px]" />
              <span className="text-[13px] font-extrabold">{money(tutor.hourlyRate, { compact: true })}</span>
            </div>
          </div>
        </Card>
      </motion.div>
    </AppLink>
  );
}

export function TutorCardSkeleton() {
  return (
    <Card className="p-4">
      <div className="flex gap-3.5">
        <Skeleton className="size-16 rounded-full" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-6 w-24 rounded-full" />
      </div>
      <Skeleton className="mt-4 h-5 w-full" />
    </Card>
  );
}

export function TutorTileSkeleton() {
  return (
    <Card className="w-[188px] shrink-0 overflow-hidden p-0">
      <Skeleton className="h-28 rounded-none" />
      <div className="space-y-2 p-3.5">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-4 w-full" />
      </div>
    </Card>
  );
}
