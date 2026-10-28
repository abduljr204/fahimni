"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, CheckCheck, FilePlus2, FileText, Flag, FlaskConical, Lock, MessageSquareOff, Paperclip, SendHorizontal, Unlock, X } from "lucide-react";
import { use, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppLink } from "@/components/layout/app-link";
import { Screen, TopBar } from "@/components/layout/screen";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { BottomSheet } from "@/components/ui/overlays";
import { Skeleton, TypingDots } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { appConfig } from "@/config/app-config";
import { detectContactDetails, redactContactDetails, type ContactFinding } from "@/domain/contact-guard";
import type { Attachment, ConversationSummary, LessonProposal, Message } from "@/domain/types";
import { MAX_ATTACHMENTS, type AttachmentInput } from "@/domain/validation";
import { AuthGate } from "@/features/auth/auth-gate";
import { ReportSheet, type ReportTarget } from "@/features/moderation/report-sheet";
import {
  useConversation,
  useConversationProposals,
  useMarkConversationRead,
  useMessages,
  useSendMessage,
  useTutor,
  useTypingIndicator,
  type OutgoingMessage,
} from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";
import { isServiceError } from "@/services";
import { formatBytes, toAttachment } from "./attachments";
import { ContactGuardSheet } from "./contact-guard-sheet";
import { ProposalCard } from "./proposal-card";
import { ProposalForm } from "./proposal-form";

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Opens a stored attachment. Data URLs can't be opened directly in a new tab, so go through a blob. */
async function openAttachment(a: Pick<Attachment, "url">) {
  const blob = await (await fetch(a.url)).blob();
  window.open(URL.createObjectURL(blob), "_blank", "noopener");
}

function AttachmentList({ attachments, mine, onPreview }: { attachments: Attachment[]; mine: boolean; onPreview: (a: Attachment) => void }) {
  return (
    <div className={cn("grid gap-1.5", attachments.filter((a) => a.mimeType.startsWith("image/")).length > 1 && "grid-cols-2")}>
      {attachments.map((a) =>
        a.mimeType.startsWith("image/") ? (
          <button key={a.id} type="button" onClick={() => onPreview(a)} className="overflow-hidden rounded-2xl bg-ink-100" aria-label={a.name}>
            {/* eslint-disable-next-line @next/next/no-img-element -- data URLs from the prototype store */}
            <img src={a.url} alt={a.name} className="max-h-56 w-full object-cover" />
          </button>
        ) : (
          <button
            key={a.id}
            type="button"
            onClick={() => void openAttachment(a)}
            className={cn("flex items-center gap-2 rounded-2xl px-3 py-2 text-start text-[13px]", mine ? "bg-white/15" : "bg-ink-50")}
          >
            <FileText className="size-5 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate font-semibold">{a.name}</span>
              <span className="opacity-70">{formatBytes(a.sizeBytes)}</span>
            </span>
          </button>
        ),
      )}
    </div>
  );
}

function SystemNote({ message }: { message: Message }) {
  const { t, time } = useI18n();
  const unlocked = message.systemEvent === "contact_unlocked";
  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex justify-center py-1">
      <p
        className={cn(
          "flex max-w-[90%] items-start gap-2 rounded-2xl px-3.5 py-2 text-[12px] font-medium",
          unlocked ? "bg-mint-100 text-mint-600" : "bg-ink-100 text-ink-600",
        )}
      >
        {unlocked ? <Unlock className="mt-0.5 size-3.5 shrink-0" /> : <Lock className="mt-0.5 size-3.5 shrink-0" />}
        <span>
          {unlocked ? t.messages.systemUnlocked : t.messages.systemLocked} · {time(message.createdAt)}
        </span>
      </p>
    </motion.div>
  );
}

