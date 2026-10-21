"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, CheckCheck, FlaskConical, MessageSquareOff, SendHorizontal } from "lucide-react";
import { use, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppLink } from "@/components/layout/app-link";
import { Screen, TopBar } from "@/components/layout/screen";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, TypingDots } from "@/components/ui/primitives";
import { appConfig } from "@/config/app-config";
import type { Message } from "@/domain/types";
import { AuthGate } from "@/features/auth/auth-gate";
import { useConversation, useMarkConversationRead, useMessages, useSendMessage, useTypingIndicator } from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function Bubble({ message, mine, showSimulated }: { message: Message; mine: boolean; showSimulated: boolean }) {
  const { t, time } = useI18n();
  const optimistic = message.id.startsWith("optimistic-");
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 14, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      style={{ originX: mine ? 1 : 0, originY: 1 }}
      className={cn("flex", mine ? "justify-end" : "justify-start")}
    >
      <div className={cn("max-w-[80%]", mine ? "items-end" : "items-start")}>
        <div
          className={cn(
            "rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap",
            mine
              ? "rounded-ee-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white"
              : "rounded-es-lg bg-white text-ink-900 shadow-card",
          )}
        >
          {message.body}
        </div>
        <div className={cn("mt-1 flex items-center gap-1 px-1.5 text-[11px] text-ink-400", mine && "justify-end")}>
          {showSimulated && message.isSimulated && (
            <span className="inline-flex items-center gap-0.5 font-medium text-accent-600">
              <FlaskConical className="size-3" /> {t.demo.simulatedReply} ·
            </span>
          )}
          <span>{time(message.createdAt)}</span>
          {mine &&
            (optimistic ? (
              <Check className="size-3.5 opacity-50" aria-hidden />
            ) : (
              <motion.span key={message.readAt ? "read" : "sent"} initial={{ scale: 0.4 }} animate={{ scale: 1 }}>
                {message.readAt ? <CheckCheck className="size-3.5 text-brand-500" aria-hidden /> : <Check className="size-3.5" aria-hidden />}
              </motion.span>
            ))}
        </div>
      </div>
    </motion.div>
  );
}

function Composer({ conversationId, onSent }: { conversationId: string; onSent: () => void }) {
  const { t } = useI18n();
  const send = useSendMessage(conversationId);
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0;

  const submit = (body = value) => {
    if (!body.trim()) return;
    send.mutate(body.trim());
    setValue("");
    onSent();
    ref.current?.focus();
  };

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-40 mx-auto w-full max-w-[var(--app-max-width)] bg-gradient-to-t from-canvas via-canvas to-canvas/0 px-3 pt-4 pb-3">
      <div className="no-scrollbar mb-2 flex gap-2 overflow-x-auto px-1">
        {t.messages.quickReplies.map((q, i) => (
          <motion.button
            key={q}
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.06 }}
            whileTap={{ scale: 0.94 }}
            onClick={() => submit(q)}
            className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-[13px] font-medium text-brand-700 shadow-card"
          >
            {q}
          </motion.button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-2 rounded-[26px] border border-white/60 bg-white p-2 shadow-nav transition-shadow focus-within:shadow-[0_0_0_4px_var(--color-brand-100)]"
      >
        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={t.messages.inputPlaceholder}
          aria-label={t.messages.inputPlaceholder}
          maxLength={2000}
          className="max-h-[120px] min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-[15px] outline-none placeholder:text-ink-400"
        />
        <motion.button
          type="submit"
          disabled={!canSend}
          animate={{ scale: canSend ? 1 : 0.85, opacity: canSend ? 1 : 0.5 }}
          whileTap={{ scale: 0.85 }}
          transition={{ type: "spring", stiffness: 500, damping: 25 }}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white"
          aria-label={t.messages.send}
        >
          <motion.span animate={{ rotate: canSend ? 0 : -20 }} className="rtl:-scale-x-100">
            <SendHorizontal className="size-[18px]" />
          </motion.span>
        </motion.button>
      </form>
    </div>
  );
}

