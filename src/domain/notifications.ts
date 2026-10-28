import type { NotificationCategory, NotificationChannel, NotificationPreferences, NotificationType } from "./types";

/**
 * Rules for notifications outside the app (email, SMS, push). Shared by the prototype's
 * simulated delivery and the production delivery job.
 */

export const NOTIFICATION_CHANNELS: NotificationChannel[] = ["email", "sms", "push"];
export const NOTIFICATION_CATEGORIES: NotificationCategory[] = ["lessons", "messages", "account"];

export function categoryOf(type: NotificationType | "password_reset"): NotificationCategory {
  if (type === "new_message") return "messages";
  if (type.startsWith("booking_") || type.startsWith("proposal_") || type === "lesson_reminder") return "lessons";
  return "account";
}

/** Sensible defaults: lesson news everywhere, chat only as push, no SMS for chatter. */
export const DEFAULT_PREFERENCES: NotificationPreferences = {
  email: { lessons: true, messages: false, account: true },
  sms: { lessons: true, messages: false, account: false },
  push: { lessons: true, messages: true, account: true },
};

/** Security mail (password reset) always goes out by email, whatever the preferences. */
export function wantsDelivery(prefs: NotificationPreferences, channel: NotificationChannel, type: NotificationType | "password_reset"): boolean {
  if (type === "password_reset") return channel === "email";
  return prefs[channel][categoryOf(type)];
}

/** Lesson reminders go out this long before the start. */
export const REMINDERS = [
  { key: "24h", minutesBefore: 24 * 60 },
  { key: "1h", minutesBefore: 60 },
] as const;