function Bubble({
  message,
  mine,
  senderLabel,
  showSimulated,
  onPreview,
  onReport,
}: {
  message: Message;
  mine: boolean;
  senderLabel?: string;
  showSimulated: boolean;
  onPreview: (a: Attachment) => void;
  onReport?: () => void;
}) {
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
        {senderLabel && <p className="mb-1 px-1.5 text-[11px] font-semibold text-ink-500">{senderLabel}</p>}
        <div
          className={cn(
            "space-y-2 rounded-3xl px-4 py-2.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap",
            mine
              ? "rounded-ee-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white"
              : "rounded-es-lg bg-white text-ink-900 shadow-card",
            message.attachments?.length && "px-2 pt-2",
          )}
        >
          {message.attachments?.length ? <AttachmentList attachments={message.attachments} mine={mine} onPreview={onPreview} /> : null}
          {message.body && (
            <p dir="auto" className={cn("text-start", message.attachments?.length && "px-2 pb-0.5")}>
              {message.body}
            </p>
          )}
        </div>
        <div className={cn("mt-1 flex items-center gap-1 px-1.5 text-[11px] text-ink-400", mine && "justify-end")}>
          {showSimulated && message.isSimulated && (
            <span className="inline-flex items-center gap-0.5 font-medium text-accent-600">
              <FlaskConical className="size-3" /> {t.demo.simulatedReply} ·
            </span>
          )}
          <span>{time(message.createdAt)}</span>
          {onReport && !message.isSimulated && (
            <button type="button" onClick={onReport} className="ms-1 inline-flex items-center gap-0.5 text-ink-400 hover:text-coral-600" aria-label={t.report.reportMessage}>
              <Flag className="size-3" />
            </button>
          )}
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

/** Explains what may be shared in this conversation right now. */
function AccessBanner({ unlocked }: { unlocked: boolean }) {
  const { t } = useI18n();
  return (
    <motion.div
      key={unlocked ? "unlocked" : "locked"}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "mx-4 mt-3 flex items-start gap-2.5 rounded-2xl px-3.5 py-2.5 text-[13px] font-medium",
        unlocked ? "bg-mint-100 text-mint-600" : "bg-brand-50 text-brand-800",
      )}
      role="note"
    >
      {unlocked ? <Unlock className="mt-0.5 size-4 shrink-0" /> : <Lock className="mt-0.5 size-4 shrink-0 text-brand-600" />}
      <p>{unlocked ? t.messages.unlockedNotice : t.messages.preBookingNotice}</p>
    </motion.div>
  );
}

