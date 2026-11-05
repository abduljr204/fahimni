import type { LessonMode, Subject, SubjectCategory, TutorProfile } from "./types";

/**
 * Search rules shared by every backend. They run in the app rather than the database so
 * Arabic text matches the way people type it, with or without diacritics.
 */

export type TutorSort = "recommended" | "rating" | "priceAsc" | "priceDesc";

export interface TutorSearchFilters {
  query?: string;
  category?: SubjectCategory;
  subjectId?: string;
  mode?: LessonMode;
  maxHourlyRateMinor?: number;
  minRating?: number;
  instantOnly?: boolean;
  verifiedOnly?: boolean;
  sort?: TutorSort;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[ً-ٰٟ]/g, "") // Arabic diacritics
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[̀-ͯ]/g, "");
}

export function recommendedScore(t: TutorProfile): number {
  return t.rating * 20 + Math.log10(t.reviewCount + 1) * 10 + (t.verification === "verified" ? 8 : 0) - t.responseTimeMinutes / 30;
}

export function matchesFilters(tutor: TutorProfile, f: TutorSearchFilters, subjects: Subject[]): boolean {
  const tutorSubjects = subjects.filter((s) => tutor.subjectIds.includes(s.id));
  if (f.category && !tutorSubjects.some((s) => s.category === f.category)) return false;
  if (f.subjectId && !tutor.subjectIds.includes(f.subjectId)) return false;
  if (f.mode && !tutor.modes.includes(f.mode)) return false;
  if (f.maxHourlyRateMinor && tutor.hourlyRate.amountMinor > f.maxHourlyRateMinor) return false;
  if (f.minRating && tutor.rating < f.minRating) return false;
  if (f.instantOnly && !tutor.instantBook) return false;
  if (f.verifiedOnly && tutor.verification !== "verified") return false;
  if (f.query?.trim()) {
    const q = normalize(f.query.trim());
    const haystack = normalize(
      [
        ...Object.values(tutor.displayName),
        ...Object.values(tutor.headline),
        ...Object.values(tutor.university),
        ...tutorSubjects.flatMap((s) => Object.values(s.name)),
      ].join(" "),
    );
    if (!q.split(/\s+/).every((word) => haystack.includes(word))) return false;
  }
  return true;
}

export function sortTutors(list: TutorProfile[], sort: TutorSort = "recommended"): TutorProfile[] {
  return list.sort((a, b) => {
    switch (sort) {
      case "rating":
        return b.rating - a.rating || b.reviewCount - a.reviewCount;
      case "priceAsc":
        return a.hourlyRate.amountMinor - b.hourlyRate.amountMinor;
      case "priceDesc":
        return b.hourlyRate.amountMinor - a.hourlyRate.amountMinor;
      default:
        return recommendedScore(b) - recommendedScore(a);
    }
  });
}