function Chat({ conversationId }: { conversationId: string }) {
  const { t, l, dayLabel } = useI18n();
  const { session } = useSession();
  const { data: conversation, isLoading: loadingConversation } = useConversation(conversationId);
  const { data: messages, isLoading } = useMessages(conversationId);
  const typing = useTypingIndicator(conversationId);
  const markRead = useMarkConversationRead();
  const bottomRef = useRef<HTMLDivElement>(null);
  const firstScroll = useRef(true);
  const me = session?.user.id;

  const incomingUnread = messages?.filter((m) => m.senderId !== me && !m.readAt).length ?? 0;
  const { mutate: markReadMutate } = markRead;
  useEffect(() => {
    if (incomingUnread > 0 || firstScroll.current) markReadMutate(conversationId);
  }, [incomingUnread, conversationId, markReadMutate]);

  useLayoutEffect(() => {
    if (!messages) return;
    bottomRef.current?.scrollIntoView({ behavior: firstScroll.current ? "instant" : "smooth", block: "end" });
    firstScroll.current = false;
  }, [messages?.length, typing, messages]);

  const grouped = useMemo(() => {
    const out: { key: string; label: string; items: Message[] }[] = [];
    for (const m of messages ?? []) {
      const k = dayKey(m.createdAt);
      const last = out.at(-1);
      if (last?.key === k) last.items.push(m);
      else out.push({ key: k, label: dayLabel(m.createdAt), items: [m] });
    }
    return out;
  }, [messages, dayLabel]);

  if (!loadingConversation && !conversation) {
    return <EmptyState icon={<MessageSquareOff />} title={t.messages.notFound} />;
  }

  const name = conversation ? l(conversation.counterpart.displayName) : "";
  const profileHref = conversation && conversation.studentId === me ? `/tutors/${conversation.tutorId}` : undefined;

  return (
    <>
      <TopBar
        backHref="/messages"
        actions={
          conversation && (
            (profileHref ? (
              <AppLink href={profileHref}>
                <Avatar name={name} hue={conversation.counterpart.avatarHue} size="sm" />
              </AppLink>
            ) : (
              <Avatar name={name} hue={conversation.counterpart.avatarHue} size="sm" />
            ))
          )
        }
        title={name || " "}
      />
      <div className="-mt-2 h-5 text-center text-[12px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={typing ? "typing" : "subtitle"}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className={typing ? "font-semibold text-brand-600" : "text-ink-500"}
          >
            {typing ? t.messages.typing : conversation ? l(conversation.counterpart.subtitle) : ""}
          </motion.span>
        </AnimatePresence>
      </div>

      {appConfig.isPrototype && (
        <motion.p
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mx-auto mt-3 flex w-fit items-center gap-1.5 rounded-full bg-accent-100 px-3 py-1 text-[12px] font-medium text-accent-600"
        >
          <FlaskConical className="size-3.5" /> {t.messages.simulatedNotice}
        </motion.p>
      )}

      <div className="space-y-2 px-4 pt-4 pb-44">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-12 w-2/3 rounded-3xl" />
            <Skeleton className="ms-auto h-12 w-1/2 rounded-3xl" />
            <Skeleton className="h-16 w-3/4 rounded-3xl" />
          </div>
        ) : (
          grouped.map((group) => (
            <div key={group.key} className="space-y-2">
              <div className="flex justify-center py-2">
                <span className="rounded-full bg-ink-100 px-3 py-0.5 text-[11px] font-semibold text-ink-500">{group.label}</span>
              </div>
              {group.items.map((m) => (
                <Bubble key={m.id} message={m} mine={m.senderId === me} showSimulated={appConfig.isPrototype} />
              ))}
            </div>
          ))
        )}
        <AnimatePresence>
          {typing && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
              style={{ originX: 0 }}
              className="flex"
            >
              <div className="rounded-3xl rounded-es-lg bg-white px-4 py-3.5 shadow-card">
                <TypingDots />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
      <Composer conversationId={conversationId} onSent={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })} />
    </>
  );
}

export function ChatScreen({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Screen variant="push" withNav={false}>
      <AuthGate>
        <Chat key={id} conversationId={id} />
      </AuthGate>
    </Screen>
  );
}
