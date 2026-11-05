import { isRateWithinLimits } from "@/domain/pricing";
import { matchesFilters, recommendedScore, sortTutors } from "@/domain/tutor-search";
import { availabilitySchema, hourlyRateSchema, reviewSchema } from "@/domain/validation";
import type { Review } from "@/domain/types";
import type {
  FavoritesService,
  ReviewRepository,
  SubjectRepository,
  TutorRepository,
} from "../contracts";
import { parseInput, ServiceError } from "../errors";
import { clone, latency, mockDb, newId } from "./mock-db";
import { actsForStudent } from "./access";
import { pushNotification } from "./mock-notifications";

export const mockTutorRepository: TutorRepository = {
  async search(filters) {
    await latency(300, 700);
    // Unpublished profiles (awaiting verification, rejected or suspended) never appear in search.
    const list = mockDb.data.tutors.filter((t) => t.published && matchesFilters(t, filters, mockDb.data.subjects));
    return clone(sortTutors(list, filters.sort));
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
        .filter((t) => t.published && t.verification === "verified")
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

  async updateHourlyRate(actorUserId, tutorId, raw) {
    const rate = parseInput(hourlyRateSchema, raw);
    await latency(400, 700);
    return mockDb.mutate((s) => {
      const tutor = s.tutors.find((t) => t.id === tutorId);
      if (!tutor) throw new ServiceError("not_found");
      if (tutor.userId !== actorUserId) throw new ServiceError("forbidden");
      if (!isRateWithinLimits(rate, s.settings)) {
        throw new ServiceError("validation", undefined, { amountMinor: "rateOutOfRange" });
      }
      // Bookings store their own pricing, so existing requests and lessons are unaffected.
      tutor.hourlyRate = rate;
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
      if (!actsForStudent(s, actorUserId, booking.studentId)) throw new ServiceError("forbidden");
      if (booking.status !== "confirmed" || booking.lessonStatus !== "completed" || booking.reviewId) throw new ServiceError("validation");
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
