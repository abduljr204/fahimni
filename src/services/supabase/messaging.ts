import type { RealtimeChannel } from "@supabase/supabase-js";
import type { AppNotification, Attachment, ConversationSummary, Message, Report, ReportDetails } from "@/domain/types";
import { reportSchema, resolveReportSchema, sendMessageSchema } from "@/domain/validation";
import type { MessagingEvent, MessagingService, ModerationService, NotificationService } from "../contracts";
import { parseInput } from "../errors";
import { call, callServer, signFiles, supabase, uploadFile } from "./client";

async function withSignedAttachments(message: Message): Promise<Message> {
  if (!message.attachments?.length) return message;
  return { ...message, attachments: await signFiles<Attachment & { path?: string }>("chat-attachments", message.attachments) };
}

// Several screens subscribe at once, so they share one channel per user.
function sharedChannel<E>(name: string, connect: (channel: RealtimeChannel, emit: (event: E) => void) => RealtimeChannel) {
  const listeners = new Set<(event: E) => void>();
  let channel: RealtimeChannel | null = null;
  return (listener: (event: E) => void) => {
    listeners.add(listener);
    channel ??= connect(supabase().channel(name), (event) => listeners.forEach((l) => l(event))).subscribe();
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && channel) {
        void supabase().removeChannel(channel);
        channel = null;
      }
    };
  };
}

const subscriptions = new Map<string, (listener: (event: never) => void) => () => void>();

function subscriptionFor<E>(name: string, connect: (channel: RealtimeChannel, emit: (event: E) => void) => RealtimeChannel) {
  let subscribe = subscriptions.get(name);
  if (!subscribe) {
    subscribe = sharedChannel(name, connect) as unknown as (listener: (event: never) => void) => () => void;
    subscriptions.set(name, subscribe);
  }
  return subscribe as unknown as (listener: (event: E) => void) => () => void;
}

export const supabaseMessagingService: MessagingService = {
  listConversations: () => call<ConversationSummary[]>("list_conversations"),
  getConversation: (_user, conversationId) => call<ConversationSummary | null>("get_conversation", { p_conversation: conversationId }),

  async listMessages(_user, conversationId) {
    const messages = await call<Message[]>("list_messages", { p_conversation: conversationId });
    return Promise.all(messages.map(withSignedAttachments));
  },

  openWithTutor: (_actor, tutorId, studentUserId) =>
    call<ConversationSummary>("open_conversation", { p_tutor: tutorId, p_student: studentUserId ?? null }),

  async send(_sender, raw) {
    const input = parseInput(sendMessageSchema, raw);
    const attachments = await Promise.all(input.attachments.map((a) => uploadFile("chat-attachments", input.conversationId, a)));
    // Through the server: the contact check can't be skipped from the browser.
    const message = await callServer<Message>("/api/messages", "POST", { conversationId: input.conversationId, body: input.body, attachments });
    return withSignedAttachments(message);
  },

  markRead: (_user, conversationId) => call<void>("mark_conversation_read", { p_conversation: conversationId }),

  subscribe(userId, listener) {
    return subscriptionFor<MessagingEvent>(`messages:${userId}`, (channel, emit) =>
      channel
        // Row Level Security delivers only the user's own conversations.
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
          const message = await call<Message | null>("get_message", { p_message: payload.new.id }).catch(() => null);
          if (message) emit({ type: "message", conversationId: message.conversationId, message: await withSignedAttachments(message) });
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) => {
          if (payload.new.read_at) emit({ type: "read", conversationId: payload.new.conversation_id, userId });
        }),
    )(listener);
  },
};

export const supabaseNotificationService: NotificationService = {
  list: () => call<AppNotification[]>("list_notifications"),
  markAllRead: () => call<void>("mark_all_notifications_read"),

  subscribe(userId, listener) {
    return subscriptionFor<AppNotification>(`notifications:${userId}`, (channel, emit) =>
      channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload) => {
        const n = payload.new;
        emit({ id: n.id, userId: n.user_id, type: n.type, data: n.data, createdAt: n.created_at });
      }),
    )(listener);
  },
};

export const supabaseModerationService: ModerationService = {
  report(_actor, raw) {
    const input = parseInput(reportSchema, raw);
    return call<Report>("file_report", {
      p_kind: input.kind,
      p_target: input.targetUserId,
      p_reason: input.reason,
      p_details: input.details,
      p_message: input.messageId ?? null,
      p_conversation: input.conversationId ?? null,
      p_booking: input.bookingId ?? null,
    });
  },

  listMine: () => call<Report[]>("list_my_reports"),
  listQueue: () => call<ReportDetails[]>("report_queue"),

  resolve(_actor, raw) {
    const input = parseInput(resolveReportSchema, raw);
    return call<Report>("resolve_report", {
      p_report: input.reportId,
      p_action: input.action,
      p_dismiss: input.dismiss,
      p_note: input.note,
      p_refund_minor: input.refundMinor ?? null,
    });
  },
};
