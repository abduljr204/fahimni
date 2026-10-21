import { availabilitySchema, reviewSchema } from "@/domain/validation";
import type { Review, TutorProfile } from "@/domain/types";
import type {
  FavoritesService,
  ReviewRepository,
  SubjectRepository,
  TutorRepository,
  TutorSearchFilters,
} from "../contracts";
import { parseInput, ServiceError } from "../errors";
import { clone, latency, mockDb, newId } from "./mock-db";
import { pushNotification } from "./mock-notifications";

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

function recommendedScore(t: TutorProfile): number {
  return t.rating * 20 + Math.log10(t.reviewCount + 1) * 10 + (t.verification === "verified" ? 8 : 0) - t.responseTimeMinutes / 30;
}

function matches(tutor: TutorProfile, f: TutorSearchFilters): boolean {
  const { subjects } = mockDb.data;
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

export const mockTutorRepository: TutorRepository = {
  async search(filters) {
    await latency(300, 700);
    const list = mockDb.data.tutors.filter((t) => matches(t, filters));
    const sort = filters.sort ?? "recommended";
    list.sort((a, b) => {
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
    return clone(list);
  },

  async getById(id) {
    await latency(250, 500);
    const tutor = mockDb.data.tutors.find((t) => t.id === id);
    if (tutor) {
      mockDb.mutate((s) => {
        s.profileViews[id] = (s.profileViews[id] ?? 0) + 1;
      });
    }
    return tutor ? clone(tutor) : null;
  },

  async listFeatured(limit = 6) {
    await latency(250, 550);
    return clone(
      [...mockDb.data.tutors]
        .filter((t) => t.verification === "verified")
        .sort((a, b) => recommendedScore(b) - recommendedScore(a))
        .slice(0, limit),
    );
  },

  async updateAvailability(actorUserId, tutorId, patch) {
    const availability = parseInput(availabilitySchema, patch.availability);
    await latency(400, 700);
    return mockDb.mutate((s) => {
      const tutor = s.tutors.find((t) => t.id === tutorId);
      if (!tutor) throw new ServiceError("not_found");
      if (tutor.userId !== actorUserId) throw new ServiceError("forbidden");
      tutor.availability = availability;
      tutor.instantBook = patch.instantBook;
      return clone(tutor);
    });
  },
};

export const mockSubjectRepository: SubjectRepository = {
  async list() {
    return clone(mockDb.data.subjects);
  },
};

export const mockReviewRepository: ReviewRepository = {
  async listForTutor(tutorId, limit = 10) {
    await latency(200, 450);
    return clone(
      mockDb.data.reviews
        .filter((r) => r.tutorId === tutorId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit),
    );
  },

  async create(actorUserId, raw) {
    const input = parseInput(reviewSchema, raw);
    await latency(400, 700);
    return mockDb.mutate((s) => {
      const booking = s.bookings.find((b) => b.id === input.bookingId);
      if (!booking) throw new ServiceError("not_found");
      if (booking.studentId !== actorUserId) throw new ServiceError("forbidden");
      if (booking.status !== "completed" || booking.reviewId) throw new ServiceError("validation");
      const author = s.users.find((u) => u.id === actorUserId)!;
      const tutor = s.tutors.find((t) => t.id === booking.tutorId)!;
      const review: Review = {
        id: newId("r"),
        tutorId: booking.tutorId,
        studentId: actorUserId,
        bookingId: booking.id,
        authorName: author.displayName,
        authorHue: author.avatarHue,
        rating: input.rating,
        comment: input.comment ? { ar: input.comment, en: input.comment } : {},
        subjectId: booking.subjectId,
        createdAt: new Date().toISOString(),
        isDemo: true,
      };
      s.reviews.push(review);
      booking.reviewId = review.id;
      tutor.rating = Math.round(((tutor.rating * tutor.reviewCount + input.rating) / (tutor.reviewCount + 1)) * 10) / 10;
      tutor.reviewCount += 1;
      pushNotification(s, {
        userId: tutor.userId,
        type: "review_received",
        data: { name: author.displayName, subject: s.subjects.find((x) => x.id === booking.subjectId)?.name },
      });
      return clone(review);
    });
  },
};

export const mockFavoritesService: FavoritesService = {
  async list(userId) {
    await latency(100, 250);
    return mockDb.data.favorites.filter((f) => f.userId === userId).map((f) => f.tutorId);
  },

  async toggle(userId, tutorId) {
    await latency(150, 300);
    return mockDb.mutate((s) => {
      const index = s.favorites.findIndex((f) => f.userId === userId && f.tutorId === tutorId);
      if (index >= 0) {
        s.favorites.splice(index, 1);
        return false;
      }
      s.favorites.push({ userId, tutorId });
      return true;
    });
  },
};
