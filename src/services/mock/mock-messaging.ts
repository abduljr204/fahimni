import type { Conversation, ConversationSummary, Message } from "@/domain/types";
import { sendMessageSchema } from "@/domain/validation";
import type { MessagingEvent, MessagingService } from "../contracts";
import { parseInput, ServiceError } from "../errors";
import { EventBus } from "./event-bus";
import { clone, latency, mockDb, newId } from "./mock-db";
import { pushNotification } from "./mock-notifications";
import type { MockState } from "./seed";

const bus = new EventBus<MessagingEvent>();

function participants(c: Conversation): [string, string] {
  return [c.studentId, c.tutorUserId];
}

function summarize(state: MockState, c: Conversation, viewerId: string): ConversationSummary {
  const counterpartId = c.studentId === viewerId ? c.tutorUserId : c.studentId;
  const user = state.users.find((u) => u.id === counterpartId)!;
  const tutor = state.tutors.find((t) => t.userId === counterpartId);
  const student = state.students.find((s) => s.userId === counterpartId);
  return clone({
    ...c,
    counterpart: {
      id: user.id,
      displayName: user.displayName,
      avatarHue: user.avatarHue,
      avatarUrl: user.avatarUrl,
      subtitle: tutor?.headline ?? student?.major ?? {},
    },
    unreadCount: state.messages.filter(
      (m) => m.conversationId === c.id && m.senderId !== viewerId && !m.readAt,
    ).length,
  });
}

function requireParticipant(state: MockState, userId: string, conversationId: string): Conversation {
  const c = state.conversations.find((x) => x.id === conversationId);
  if (!c) throw new ServiceError("not_found");
  if (!participants(c).includes(userId)) throw new ServiceError("forbidden");
  return c;
}

function insertMessage(senderId: string, conversationId: string, body: string, isSimulated = false): Message {
  return mockDb.mutate((s) => {
    const c = requireParticipant(s, senderId, conversationId);
    const message: Message = {
      id: newId("m"),
      conversationId,
      senderId,
      body,
      createdAt: new Date().toISOString(),
      isDemo: true,
      isSimulated: isSimulated || undefined,
    };
    s.messages.push(message);
    c.lastMessageAt = message.createdAt;
    c.lastMessagePreview = body;
    c.lastMessageSenderId = senderId;
    const recipient = participants(c).find((id) => id !== senderId)!;
    const sender = s.users.find((u) => u.id === senderId)!;
    pushNotification(s, { userId: recipient, type: "new_message", data: { name: sender.displayName, conversationId } });
    queueMicrotask(() => {
      for (const id of participants(c)) bus.emit(id, { type: "message", conversationId, message: clone(message) });
    });
    return clone(message);
  });
}

// ─── Simulated replies ──────────────────────────────────────────────────────

const replies = {
  ar: {
    price: "الحصة بالسعر المعروض في ملفي، ويمكنك اختيار 30 أو 60 أو 90 دقيقة 😊",
    time: "نعم متاح! اختر الموعد المناسب من صفحة الحجز وسأؤكده مباشرة.",
    thanks: "العفو! بالتوفيق، وأنا هنا إذا احتجت أي شيء 🙌",
    greeting: "أهلًا وسهلًا! كيف يمكنني مساعدتك؟",
    generic: [
      "فكرة ممتازة، سنراجع هذا معًا في الحصة القادمة.",
      "تمام! أرسل لي التمارين التي تجد فيها صعوبة وسأحضّرها.",
      "واضح، سأجهز لك ملخصًا قبل الدرس 📚",
    ],
  },
  en: {
    price: "The rate is on my profile — you can pick 30, 60 or 90 minutes 😊",
    time: "Yes, I'm available! Pick a time on the booking page and I'll confirm it.",
    thanks: "You're welcome! Good luck, and I'm here if you need anything 🙌",
    greeting: "Hi there! How can I help?",
    generic: [
      "Great idea, we'll go over that together next lesson.",
      "Sure! Send me the exercises you're stuck on and I'll prepare them.",
      "Got it, I'll put together a summary before the lesson 📚",
    ],
  },
};

