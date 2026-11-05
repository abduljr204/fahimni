import type { AdminOverview, PlatformSettings, Review, Subject, TutorProfile, TutorStats } from "@/domain/types";
import { matchesFilters, sortTutors } from "@/domain/tutor-search";
import { availabilitySchema, hourlyRateSchema, platformSettingsSchema, reviewSchema } from "@/domain/validation";
import type { FavoritesService, PlatformService, ReviewRepository, SubjectRepository, TutorDashboardService, TutorRepository } from "../contracts";
import { parseInput } from "../errors";
import { call } from "./client";

export const getSettings = () => call<PlatformSettings>("get_settings");

export const supabaseSubjectRepository: SubjectRepository = {
  list: () => call<Subject[]>("list_subjects"),
};

export const supabaseTutorRepository: TutorRepository = {
  async search(filters) {
    const [tutors, subjects] = await Promise.all([call<TutorProfile[]>("search_tutors"), supabaseSubjectRepository.list()]);
    return sortTutors(tutors.filter((t) => matchesFilters(t, filters, subjects)), filters.sort);
  },

  getById: (id) => call<TutorProfile | null>("get_tutor", { p_tutor: id }),

  async listFeatured(limit = 6) {
    const tutors = await call<TutorProfile[]>("search_tutors");
    return sortTutors(tutors.filter((t) => t.verification === "verified")).slice(0, limit);
  },

  updateAvailability(_actor, tutorId, patch) {
    return call<TutorProfile>("update_availability", {
      p_tutor: tutorId,
      p_windows: parseInput(availabilitySchema, patch.availability),
      p_instant: patch.instantBook,
    });
  },

  updateHourlyRate(_actor, tutorId, raw) {
    return call<TutorProfile>("update_hourly_rate", { p_tutor: tutorId, p_amount_minor: parseInput(hourlyRateSchema, raw).amountMinor });
  },
};

export const supabaseReviewRepository: ReviewRepository = {
  listForTutor: (tutorId, limit = 10) => call<Review[]>("list_reviews", { p_tutor: tutorId, p_limit: limit }),

  create(_actor, raw) {
    const input = parseInput(reviewSchema, raw);
    return call<Review>("submit_review", { p_booking: input.bookingId, p_rating: input.rating, p_comment: input.comment ?? null });
  },
};

export const supabaseFavoritesService: FavoritesService = {
  list: () => call<string[]>("list_favorites"),
  toggle: (_user, tutorId) => call<boolean>("toggle_favorite", { p_tutor: tutorId }),
};

export const supabaseDashboardService: TutorDashboardService = {
  getStats: (_actor, tutorId) => call<TutorStats>("tutor_stats", { p_tutor: tutorId }),
};

export const supabasePlatformService: PlatformService = {
  getSettings,

  updateSettings(_actor, raw) {
    const input = parseInput(platformSettingsSchema, raw);
    return call<PlatformSettings>("update_settings", {
      p_commission_bps: input.commissionBps,
      p_min_rate: input.minHourlyRateMinor,
      p_max_rate: input.maxHourlyRateMinor,
      p_options: input.inPersonPaymentOptions,
      p_opens_before: input.classroomOpensMinutesBefore,
      p_closes_after: input.classroomClosesMinutesAfter,
    });
  },

  getOverview: () => call<AdminOverview>("admin_overview"),
};