function Composer({
  conversation,
  onSent,
  onPropose,
}: {
  conversation: ConversationSummary;
  onSent: () => void;
  onPropose?: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const send = useSendMessage(conversation.id);
  const [value, setValue] = useState("");
  const [files, setFiles] = useState<AttachmentInput[]>([]);
  const [reading, setReading] = useState(false);
  const [guard, setGuard] = useState<{ text: string; findings: ContactFinding[]; files: AttachmentInput[] } | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const canSend = (value.trim().length > 0 || files.length > 0) && !reading;

  const deliver = (message: OutgoingMessage) => {
    send.mutate(message, {
      onError: (error) => {
        // The service has the final say (e.g. a modified client); show the same friendly warning.
        if (isServiceError(error, "contact_blocked")) {
          setValue(message.body);
          setFiles(message.attachments ?? []);
          setGuard({ text: message.body, findings: (error.details as ContactFinding[]) ?? [], files: message.attachments ?? [] });
        } else toast.error(t.common.somethingWrong);
      },
    });
    setValue("");
    setFiles([]);
    onSent();
    ref.current?.focus();
  };

  const submit = (body = value) => {
    const text = body.trim();
    if (!text && files.length === 0) return;
    if (!conversation.unlocked) {
      const findings = detectContactDetails([text, ...files.map((f) => f.name)].join("\n"));
      if (findings.length) {
        setGuard({ text, findings, files });
        return;
      }
    }
    deliver({ body: text, attachments: files });
  };

  const removeAndSend = () => {
    if (!guard) return;
    const inText = guard.findings.filter((f) => f.index + f.length <= guard.text.length);
    const flaggedNames = guard.findings.filter((f) => f.index > guard.text.length).map((f) => f.match);
    const body = redactContactDetails(guard.text, inText).trim();
    const attachments = guard.files.filter((f) => !flaggedNames.some((m) => f.name.includes(m)));
    setGuard(null);
    if (body || attachments.length) deliver({ body, attachments });
  };

  const pickFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    if (files.length + list.length > MAX_ATTACHMENTS) {
      toast.error(t.messages.attachTooMany);
      return;
    }
    setReading(true);
    try {
      const prepared: AttachmentInput[] = [];
      for (const file of Array.from(list)) {
        const result = await toAttachment(file);
        if (result === "type") toast.error(t.messages.attachType);
        else if (result === "size") toast.error(t.messages.attachTooLarge);
        else prepared.push(result);
      }
      setFiles((f) => [...f, ...prepared]);
    } catch {
      toast.error(t.common.somethingWrong);
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
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
        {onPropose && (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileTap={{ scale: 0.94 }}
            onClick={onPropose}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-600 px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-card"
          >
            <FilePlus2 className="size-4" /> {t.messages.sendProposal}
          </motion.button>
        )}
        {!value &&
          files.length === 0 &&
          t.messages.quickReplies.map((q, i) => (
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

      <AnimatePresence>
        {files.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-2 flex flex-wrap gap-2 px-1">
            {files.map((f, i) => (
              <span key={`${f.name}-${i}`} className="flex max-w-[60%] items-center gap-1.5 rounded-full bg-white py-1 ps-1 pe-2 text-[12px] font-medium shadow-card">
                {f.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local preview
                  <img src={f.url} alt="" className="size-6 rounded-full object-cover" />
                ) : (
                  <FileText className="size-5 text-brand-600" />
                )}
                <span className="truncate">{f.name}</span>
                <button type="button" onClick={() => setFiles((all) => all.filter((_, j) => j !== i))} aria-label={t.messages.removeAttachment}>
                  <X className="size-3.5 text-ink-400" />
                </button>
              </span>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-end gap-1.5 rounded-[26px] border border-white/60 bg-white p-2 shadow-nav transition-shadow focus-within:shadow-[0_0_0_4px_var(--color-brand-100)]"
      >
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          hidden
          onChange={(e) => void pickFiles(e.target.files)}
        />
        <motion.button
          type="button"
          whileTap={{ scale: 0.85 }}
          onClick={() => fileInput.current?.click()}
          disabled={reading || files.length >= MAX_ATTACHMENTS}
          className="grid size-10 shrink-0 place-items-center rounded-full text-ink-500 transition-colors hover:bg-ink-50 disabled:opacity-40"
          aria-label={t.messages.attach}
          title={t.messages.attachHint}
        >
          <Paperclip className="size-5" />
        </motion.button>
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
          className="max-h-[120px] min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-ink-400"
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
      {files.length > 0 && <p className="mt-1.5 px-2 text-[11px] text-ink-500">{t.messages.attachHint}</p>}

      <ContactGuardSheet
        open={Boolean(guard)}
        text={guard?.text ?? ""}
        findings={guard?.findings ?? []}
        onEdit={() => {
          if (guard) {
            setValue(guard.text);
            setFiles(guard.files);
          }
          setGuard(null);
          window.setTimeout(() => ref.current?.focus(), 250);
        }}
        onRemoveAndSend={removeAndSend}
      />
    </div>
  );
}

function Chat({ conversationId }: { conversationId: string }) {
  const { t, l, fmt, dayLabel } = useI18n();
  const { session } = useSession();
  const { data: conversation, isLoading: loadingConversation, error } = useConversation(conversationId);
  const { data: messages, isLoading } = useMessages(conversationId);
  const { data: proposals } = useConversationProposals(conversationId);
  const typing = useTypingIndicator(conversationId);
  const markRead = useMarkConversationRead();
  const bottomRef = useRef<HTMLDivElement>(null);
  const firstScroll = useRef(true);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [proposing, setProposing] = useState(false);
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
  const me = session?.user.id;
  const viewerIsTutor = Boolean(conversation && conversation.tutorUserId === me);
  const { data: tutor } = useTutor(viewerIsTutor ? conversation?.tutorId : undefined);

  const proposalMap = useMemo(() => new Map<string, LessonProposal>((proposals ?? []).map((p) => [p.id, p])), [proposals]);
  const incomingUnread = messages?.filter((m) => m.senderId !== me && !m.readAt).length ?? 0;
  const { mutate: markReadMutate } = markRead;
  useEffect(() => {
    if (conversation && (incomingUnread > 0 || firstScroll.current)) markReadMutate(conversationId);
  }, [incomingUnread, conversationId, markReadMutate, conversation]);

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

  if ((!loadingConversation && !conversation) || error) {
    return <EmptyState icon={<MessageSquareOff />} title={t.messages.notFound} />;
  }

  const name = conversation ? l(conversation.counterpart.displayName) : "";
  const profileHref = conversation && !viewerIsTutor ? `/tutors/${conversation.tutorId}` : undefined;
  const child = session?.managedStudents?.find((s) => s.userId === conversation?.studentId);
  const subtitle = typing
    ? t.messages.typing
    : conversation?.guardian && viewerIsTutor
      ? fmt(t.messages.managedBy, { name: l(conversation.guardian.displayName) })
      : child
        ? fmt(t.messages.onBehalfOf, { name: l(child.displayName) })
        : conversation
          ? l(conversation.counterpart.subtitle)
          : "";

  // Name a sender only when it isn't obvious: a parent writing for their child.
  const senderLabel = (m: Message) =>
    m.senderId !== me && conversation?.guardian && m.senderId === conversation.guardian.id
      ? fmt(t.messages.parentLabel, { name: l(conversation.guardian.displayName) })
      : undefined;

  return (
    <>
      <TopBar
        backHref="/messages"
        actions={
          conversation && (
            <>
              <button
                type="button"
                onClick={() => setReporting({ kind: "report", targetUserId: conversation.counterpart.id, conversationId })}
                className="grid size-9 place-items-center rounded-full text-ink-400 hover:bg-white hover:text-coral-600"
                aria-label={t.report.reportUser}
                title={t.report.reportUser}
              >
                <Flag className="size-4" />
              </button>
              {profileHref ? (
                <AppLink href={profileHref}>
                  <Avatar name={name} hue={conversation.counterpart.avatarHue} size="sm" />
                </AppLink>
              ) : (
                <Avatar name={name} hue={conversation.counterpart.avatarHue} size="sm" />
              )}
            </>
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
            {subtitle}
          </motion.span>
        </AnimatePresence>
      </div>

      {conversation && <AccessBanner unlocked={conversation.unlocked} />}
      {appConfig.isPrototype && (
        <motion.p
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mx-auto mt-2 flex w-fit items-center gap-1.5 rounded-full bg-accent-100 px-3 py-1 text-[12px] font-medium text-accent-600"
        >
          <FlaskConical className="size-3.5" /> {t.messages.simulatedNotice}
        </motion.p>
      )}

      <div className="space-y-2 px-4 pt-4 pb-56">
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
              {group.items.map((m) => {
                if (m.kind === "system") return <SystemNote key={m.id} message={m} />;
                const proposal = m.proposalId ? proposalMap.get(m.proposalId) : undefined;
                if (m.kind === "proposal") {
                  return proposal ? <ProposalCard key={m.id} proposal={proposal} viewerIsTutor={viewerIsTutor} showSimulated={appConfig.isPrototype} /> : <Skeleton key={m.id} className="mx-auto h-48 w-[92%] rounded-3xl" />;
                }
                const mine = m.senderId === me;
                return (
                  <Bubble
                    key={m.id}
                    message={m}
                    mine={mine}
                    senderLabel={senderLabel(m)}
                    showSimulated={appConfig.isPrototype}
                    onPreview={setPreview}
                    onReport={mine ? undefined : () => setReporting({ kind: "report", targetUserId: m.senderId, messageId: m.id, conversationId, context: m.body.slice(0, 140) })}
                  />
                );
              })}
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

      {conversation && (
        <Composer
          conversation={conversation}
          onSent={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
          onPropose={viewerIsTutor && tutor ? () => setProposing(true) : undefined}
        />
      )}
      {viewerIsTutor && tutor && conversation && (
        <ProposalForm open={proposing} onClose={() => setProposing(false)} conversationId={conversation.id} tutor={tutor} unlocked={conversation.unlocked} />
      )}

      <ReportSheet target={reporting} onClose={() => setReporting(null)} />
      <BottomSheet open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.name}>
        {preview && (
          // eslint-disable-next-line @next/next/no-img-element -- data URLs from the prototype store
          <img src={preview.url} alt={preview.name} className="w-full rounded-2xl" />
        )}
      </BottomSheet>
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