function pickReply(body: string): string {
  const isArabic = /[؀-ۿ]/.test(body);
  const r = isArabic ? replies.ar : replies.en;
  const text = body.toLowerCase();
  if (/(ثمن|سعر|بشحال|كم|price|cost|how much|prix)/.test(text)) return r.price;
  if (/(متاح|موعد|وقت|available|time|when|dispo)/.test(text)) return r.time;
  if (/(شكر|merci|thank|thx)/.test(text)) return r.thanks;
  if (/(مرحب|سلام|أهل|hello|hi|salut|bonjour)/.test(text)) return r.greeting;
  return r.generic[Math.floor(Math.random() * r.generic.length)];
}

function simulateReply(conversationId: string, senderId: string, body: string) {
  if (typeof window === "undefined") return;
  const c = mockDb.data.conversations.find((x) => x.id === conversationId);
  if (!c) return;
  const responder = participants(c).find((id) => id !== senderId)!;
  const typingDelay = 700 + Math.random() * 500;
  const replyDelay = typingDelay + 1400 + Math.random() * 900;
  window.setTimeout(() => {
    bus.emit(senderId, { type: "read", conversationId, userId: responder });
    mockDb.mutate((s) => {
      const now = new Date().toISOString();
      s.messages.forEach((m) => {
        if (m.conversationId === conversationId && m.senderId === senderId && !m.readAt) m.readAt = now;
      });
    });
    bus.emit(senderId, { type: "typing", conversationId, userId: responder, isTyping: true });
  }, typingDelay);
  window.setTimeout(() => {
    bus.emit(senderId, { type: "typing", conversationId, userId: responder, isTyping: false });
    insertMessage(responder, conversationId, pickReply(body), true);
  }, replyDelay);
}

export const mockMessagingService: MessagingService = {
  async listConversations(userId) {
    await latency(250, 500);
    const s = mockDb.data;
    return s.conversations
      .filter((c) => participants(c).includes(userId))
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
      .map((c) => summarize(s, c, userId));
  },

  async getConversation(userId, conversationId) {
    await latency(100, 250);
    const s = mockDb.data;
    const c = s.conversations.find((x) => x.id === conversationId);
    if (!c) return null;
    if (!participants(c).includes(userId)) throw new ServiceError("forbidden");
    return summarize(s, c, userId);
  },

  async listMessages(userId, conversationId) {
    await latency(200, 400);
    requireParticipant(mockDb.data, userId, conversationId);
    return clone(
      mockDb.data.messages
        .filter((m) => m.conversationId === conversationId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
  },

  async openWithTutor(studentUserId, tutorId) {
    await latency(200, 400);
    return mockDb.mutate((s) => {
      const tutor = s.tutors.find((t) => t.id === tutorId);
      if (!tutor) throw new ServiceError("not_found");
      if (tutor.userId === studentUserId) throw new ServiceError("validation");
      let c = s.conversations.find((x) => x.studentId === studentUserId && x.tutorId === tutorId);
      if (!c) {
        const now = new Date().toISOString();
        c = {
          id: newId("c"),
          studentId: studentUserId,
          tutorUserId: tutor.userId,
          tutorId,
          lastMessageAt: now,
          lastMessagePreview: "",
          createdAt: now,
          isDemo: true,
        };
        s.conversations.push(c);
      }
      return summarize(s, c, studentUserId);
    });
  },

  async send(senderId, conversationId, rawBody) {
    const { body } = parseInput(sendMessageSchema, { conversationId, body: rawBody });
    await latency(150, 300);
    const message = insertMessage(senderId, conversationId, body);
    simulateReply(conversationId, senderId, body);
    return message;
  },

  async markRead(userId, conversationId) {
    mockDb.mutate((s) => {
      requireParticipant(s, userId, conversationId);
      const now = new Date().toISOString();
      s.messages.forEach((m) => {
        if (m.conversationId === conversationId && m.senderId !== userId && !m.readAt) m.readAt = now;
      });
      s.notifications.forEach((n) => {
        if (n.userId === userId && n.type === "new_message" && n.data.conversationId === conversationId && !n.readAt) {
          n.readAt = now;
        }
      });
    });
  },

  subscribe(userId, listener) {
    return bus.on(userId, listener);
  },
};
