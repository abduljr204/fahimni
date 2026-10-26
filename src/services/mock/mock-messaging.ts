import { detectContactDetails } from "@/domain/contact-guard";
import type { Attachment, Conversation, ConversationSummary, Message, SystemEvent } from "@/domain/types";
import { sendMessageSchema } from "@/domain/validation";
import type { MessagingEvent, MessagingService } from "../contracts";
import { parseInput, ServiceError } from "../errors";
import {
  conversationParticipants,
  guardianOf,
  isConversationParticipant,
  isUnlocked,
  learnerSide,
  requireActsForStudent,
  requireConversationParticipant,
} from "./access";
import { EventBus } from "./event-bus";
import { clone, latency, mockDb, newId } from "./mock-db";
import { pushNotification } from "./mock-notifications";
import { DEMO_TUTOR_EMAIL, type MockState } from "./seed";

const bus = new EventBus<MessagingEvent>();

/** Which side of the conversation a user is on. Parents share the learner's side. */
function sideOf(c: Conversation, userId: string): "tutor" | "learner" {
  return userId === c.tutorUserId ? "tutor" : "learner";
}

function summarize(state: MockState, c: Conversation, viewerId: string): ConversationSummary {
  const viewerIsTutor = sideOf(c, viewerId) === "tutor";
  const counterpartId = viewerIsTutor ? c.studentId : c.tutorUserId;
  const user = state.users.find((u) => u.id === counterpartId)!;
  const tutor = state.tutors.find((t) => t.userId === counterpartId);
  const student = state.students.find((s) => s.userId === counterpartId);
  const guardianId = guardianOf(state, c.studentId);
  const guardian = guardianId ? state.users.find((u) => u.id === guardianId) : undefined;
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
      (m) => m.conversationId === c.id && sideOf(c, m.senderId) !== sideOf(c, viewerId) && !m.readAt,
    ).length,
    unlocked: isUnlocked(state, c.studentId, c.tutorId),
    guardian: guardian ? { id: guardian.id, displayName: guardian.displayName } : undefined,
  });
}

/** Adds a message to the state. Callers run it inside `mockDb.mutate`. */
export function pushMessage(
  state: MockState,
  c: Conversation,
  senderId: string,
  body: string,
  extra: Partial<Pick<Message, "kind" | "attachments" | "proposalId" | "systemEvent" | "isSimulated">> = {},
): Message {
  const message: Message = {
    id: newId("m"),
    conversationId: c.id,
    senderId,
    body,
    kind: extra.kind ?? "text",
    attachments: extra.attachments?.length ? extra.attachments : undefined,
    proposalId: extra.proposalId,
    systemEvent: extra.systemEvent,
    createdAt: new Date().toISOString(),
    isDemo: true,
    isSimulated: extra.isSimulated || undefined,
  };
  state.messages.push(message);
  c.lastMessageAt = message.createdAt;
  c.lastMessagePreview = body || (message.attachments ? `📎 ${message.attachments[0].name}` : "");
  c.lastMessageSenderId = senderId;

  if (message.kind !== "system") {
    const sender = state.users.find((u) => u.id === senderId)!;
    for (const recipient of conversationParticipants(state, c)) {
      if (sideOf(c, recipient) === sideOf(c, senderId)) continue;
      pushNotification(state, { userId: recipient, type: "new_message", data: { name: sender.displayName, conversationId: c.id } });
    }
  }
  const participants = conversationParticipants(state, c);
  queueMicrotask(() => {
    for (const id of participants) bus.emit(id, { type: "message", conversationId: c.id, message: clone(message) });
  });
  return message;
}

/** Notes in the conversation that contact sharing opened up (after payment) or closed again (after cancellation). */
export function postSystemMessage(state: MockState, studentUserId: string, tutorId: string, event: SystemEvent): void {
  const c = state.conversations.find((x) => x.studentId === studentUserId && x.tutorId === tutorId);
  if (!c) return;
  const last = state.messages.filter((m) => m.conversationId === c.id && m.kind === "system").at(-1);
  if (last?.systemEvent === event) return;
  pushMessage(state, c, c.tutorUserId, "", { kind: "system", systemEvent: event });
}

