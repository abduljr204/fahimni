import { isPaidAndConfirmed } from "@/domain/access";
import { DEFAULT_PREFERENCES, NOTIFICATION_CHANNELS, REMINDERS, wantsDelivery } from "@/domain/notifications";
import type { AppNotification, NotificationPreferences, OutboundMessage } from "@/domain/types";
import type { NotificationService } from "../contracts";
import { learnerSide } from "./access";
import { EventBus } from "./event-bus";
import { clone, latency, mockDb, newId } from "./mock-db";
import type { MockState } from "./seed";

const bus = new EventBus<AppNotification>();

export function preferencesOf(state: MockState, userId: string): NotificationPreferences {
  return state.preferences[userId] ?? DEFAULT_PREFERENCES;
}

/**
 * Records the email/SMS/push copies of a notification, as the production delivery job
 * would send them. Nothing leaves the browser in the prototype: these are "simulated".
 */
export function deliverOutside(
  state: MockState,
  userId: string,
  type: OutboundMessage["type"],
  data: OutboundMessage["data"],
): void {
  const user = state.users.find((u) => u.id === userId);
  // Managed children have no inbox of their own; their parent receives the notifications.
  if (!user || !user.password) return;
  const prefs = preferencesOf(state, userId);
  for (const channel of NOTIFICATION_CHANNELS) {
    if (!wantsDelivery(prefs, channel, type)) continue;
    const to = channel === "email" ? user.email : channel === "sms" ? user.phone : "push";
    if (!to) continue;
    state.outbox.push({
      id: newId("out"),
      userId,
      channel,
      to,
      type,
      data: { ...data },
      status: "simulated",
      createdAt: new Date().toISOString(),
      isDemo: true,
    });
  }
}

/** Inserts a notification inside an existing mutation, pushes it to subscribers and delivers copies outside the app. */
export function pushNotification(
  state: MockState,
  input: Pick<AppNotification, "userId" | "type" | "data">,
): AppNotification {
  const notification: AppNotification = {
    id: newId("n"),
    createdAt: new Date().toISOString(),
    isDemo: true,
    ...input,
  };
  state.notifications.push(notification);
  deliverOutside(state, input.userId, input.type, input.data);
  // Emit after the current mutation has been persisted.
  queueMicrotask(() => bus.emit(notification.userId, clone(notification)));
  return notification;
}

/**
 * Sends the 24-hour and 1-hour reminders for confirmed, paid lessons. Production runs the
 * same check as a scheduled job every few minutes.
 */
export function sendDueReminders(state: MockState, now = Date.now()): number {
  let sent = 0;
  for (const b of state.bookings) {
    if (!isPaidAndConfirmed(b) || b.lessonStatus !== "scheduled") continue;
    const minutesLeft = (new Date(b.startsAt).getTime() - now) / 60_000;
    if (minutesLeft <= 0) continue;
    // Only the most urgent reminder that is due, so a late booking doesn't get both at once.
    const due = [...REMINDERS].reverse().find((r) => minutesLeft <= r.minutesBefore);
    if (!due || b.remindersSent?.includes(due.key)) continue;
    b.remindersSent = [...(b.remindersSent ?? []), ...REMINDERS.filter((r) => r.minutesBefore >= due.minutesBefore).map((r) => r.key)];
    const tutor = state.tutors.find((t) => t.id === b.tutorId);
    const subject = state.subjects.find((s) => s.id === b.subjectId)?.name;
    const student = state.users.find((u) => u.id === b.studentId);
    for (const userId of learnerSide(state, b.studentId)) {
      pushNotification(state, { userId, type: "lesson_reminder", data: { name: tutor?.displayName, subject, startsAt: b.startsAt, bookingId: b.id } });
    }
    if (tutor) pushNotification(state, { userId: tutor.userId, type: "lesson_reminder", data: { name: student?.displayName, subject, startsAt: b.startsAt, bookingId: b.id } });
    sent++;
  }
  return sent;
}

export const mockNotificationService: NotificationService = {
  async list(userId) {
    await latency(150, 350);
    return clone(
      mockDb.data.notifications
        .filter((n) => n.userId === userId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  },

  async markAllRead(userId) {
    await latency(100, 200);
    const now = new Date().toISOString();
    mockDb.mutate((s) => {
      s.notifications.forEach((n) => {
        if (n.userId === userId && !n.readAt) n.readAt = now;
      });
    });
  },

  subscribe(userId, listener) {
    return bus.on(userId, listener);
  },
};
