import type { AppNotification } from "@/domain/types";
import type { NotificationService } from "../contracts";
import { EventBus } from "./event-bus";
import { clone, latency, mockDb, newId } from "./mock-db";
import type { MockState } from "./seed";

const bus = new EventBus<AppNotification>();

/** Inserts a notification inside an existing mutation and pushes it to subscribers. */
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
  // Emit after the current mutation has been persisted.
  queueMicrotask(() => bus.emit(notification.userId, clone(notification)));
  return notification;
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