/** Returns the conversation for a learner and tutor, creating it if needed. */
export function ensureConversation(state: MockState, studentUserId: string, tutorId: string): Conversation {
  const tutor = state.tutors.find((t) => t.id === tutorId);
  if (!tutor) throw new ServiceError("not_found");
  let c = state.conversations.find((x) => x.studentId === studentUserId && x.tutorId === tutorId);
  if (!c) {
    const now = new Date().toISOString();
    c = { id: newId("c"), studentId: studentUserId, tutorUserId: tutor.userId, tutorId, lastMessageAt: now, lastMessagePreview: "", createdAt: now, isDemo: true };
    state.conversations.push(c);
  }
  return c;
}

// ─── Simulated replies ──────────────────────────────────────────────────────

const replies = {
  ar: {
    exercise: "شكرًا، اطلعت على التمرين 👍 الفكرة الأساسية هنا هي تطبيق قاعدة السلسلة خطوة بخطوة. يمكننا حله مع تمارين مشابهة في حصة، وسأرسل لك عرض درس الآن.",
    price: "سعري معروض في ملفي، ويمكنك اختيار 30 أو 60 أو 90 دقيقة 😊",
    time: "نعم متاح! يمكنني إرسال عرض درس بالموعد المناسب، أو اختر الموعد من صفحة الحجز.",
    thanks: "العفو! بالتوفيق، وأنا هنا إذا احتجت أي شيء 🙌",
    greeting: "أهلًا وسهلًا! كيف يمكنني مساعدتك؟",
    generic: [
      "فكرة ممتازة، سنراجع هذا معًا في الحصة.",
      "تمام! أرسل لي التمارين التي تجد فيها صعوبة وسأحضّرها.",
      "واضح، سأجهز لك ملخصًا قبل الدرس 📚",
    ],
    learner: ["ممتاز، شكرًا جزيلًا! 🙏", "تمام، يناسبني 👍", "حسنًا، سأراجع العرض الآن."],
  },
  en: {
    exercise: "Thanks, I've looked at the exercise 👍 The key idea is applying the chain rule step by step. We can solve it with similar problems in a lesson — I'll send you a lesson proposal now.",
    price: "My rate is on my profile — you can pick 30, 60 or 90 minutes 😊",
    time: "Yes, I'm available! I can send you a lesson proposal, or pick a time on the booking page.",
    thanks: "You're welcome! Good luck, and I'm here if you need anything 🙌",
    greeting: "Hi there! How can I help?",
    generic: [
      "Great idea, we'll go over that together in the lesson.",
      "Sure! Send me the exercises you're stuck on and I'll prepare them.",
      "Got it, I'll put together a summary before the lesson 📚",
    ],
    learner: ["Great, thank you so much! 🙏", "Perfect, that works for me 👍", "OK, I'll look at the proposal now."],
  },
};

function isExerciseQuestion(body: string, hasAttachments: boolean): boolean {
  return hasAttachments || /(تمرين|تمارين|مسألة|مسائل|سؤال|exercise|problem|question|homework)/i.test(body);
}

function pickReply(body: string, hasAttachments: boolean, responderSide: "tutor" | "learner"): string {
  const isArabic = /[؀-ۿ]/.test(body) || (!body && hasAttachments);
  const r = isArabic ? replies.ar : replies.en;
  // The learner's side answers like a student or parent, not like a tutor.
  if (responderSide === "learner") return r.learner[Math.floor(Math.random() * r.learner.length)];
  const text = body.toLowerCase();
  if (isExerciseQuestion(body, hasAttachments)) return r.exercise;
  if (/(ثمن|سعر|بكم|قداش|كم|price|cost|how much|prix)/.test(text)) return r.price;
  if (/(متاح|موعد|وقت|available|time|when|dispo)/.test(text)) return r.time;
  if (/(شكر|merci|thank|thx)/.test(text)) return r.thanks;
  if (/(مرحب|سلام|أهل|hello|hi|salut|bonjour)/.test(text)) return r.greeting;
  return r.generic[Math.floor(Math.random() * r.generic.length)];
}

