import { isPaid } from "@/domain/access";
import type { Money, Report, ReportDetails } from "@/domain/types";
import { reportSchema, resolveReportSchema } from "@/domain/validation";
import type { ModerationService } from "../contracts";
import { parseInput, ServiceError } from "../errors";
import { actsForStudent, isConversationParticipant, requireActive } from "./access";
import { clone, latency, mockDb, newId } from "./mock-db";
import { pushNotification } from "./mock-notifications";
import { refundBookingPayments } from "./mock-payments";
import { rateLimit } from "./rate-limit";
import type { MockState } from "./seed";

/** Disputes can be opened after the lesson's start and for this many days after. */
const DISPUTE_WINDOW_DAYS = 14;
/** Blocked contact-sharing attempts within a day that raise an automatic report. */
const AUTO_FLAG_ATTEMPTS = 3;

const blockedAttempts = new Map<string, { at: number; text: string }[]>();

function assertAdmin(state: MockState, actorUserId: string) {
  if (state.users.find((u) => u.id === actorUserId)?.role !== "admin") throw new ServiceError("forbidden");
}

/**
 * Called when a pre-booking message is blocked. Repeated attempts raise an automatic report
 * for admins; single slips don't, since the warning already explained the rule.
 */
export function recordBlockedAttempt(userId: string, text: string, now = Date.now()): void {
  const recent = (blockedAttempts.get(userId) ?? []).filter((a) => now - a.at < 86_400_000);
  recent.push({ at: now, text });
  blockedAttempts.set(userId, recent);
  if (recent.length < AUTO_FLAG_ATTEMPTS) return;
  mockDb.mutate((s) => {
    const alreadyOpen = s.reports.some((r) => r.auto && r.targetUserId === userId && r.status === "open");
    if (alreadyOpen) return;
    s.reports.push({
      id: newId("rep"),
      kind: "report",
      targetUserId: userId,
      reason: "off_platform",
      details: `Automatic flag: ${recent.length} attempts to share contact details before booking within 24 hours.`,
      evidence: recent.map((a) => a.text).join(" … ").slice(0, 600),
      auto: true,
      status: "open",
      createdAt: new Date(now).toISOString(),
      isDemo: true,
    });
  });
}

/** You can only report people you have actually dealt with, or a tutor's public profile. */
function assertCanReport(state: MockState, actorUserId: string, targetUserId: string): void {
  if (actorUserId === targetUserId) throw new ServiceError("validation");
  const target = state.users.find((u) => u.id === targetUserId);
  if (!target) throw new ServiceError("not_found");
  const publicTutor = state.tutors.some((t) => t.userId === targetUserId && t.published);
  const sharesConversation = state.conversations.some(
    (c) => isConversationParticipant(state, actorUserId, c) && isConversationParticipant(state, targetUserId, c),
  );
  if (!publicTutor && !sharesConversation) throw new ServiceError("forbidden");
}

function details(state: MockState, r: Report): ReportDetails {
  const target = state.users.find((u) => u.id === r.targetUserId)!;
  const reporter = r.reporterId ? state.users.find((u) => u.id === r.reporterId) : undefined;
  const booking = r.bookingId ? state.bookings.find((b) => b.id === r.bookingId) : undefined;
  return clone({
    ...r,
    reporterName: reporter?.displayName,
    targetName: target.displayName,
    targetRole: target.role,
    targetSuspended: Boolean(target.suspendedAt),
    booking: booking && {
      id: booking.id,
      startsAt: booking.startsAt,
      durationMinutes: booking.durationMinutes,
      mode: booking.mode,
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      pricing: booking.pricing,
      subject: state.subjects.find((x) => x.id === booking.subjectId)!.name,
    },
  });
}

