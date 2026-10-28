import "server-only";
import { serverConfig } from "@/config/server-config";
import { wantsDelivery } from "@/domain/notifications";
import type { NotificationChannel, NotificationPreferences, OutboundMessage } from "@/domain/types";
import { ServiceError } from "../errors";

/**
 * PRODUCTION integration point: delivers notifications outside the app.
 *
 * Flow: a database trigger or the Route Handler that creates a notification enqueues a job;
 * a worker (Supabase Edge Function, cron or queue) loads the recipient's preferences, private
 * phone number and push subscriptions, renders the text in their language with the same
 * templates as the app (i18n dictionaries), and calls `deliver`. Each attempt is written to
 * `notification_deliveries`. Lesson reminders come from a scheduled job (every 5 minutes)
 * using `REMINDERS` in `domain/notifications.ts`.
 *
 * Suggested providers: email via Resend, Amazon SES or SendGrid; SMS via a provider with
 * Libyan coverage (e.g. Twilio, Infobip or a local aggregator for Libyana/Al-Madar);
 * push via standard Web Push with VAPID keys.
 */
export interface ChannelProvider {
  readonly channel: NotificationChannel;
  send(message: { to: string; title: string; body: string; link?: string }): Promise<{ reference: string }>;
}

export interface Recipient {
  userId: string;
  email: string;
  phone?: string;
  pushEndpoints: string[];
  prefs: NotificationPreferences;
}

export function getChannelProviders(): ChannelProvider[] {
  const configured = {
    email: Boolean(serverConfig.EMAIL_PROVIDER_API_KEY && serverConfig.EMAIL_FROM),
    sms: Boolean(serverConfig.SMS_PROVIDER_API_KEY && serverConfig.SMS_SENDER_ID),
    push: Boolean(serverConfig.VAPID_PRIVATE_KEY),
  };
  if (!configured.email && !configured.sms && !configured.push) {
    throw new ServiceError("not_configured", "No notification channel is configured. See docs/ACCOUNTS_AND_TRUST.md.");
  }
  // Implement one adapter per configured channel here.
  throw new ServiceError("not_configured", "Notification channel adapters are not implemented yet.");
}

/** Sends one rendered notification on every channel the recipient wants. */
export async function deliver(
  recipient: Recipient,
  type: OutboundMessage["type"],
  content: { title: string; body: string; link?: string },
): Promise<{ channel: NotificationChannel; status: "sent" | "failed"; reference?: string; error?: string }[]> {
  const results = [];
  for (const provider of getChannelProviders()) {
    if (!wantsDelivery(recipient.prefs, provider.channel, type)) continue;
    const targets =
      provider.channel === "email" ? [recipient.email] : provider.channel === "sms" ? (recipient.phone ? [recipient.phone] : []) : recipient.pushEndpoints;
    for (const to of targets) {
      try {
        const { reference } = await provider.send({ to, ...content });
        results.push({ channel: provider.channel, status: "sent" as const, reference });
      } catch (error) {
        results.push({ channel: provider.channel, status: "failed" as const, error: String(error) });
      }
    }
  }
  return results;
}