function simulateReply(conversationId: string, senderId: string, body: string, hasAttachments: boolean) {
  if (typeof window === "undefined") return;
  const c = mockDb.data.conversations.find((x) => x.id === conversationId);
  if (!c) return;
  const senderSide = sideOf(c, senderId);
  // The learner's side is answered by the student, or by the parent for managed students.
  const responder = senderSide === "learner" ? c.tutorUserId : (guardianOf(mockDb.data, c.studentId) ?? c.studentId);
  const typingDelay = 700 + Math.random() * 500;
  const replyDelay = typingDelay + 1400 + Math.random() * 900;
  window.setTimeout(() => {
    bus.emit(senderId, { type: "read", conversationId, userId: responder });
    mockDb.mutate((s) => {
      const now = new Date().toISOString();
      s.messages.forEach((m) => {
        if (m.conversationId === conversationId && sideOf(c, m.senderId) === senderSide && !m.readAt) m.readAt = now;
      });
    });
    bus.emit(senderId, { type: "typing", conversationId, userId: responder, isTyping: true });
  }, typingDelay);
  window.setTimeout(async () => {
    bus.emit(senderId, { type: "typing", conversationId, userId: responder, isTyping: false });
    mockDb.mutate((s) => {
      const conv = s.conversations.find((x) => x.id === conversationId)!;
      pushMessage(s, conv, responder, pickReply(body, hasAttachments, senderSide === "tutor" ? "learner" : "tutor"), { isSimulated: true });
    });
    // Simulated tutors follow up an exercise question with a lesson proposal. The demo tutor
    // never does, so testers can send one themselves from tutor mode.
    const tutorEmail = mockDb.data.users.find((u) => u.id === c.tutorUserId)?.email;
    if (senderSide === "learner" && tutorEmail !== DEMO_TUTOR_EMAIL && isExerciseQuestion(body, hasAttachments)) {
      const { createSimulatedProposal } = await import("./mock-proposals");
      window.setTimeout(() => createSimulatedProposal(conversationId), 1500);
    }
  }, replyDelay);
}

export const mockMessagingService: MessagingService = {
  async listConversations(userId) {
    await latency(250, 500);
    const s = mockDb.data;
    return s.conversations
      .filter((c) => isConversationParticipant(s, userId, c))
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
      .map((c) => summarize(s, c, userId));
  },

  async getConversation(userId, conversationId) {
    await latency(100, 250);
    const s = mockDb.data;
    const c = s.conversations.find((x) => x.id === conversationId);
    if (!c) return null;
    if (!isConversationParticipant(s, userId, c)) throw new ServiceError("forbidden");
    return summarize(s, c, userId);
  },

  async listMessages(userId, conversationId) {
    await latency(200, 400);
    requireConversationParticipant(mockDb.data, userId, conversationId);
    return clone(
      mockDb.data.messages
        .filter((m) => m.conversationId === conversationId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    );
  },

  async openWithTutor(actorUserId, tutorId, studentUserId) {
    await latency(200, 400);
    return mockDb.mutate((s) => {
      const learner = studentUserId ?? actorUserId;
      requireActsForStudent(s, actorUserId, learner);
      const tutor = s.tutors.find((t) => t.id === tutorId);
      if (!tutor) throw new ServiceError("not_found");
      if (learnerSide(s, learner).includes(tutor.userId)) throw new ServiceError("validation");
      return summarize(s, ensureConversation(s, learner, tutorId), actorUserId);
    });
  },

  async send(senderId, raw) {
    const input = parseInput(sendMessageSchema, raw);
    await latency(150, 300);
    const message = mockDb.mutate((s) => {
      const c = requireConversationParticipant(s, senderId, input.conversationId);
      // Authoritative check: the composer warns first, but the service is what enforces it.
      if (!isUnlocked(s, c.studentId, c.tutorId)) {
        const text = [input.body, ...input.attachments.map((a) => a.name)].join("\n");
        const findings = detectContactDetails(text);
        if (findings.length) throw new ServiceError("contact_blocked", undefined, undefined, findings);
      }
      const attachments: Attachment[] = input.attachments.map((a) => ({ ...a, id: newId("att") }));
      return clone(pushMessage(s, c, senderId, input.body, { attachments }));
    });
    simulateReply(input.conversationId, senderId, input.body, input.attachments.length > 0);
    return message;
  },

  async markRead(userId, conversationId) {
    mockDb.mutate((s) => {
      const c = requireConversationParticipant(s, userId, conversationId);
      const now = new Date().toISOString();
      s.messages.forEach((m) => {
        if (m.conversationId === conversationId && sideOf(c, m.senderId) !== sideOf(c, userId) && !m.readAt) m.readAt = now;
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