export const mockModerationService: ModerationService = {
  async report(actorUserId, raw) {
    const input = parseInput(reportSchema, raw);
    await latency(400, 700);
    rateLimit("report", actorUserId);
    return mockDb.mutate((s) => {
      requireActive(s, actorUserId);
      let evidence: string | undefined;
      let targetUserId = input.targetUserId;

      if (input.kind === "dispute") {
        const booking = s.bookings.find((b) => b.id === input.bookingId);
        if (!booking) throw new ServiceError("not_found");
        if (!actsForStudent(s, actorUserId, booking.studentId)) throw new ServiceError("forbidden");
        const started = new Date(booking.startsAt).getTime();
        const now = Date.now();
        if (booking.status !== "confirmed" || !isPaid(booking.paymentStatus) || now < started || now > started + DISPUTE_WINDOW_DAYS * 86_400_000) {
          throw new ServiceError("validation", undefined, { _form: "disputeNotAllowed" });
        }
        if (s.reports.some((r) => r.kind === "dispute" && r.bookingId === booking.id && r.status === "open")) {
          throw new ServiceError("validation", undefined, { _form: "disputeExists" });
        }
        targetUserId = s.tutors.find((t) => t.id === booking.tutorId)!.userId;
      } else if (input.messageId) {
        const message = s.messages.find((m) => m.id === input.messageId);
        const conversation = message && s.conversations.find((c) => c.id === message.conversationId);
        if (!message || !conversation || !isConversationParticipant(s, actorUserId, conversation)) throw new ServiceError("forbidden");
        targetUserId = message.senderId;
        evidence = message.body.slice(0, 1000);
      }
      assertCanReport(s, actorUserId, targetUserId);

      const report: Report = {
        id: newId("rep"),
        kind: input.kind,
        reporterId: actorUserId,
        targetUserId,
        reason: input.reason,
        details: input.details,
        messageId: input.messageId,
        conversationId: input.conversationId,
        bookingId: input.bookingId,
        evidence,
        status: "open",
        createdAt: new Date().toISOString(),
        isDemo: true,
      };
      s.reports.push(report);
      return clone(report);
    });
  },

  async listMine(actorUserId) {
    await latency(150, 300);
    return clone(mockDb.data.reports.filter((r) => r.reporterId === actorUserId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  },

  async listQueue(actorUserId) {
    await latency(200, 400);
    const s = mockDb.data;
    assertAdmin(s, actorUserId);
    return s.reports
      .filter((r) => r.status === "open")
      // Disputes involve money, so they come first; then oldest first.
      .sort((a, b) => (a.kind === b.kind ? a.createdAt.localeCompare(b.createdAt) : a.kind === "dispute" ? -1 : 1))
      .map((r) => details(s, r));
  },

  async resolve(actorUserId, raw) {
    const input = parseInput(resolveReportSchema, raw);
    await latency(400, 700);
    return mockDb.mutate((s) => {
      assertAdmin(s, actorUserId);
      const report = s.reports.find((r) => r.id === input.reportId);
      if (!report) throw new ServiceError("not_found");
      if (report.status !== "open") throw new ServiceError("validation");
      const target = s.users.find((u) => u.id === report.targetUserId)!;
      const tutor = s.tutors.find((t) => t.userId === target.id);
      const now = new Date().toISOString();
      let refund: Money | undefined;

      if (!input.dismiss) {
        switch (input.action) {
          case "warning":
            pushNotification(s, { userId: target.id, type: "account_warning", data: {} });
            break;
          case "suspend":
            target.suspendedAt = now;
            target.suspensionReason = input.note;
            if (tutor) tutor.published = false;
            break;
          case "unpublish":
            if (!tutor) throw new ServiceError("validation");
            tutor.published = false;
            break;
          case "refund": {
            const booking = report.bookingId ? s.bookings.find((b) => b.id === report.bookingId) : undefined;
            if (report.kind !== "dispute" || !booking) throw new ServiceError("validation");
            const paid = booking.pricing.dueInApp.amountMinor;
            const amount = Math.min(paid, input.refundMinor ?? paid);
            if (amount <= 0) throw new ServiceError("validation", undefined, { refundMinor: "required" });
            refund = { currency: booking.pricing.dueInApp.currency, amountMinor: amount };
            refundBookingPayments(s, booking.id, refund);
            break;
          }
        }
      }

      report.status = input.dismiss ? "dismissed" : "resolved";
      report.resolution = { action: input.dismiss ? "none" : input.action, note: input.note, refund, by: actorUserId, at: now };
      if (report.reporterId) {
        pushNotification(s, { userId: report.reporterId, type: "report_resolved", data: { name: target.displayName, bookingId: report.bookingId } });
      }
      return clone(report);
    });
  },
};
