import type { TutorDashboardService } from "../contracts";
import { toMinor } from "@/domain/money";
import { ServiceError } from "../errors";
import { latency, mockDb } from "./mock-db";
import { completeFinishedLessons } from "./mock-bookings";

export const mockDashboardService: TutorDashboardService = {
  async getStats(actorUserId, tutorId) {
    await latency(400, 800);
    mockDb.mutate((s) => completeFinishedLessons(s));
    const s = mockDb.data;
    const tutor = s.tutors.find((t) => t.id === tutorId);
    if (!tutor) throw new ServiceError("not_found");
    if (tutor.userId !== actorUserId) throw new ServiceError("forbidden");

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).getTime();
    const weekEnd = weekStart + 7 * 86_400_000;

    const mine = s.bookings.filter((b) => b.tutorId === tutorId);
    const earned = (from: number, to: number) =>
      mine
        .filter((b) => {
          const t = new Date(b.startsAt).getTime();
          return (b.status === "completed" || b.status === "confirmed") && t >= from && t < to;
        })
        .reduce((sum, b) => sum + b.pricing.tutorEarnings.amountMinor, 0);

    const weeklyLessons = [0, 0, 0, 0, 0, 0, 0];
    for (const b of mine) {
      const t = new Date(b.startsAt).getTime();
      if (t >= weekStart && t < weekEnd && b.status !== "cancelled" && b.status !== "declined") {
        weeklyLessons[new Date(t).getDay()] += 1;
      }
    }
    // A little baseline so the demo chart never looks empty.
    const baseline = [1, 2, 1, 3, 2, 0, 2];
    const chart = weeklyLessons.map((n, i) => n + baseline[i]);

    return {
      earningsThisMonth: { currency: tutor.hourlyRate.currency, amountMinor: earned(monthStart, Number.MAX_SAFE_INTEGER) + toMinor(620, tutor.hourlyRate.currency) },
      earningsLastMonth: { currency: tutor.hourlyRate.currency, amountMinor: earned(lastMonthStart, monthStart) + toMinor(780, tutor.hourlyRate.currency) },
      lessonsThisMonth: mine.filter((b) => new Date(b.startsAt).getTime() >= monthStart && b.status !== "cancelled" && b.status !== "declined").length + 14,
      upcomingCount: mine.filter((b) => b.status === "confirmed" && new Date(b.startsAt) > now).length,
      pendingCount: mine.filter((b) => b.status === "pending").length,
      averageRating: tutor.rating,
      reviewCount: tutor.reviewCount,
      responseRate: 98,
      profileViews: s.profileViews[tutorId] ?? 0,
      profileCompleteness: 85,
      weeklyLessons: chart,
    };
  },
};
