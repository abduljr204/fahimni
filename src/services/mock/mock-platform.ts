import { brand } from "@/config/app-config";
import type { AdminOverview, Money } from "@/domain/types";
import { platformSettingsSchema } from "@/domain/validation";
import type { PlatformService } from "../contracts";
import { parseInput, ServiceError } from "../errors";
import { completeFinishedLessons } from "./mock-bookings";
import { clone, latency, mockDb } from "./mock-db";
import type { MockState } from "./seed";

function assertAdmin(state: MockState, actorUserId: string): void {
  const user = state.users.find((u) => u.id === actorUserId);
  if (!user) throw new ServiceError("unauthorized");
  if (user.role !== "admin") throw new ServiceError("forbidden");
}

const sum = (amounts: Money[]): Money => ({
  currency: brand.currency,
  amountMinor: amounts.reduce((total, m) => total + m.amountMinor, 0),
});

export const mockPlatformService: PlatformService = {
  async getSettings() {
    await latency(100, 250);
    return clone(mockDb.data.settings);
  },

  async updateSettings(actorUserId, raw) {
    const input = parseInput(platformSettingsSchema, raw);
    await latency(400, 700);
    return mockDb.mutate((s) => {
      assertAdmin(s, actorUserId);
      // Bookings keep the commission they were priced with; only new requests use this.
      s.settings = {
        commissionBps: input.commissionBps,
        minHourlyRate: { currency: brand.currency, amountMinor: input.minHourlyRateMinor },
        maxHourlyRate: { currency: brand.currency, amountMinor: input.maxHourlyRateMinor },
        updatedAt: new Date().toISOString(),
        updatedBy: actorUserId,
      };
      return clone(s.settings);
    });
  },

  async getOverview(actorUserId) {
    await latency(300, 600);
    mockDb.mutate((s) => completeFinishedLessons(s));
    const s = mockDb.data;
    assertAdmin(s, actorUserId);

    const lessons = s.bookings.filter((b) => b.status === "confirmed" || b.status === "completed");
    const nameOf = (userId: string) => s.users.find((u) => u.id === userId)?.displayName ?? {};
    const tutorNameOf = (tutorId: string) => s.tutors.find((t) => t.id === tutorId)?.displayName ?? {};

    const overview: AdminOverview = {
      lessonCount: lessons.length,
      grossVolume: sum(lessons.map((b) => b.pricing.total)),
      commissionEarned: sum(lessons.map((b) => b.pricing.commission)),
      collectedInApp: sum(s.payments.filter((p) => p.status === "succeeded").map((p) => p.amount)),
      paidInCash: sum(lessons.map((b) => b.pricing.dueInCash)),
      recentPayments: [...s.payments]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 8)
        .map((p) => {
          const booking = s.bookings.find((b) => b.id === p.bookingId);
          return { ...p, studentName: nameOf(p.payerId), tutorName: booking ? tutorNameOf(booking.tutorId) : {} };
        }),
    };
    return clone(overview);
  },
};
