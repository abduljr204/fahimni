import { appConfig } from "@/config/app-config";
import { classroomDenial, classroomWindow } from "@/domain/access";
import type { ClassroomParticipant, ClassroomTicket } from "@/domain/types";
import type { ClassroomService } from "../contracts";
import { ServiceError } from "../errors";
import { bookingRole, guardianOf } from "./access";
import { clone, latency, mockDb, newId } from "./mock-db";

/**
 * Prototype classroom access. It applies the same checks a production token endpoint must:
 * the caller is a participant, the booking is a confirmed and paid online lesson, and the
 * entry window is open. The "token" is a random string that the simulated video provider
 * accepts; production issues a signed, short-lived token from the video service instead.
 */
/** Swaps the simulated credential for a real one from the server when a real provider is switched on. */
async function withLiveToken(ticket: ClassroomTicket): Promise<ClassroomTicket> {
  if (appConfig.video.provider === "simulated") return ticket;
  const response = await fetch(`/api/classroom/${encodeURIComponent(ticket.bookingId)}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId: ticket.me.userId,
      displayName: ticket.me.displayName.en ?? ticket.me.displayName.ar ?? "Participant",
      role: ticket.me.role,
    }),
  });
  if (!response.ok) throw new ServiceError("not_configured", `Classroom token request failed (${response.status}).`);
  const issued = (await response.json()) as { token: string; serverUrl: string; roomName: string; expiresAt: string; provider: string };
  return { ...ticket, ...issued };
}

export const mockClassroomService: ClassroomService = {
  async join(actorUserId, bookingId, options) {
    await latency(300, 600);
    const ticket = mockDb.mutate((s) => {
      const booking = s.bookings.find((b) => b.id === bookingId);
      // Same answer for "doesn't exist" and "not yours", so ids can't be probed.
      if (!booking) throw new ServiceError("forbidden");
      const role = bookingRole(s, actorUserId, booking);
      if (!role) throw new ServiceError("forbidden");

      const denial = classroomDenial(booking, s.settings, new Date(), options?.demoIgnoreSchedule === true);
      if (denial) {
        const { opensAt, closesAt } = classroomWindow(booking, s.settings);
        throw new ServiceError("classroom_closed", undefined, undefined, { reason: denial, opensAt: opensAt.toISOString(), closesAt: closesAt.toISOString() });
      }

      const tutor = s.tutors.find((t) => t.id === booking.tutorId)!;
      const person = (userId: string, r: ClassroomParticipant["role"]): ClassroomParticipant => {
        const u = s.users.find((x) => x.id === userId)!;
        return { userId, role: r, displayName: u.displayName, avatarHue: u.avatarHue };
      };
      const guardian = guardianOf(s, booking.studentId);
      const participants = [
        person(tutor.userId, "tutor"),
        person(booking.studentId, "student"),
        ...(guardian ? [person(guardian, "guardian")] : []),
      ];
      if (booking.lessonStatus === "scheduled") booking.lessonStatus = "in_progress";

      const { closesAt } = classroomWindow(booking, s.settings);
      const issued: ClassroomTicket = {
        bookingId,
        roomName: `lesson-${bookingId}`,
        token: newId("sim-token"),
        provider: "simulated",
        expiresAt: new Date(Math.max(closesAt.getTime(), Date.now() + 2 * 3_600_000)).toISOString(),
        me: participants.find((p) => p.userId === actorUserId)!,
        participants,
        lesson: {
          subject: s.subjects.find((x) => x.id === booking.subjectId)!.name,
          startsAt: booking.startsAt,
          durationMinutes: booking.durationMinutes,
          objectives: booking.objectives,
        },
        recording: false,
      };
      return clone(issued);
    });
    return withLiveToken(ticket);
  },

  async leave(actorUserId, bookingId) {
    await latency(100, 200);
    const booking = mockDb.data.bookings.find((b) => b.id === bookingId);
    if (!booking || !bookingRole(mockDb.data, actorUserId, booking)) throw new ServiceError("forbidden");
  },
};
