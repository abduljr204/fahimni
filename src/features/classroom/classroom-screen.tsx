"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  CameraOff,
  CircleOff,
  FileText,
  FlaskConical,
  Info,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  Paperclip,
  SendHorizontal,
  Settings2,
  ShieldAlert,
  Video,
  VideoOff,
  WifiOff,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/overlays";
import { Spinner } from "@/components/ui/spinner";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { appConfig } from "@/config/app-config";
import type { ClassroomDenial } from "@/domain/access";
import type { ClassroomTicket } from "@/domain/types";
import { AuthGate } from "@/features/auth/auth-gate";
import { formatBytes, toAttachment } from "@/features/messages/attachments";
import { useJoinClassroom } from "@/hooks/use-data";
import { useI18n } from "@/i18n/i18n-provider";
import { cn } from "@/lib/cn";
import { isServiceError } from "@/services";
import { getVideoProvider, type CallState, type VideoCall } from "@/services/video";

// ─── Media ──────────────────────────────────────────────────────────────────

function VideoView({ stream, muted, mirror, className }: { stream: MediaStream; muted?: boolean; mirror?: boolean; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={cn("size-full object-cover", mirror && "-scale-x-100", className)} />;
}

/** Stand-in for the other person's camera in the prototype. Always labelled as simulated. */
function SimulatedVideo({ name, hue, speaking }: { name: string; hue: number; speaking: boolean }) {
  return (
    <div className="relative grid size-full place-items-center overflow-hidden" style={{ background: `linear-gradient(135deg, hsl(${hue} 55% 32%), hsl(${(hue + 40) % 360} 60% 18%))` }}>
      <motion.span
        className="absolute size-[60%] rounded-full bg-white/10 blur-2xl"
        animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 6, repeat: Infinity }}
        aria-hidden
      />
      <motion.div animate={speaking ? { scale: [1, 1.04, 1] } : { scale: 1 }} transition={{ duration: 0.6, repeat: speaking ? Infinity : 0 }}>
        <div className={cn("rounded-full p-1.5 transition-shadow", speaking && "shadow-[0_0_0_4px_rgb(52_211_158/0.8)]")}>
          <Avatar name={name} hue={hue} size="xl" />
        </div>
      </motion.div>
    </div>
  );
}

function Tile({
  children,
  label,
  muted,
  badge,
  className,
}: {
  children: ReactNode;
  label: string;
  muted?: boolean;
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative overflow-hidden rounded-3xl bg-ink-900", className)}>
      {children}
      <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-ink-950/60 px-2.5 py-1 text-[12px] font-semibold backdrop-blur">
          {muted && <MicOff className="size-3.5 shrink-0 text-coral-400" />}
          <span className="truncate">{label}</span>
        </span>
        {badge}
      </div>
    </div>
  );
}

function useCallState(call: VideoCall): CallState {
  return useSyncExternalStore(
    (l) => call.subscribe(l),
    () => call.getState(),
    () => call.getState(),
  );
}

function useElapsed(since?: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [since]);
  return since ? Math.max(0, now - since) : 0;
}

const mmss = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

// ─── Panels ─────────────────────────────────────────────────────────────────

function ChatPanel({ call, state, ticket }: { call: VideoCall; state: CallState; ticket: ClassroomTicket }) {
  const { t, l, time } = useI18n();
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  // Braces matter: newer browsers return a Promise from scrollIntoView, which React would treat as a cleanup.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [state.chat.length]);
  const nameOf = (userId: string) =>
    userId === ticket.me.userId ? t.classroom.you : l(ticket.participants.find((p) => p.userId === userId)?.displayName);

  return (
    <div className="flex h-full min-h-72 flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto pb-3">
        {state.chat.length === 0 && <p className="py-8 text-center text-[13px] text-ink-400">{t.classroom.noMessages}</p>}
        {state.chat.map((m) => (
          <div key={m.id} className={cn("flex flex-col", m.senderId === ticket.me.userId ? "items-end" : "items-start")}>
            <span className="px-1 text-[11px] text-ink-400">
              {nameOf(m.senderId)} · {time(new Date(m.at))}
              {m.simulated && ` · ${t.demo.simulated}`}
            </span>
            <span className={cn("max-w-[85%] rounded-2xl px-3 py-2 text-[14px]", m.senderId === ticket.me.userId ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-900")}>
              {m.body}
            </span>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          call.sendChat(text);
          setText("");
        }}
        className="flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t.classroom.chatPlaceholder}
          aria-label={t.classroom.chatPlaceholder}
          className="h-11 min-w-0 flex-1 rounded-2xl border border-ink-200 bg-white px-3 text-[14px] text-ink-900 outline-none focus:border-brand-400"
        />
        <Button size="icon" type="submit" disabled={!text.trim()} aria-label={t.messages.send}>
          <SendHorizontal className="size-4 rtl:-scale-x-100" />
        </Button>
      </form>
    </div>
  );
}

function MaterialsPanel({ call, state, ticket }: { call: VideoCall; state: CallState; ticket: ClassroomTicket }) {
  const { t, l } = useI18n();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const share = async (file?: File) => {
    if (!file) return;
    const result = await toAttachment(file);
    if (result === "type") toast.error(t.messages.attachType);
    else if (result === "size") toast.error(t.messages.attachTooLarge);
    else call.shareMaterial(result);
    if (input.current) input.current.value = "";
  };
  const open = async (url: string) => window.open(URL.createObjectURL(await (await fetch(url)).blob()), "_blank", "noopener");

  return (
    <div className="space-y-3">
      <input ref={input} type="file" hidden accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => void share(e.target.files?.[0])} />
      <Button variant="secondary" block onClick={() => input.current?.click()}>
        <Paperclip className="size-4" /> {t.classroom.shareMaterial}
      </Button>
      {state.materials.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-ink-400">{t.classroom.noMaterials}</p>
      ) : (
        state.materials.map((m) => (
          <button key={m.id} type="button" onClick={() => void open(m.url)} className="flex w-full items-center gap-3 rounded-2xl bg-ink-50 p-3 text-start">
            {m.mimeType.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element -- local data URL
              <img src={m.url} alt="" className="size-11 rounded-xl object-cover" />
            ) : (
              <span className="grid size-11 place-items-center rounded-xl bg-white text-brand-600">
                <FileText className="size-5" />
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold text-ink-900">{m.name}</span>
              <span className="text-[12px] text-ink-500">
                {m.sharedBy === ticket.me.userId ? t.classroom.you : l(ticket.participants.find((p) => p.userId === m.sharedBy)?.displayName)} · {formatBytes(m.sizeBytes)}
              </span>
            </span>
          </button>
        ))
      )}
    </div>
  );
}

function SidePanel({ call, state, ticket }: { call: VideoCall; state: CallState; ticket: ClassroomTicket }) {
  const { t } = useI18n();
  const [tab, setTab] = useState<"chat" | "materials">("chat");
  return (
    <div className="flex h-full flex-col gap-3">
      <Tabs
        value={tab}
        onChange={setTab}
        items={[
          { value: "chat", label: t.classroom.chat, badge: state.chat.length || undefined },
          { value: "materials", label: t.classroom.materials, badge: state.materials.length || undefined },
        ]}
      />
      <div className="min-h-0 flex-1">{tab === "chat" ? <ChatPanel call={call} state={state} ticket={ticket} /> : <MaterialsPanel call={call} state={state} ticket={ticket} />}</div>
    </div>
  );
}

// ─── Call ───────────────────────────────────────────────────────────────────

function ControlButton({ label, active = true, danger, onClick, children }: { label: string; active?: boolean; danger?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.88 }}
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={!danger ? active : undefined}
      className={cn(
        "grid size-12 shrink-0 place-items-center rounded-2xl transition-colors md:size-13",
        danger ? "bg-coral-500 text-white hover:bg-coral-600" : active ? "bg-white/12 text-white hover:bg-white/20" : "bg-white text-ink-900",
      )}
    >
      {children}
    </motion.button>
  );
}

function StatusPill({ state, waitingFor }: { state: CallState; waitingFor: string }) {
  const { t, fmt } = useI18n();
  const map = {
    connecting: { text: t.classroom.connecting, dot: "bg-accent-400" },
    waiting: { text: fmt(t.classroom.waiting, { name: waitingFor }), dot: "bg-accent-400" },
    connected: { text: t.classroom.connected, dot: "bg-mint-400" },
    reconnecting: { text: t.classroom.reconnecting, dot: "bg-coral-400" },
    ended: { text: t.classroom.ended, dot: "bg-ink-400" },
  }[state.status];
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-semibold" role="status">
      <span className={cn("size-2 shrink-0 rounded-full", map.dot, state.status !== "connected" && "animate-pulse")} />
      <span className="truncate">{map.text}</span>
    </span>
  );
}

/**
 * Owns the call's lifetime. `start()` can follow `leave()`, so React's development
 * double-run of effects (start → leave → start) ends up connected, and Rejoin works.
 */
function Call({ ticket, onLeave }: { ticket: ClassroomTicket; onLeave: () => void }) {
  const [call] = useState(() => getVideoProvider().connect(ticket));
  useEffect(() => {
    call.start();
    return () => call.leave();
  }, [call]);
  return <CallView call={call} ticket={ticket} onLeave={onLeave} />;
}

function CallView({ call, ticket, onLeave }: { call: VideoCall; ticket: ClassroomTicket; onLeave: () => void }) {
  const { t, l, fmt } = useI18n();
  const toast = useToast();
  const state = useCallState(call);
  const [panelOpen, setPanelOpen] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const elapsed = useElapsed(state.connectedAt);
  const isTutor = ticket.me.role === "tutor";
  const remote = state.remote[0];
  const remoteName = remote ? l(remote.displayName) : "";
  const lessonMs = ticket.lesson.durationMinutes * 60_000;
  const remainingMin = Math.ceil((lessonMs - elapsed) / 60_000);

  useEffect(() => {
    if (state.local.mediaError === "no_devices") toast.info(t.classroom.noDevices);
  }, [state.local.mediaError, toast, t]);

  // Leaving shows the "ended" screen, where the person can rejoin or go back.
  const leave = () => call.leave();

  const toggleShare = async () => {
    if (state.local.screen) return call.stopScreenShare();
    const result = await call.startScreenShare();
    if (result === "unsupported") toast.error(t.classroom.shareUnsupported);
  };

  const remoteTile = remote && (
    <Tile
      label={`${remoteName} · ${t.classroom.roles[remote.role]}`}
      muted={!remote.micOn}
      className="size-full"
      badge={
        remote.simulated && (
          <span className="flex items-center gap-1 rounded-full bg-accent-400 px-2 py-0.5 text-[11px] font-bold text-ink-950">
            <FlaskConical className="size-3" /> {t.classroom.simulatedVideo}
          </span>
        )
      }
    >
      {remote.connected ? (
        remote.stream ? <VideoView stream={remote.stream} /> : <SimulatedVideo name={remoteName} hue={remote.avatarHue} speaking={remote.speaking} />
      ) : (
        <div className="grid size-full place-items-center p-6 text-center">
          <div>
            <Avatar name={remoteName} hue={remote.avatarHue} size="lg" className="mx-auto opacity-60" />
            <p className="mt-3 text-[14px] text-white/70">{fmt(t.classroom.waiting, { name: remoteName })}</p>
            <Spinner className="mx-auto mt-3 size-5 text-white/60" />
          </div>
        </div>
      )}
    </Tile>
  );

  const localTile = (
    <Tile label={`${t.classroom.you} · ${t.classroom.roles[ticket.me.role]}`} muted={!state.local.micOn} className="size-full">
      {state.local.stream && state.local.camOn ? (
        <VideoView stream={state.local.stream} muted mirror />
      ) : (
        <div className="grid size-full place-items-center">
          <div className="text-center">
            <Avatar name={l(ticket.me.displayName)} hue={ticket.me.avatarHue} size="md" className="mx-auto" />
            <CameraOff className="mx-auto mt-2 size-4 text-white/50" />
          </div>
        </div>
      )}
    </Tile>
  );

  if (state.status === "ended") {
    return (
      <div className="grid min-h-dvh place-items-center bg-ink-950 p-6 text-center text-white">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="max-w-sm">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-white/10">
            <LogOut className="size-7" />
          </span>
          <h1 className="mt-5 text-2xl font-extrabold">{t.classroom.ended}</h1>
          <p className="mt-2 text-[14px] text-white/70">{t.classroom.endedBody}</p>
          <div className="mt-6 grid gap-2">
            <Button size="lg" onClick={() => call.start()}>
              {t.classroom.rejoin}
            </Button>
            <Button size="lg" variant="ghost" className="text-white hover:bg-white/10" onClick={onLeave}>
              {t.classroom.backToLessons}
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-ink-950 text-white">
      {/* Top bar */}
      <header className="flex items-center gap-2 px-3 pt-3 pb-2 md:px-5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold">{fmt(t.classroom.lessonWith, { subject: l(ticket.lesson.subject), name: remoteName })}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusPill state={state} waitingFor={remoteName} />
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-semibold">
              <CircleOff className="size-3" /> {t.classroom.notRecorded}
            </span>
          </div>
        </div>
        <div className="text-end tabular-nums" aria-live="off">
          <p className="text-[15px] font-bold">{mmss(elapsed)}</p>
          <p className={cn("text-[11px]", remainingMin < 0 ? "text-coral-300" : "text-white/60")}>
            {state.connectedAt ? (remainingMin < 0 ? t.classroom.overtime : fmt(t.classroom.remaining, { n: remainingMin })) : `${ticket.lesson.durationMinutes} ${t.common.minutes}`}
          </p>
        </div>
        <button type="button" onClick={() => setInfoOpen(true)} className="grid size-10 place-items-center rounded-full bg-white/10" aria-label={t.classroom.lessonInfo}>
          <Info className="size-5" />
        </button>
      </header>

      {state.simulated && (
        <p className="mx-3 mb-2 flex items-start gap-2 rounded-2xl bg-accent-400/15 px-3 py-2 text-[12px] font-medium text-accent-200 md:mx-5">
          <FlaskConical className="mt-0.5 size-3.5 shrink-0" /> {t.classroom.simulatedBanner}
        </p>
      )}

      {/* Stage */}
      <div className="flex min-h-0 flex-1 gap-4 px-3 md:px-5">
        <div className="relative min-h-0 flex-1">
          {state.local.screen ? (
            <div className="grid size-full grid-rows-[1fr_auto] gap-3">
              <Tile label={t.classroom.sharing} className="size-full">
                <VideoView stream={state.local.screen} muted className="object-contain" />
              </Tile>
              <div className="grid h-28 grid-cols-2 gap-3 md:h-36">
                {remoteTile}
                {localTile}
              </div>
            </div>
          ) : (
            <div className="grid size-full gap-3 md:grid-cols-2">
              <div className="min-h-0">{remoteTile}</div>
              <div className="absolute end-3 top-3 z-10 h-36 w-28 overflow-hidden rounded-3xl shadow-2xl ring-2 ring-ink-950 md:static md:h-auto md:w-auto md:shadow-none md:ring-0">
                {localTile}
              </div>
            </div>
          )}

          <AnimatePresence>
            {state.status === "reconnecting" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 grid place-items-center rounded-3xl bg-ink-950/70 backdrop-blur-sm">
                <div className="text-center">
                  <WifiOff className="mx-auto size-8 text-coral-300" />
                  <p className="mt-3 font-semibold">{t.classroom.reconnecting}</p>
                  <Spinner className="mx-auto mt-3 size-5" />
                </div>
              </motion.div>
            )}
            {state.status === "connecting" && state.local.mediaReady && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-20 grid place-items-center rounded-3xl bg-ink-950/70">
                <div className="text-center">
                  <Spinner className="mx-auto size-6" />
                  <p className="mt-3 font-semibold">{t.classroom.connecting}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Desktop side panel */}
        <aside className="hidden w-[340px] shrink-0 rounded-3xl bg-white p-4 text-ink-900 md:block">
          <SidePanel call={call} state={state} ticket={ticket} />
        </aside>
      </div>

      {/* Controls */}
      <nav className="safe-bottom flex items-center justify-center gap-2 px-3 pt-3 pb-4 md:gap-3" aria-label={t.classroom.title}>
        <ControlButton label={state.local.micOn ? t.classroom.mute : t.classroom.unmute} active={state.local.micOn} onClick={() => call.setMicEnabled(!state.local.micOn)}>
          {state.local.micOn ? <Mic className="size-5" /> : <MicOff className="size-5" />}
        </ControlButton>
        <ControlButton label={state.local.camOn ? t.classroom.cameraOff : t.classroom.cameraOn} active={state.local.camOn} onClick={() => call.setCameraEnabled(!state.local.camOn)}>
          {state.local.camOn ? <Video className="size-5" /> : <VideoOff className="size-5" />}
        </ControlButton>
        {isTutor && (
          <ControlButton label={state.local.screen ? t.classroom.stopShare : t.classroom.share} active={!state.local.screen} onClick={() => void toggleShare()}>
            <MonitorUp className="size-5" />
          </ControlButton>
        )}
        <ControlButton label={t.classroom.devices} onClick={() => setDevicesOpen(true)}>
          <Settings2 className="size-5" />
        </ControlButton>
        <span className="md:hidden">
          <ControlButton label={t.classroom.chat} onClick={() => setPanelOpen(true)}>
            <MessageSquare className="size-5" />
          </ControlButton>
        </span>
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          onClick={leave}
          className="flex h-12 items-center gap-2 rounded-2xl bg-coral-500 px-4 text-[14px] font-bold text-white hover:bg-coral-600"
        >
          <LogOut className="size-5 rtl:-scale-x-100" /> <span className="hidden sm:inline">{t.classroom.leave}</span>
          <span className="sr-only sm:hidden">{t.classroom.leave}</span>
        </motion.button>
      </nav>

      {/* Permission denied: shown before entering the room */}
      <AnimatePresence>
        {state.local.mediaError === "denied" && !state.local.mediaReady && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-ink-950/90 p-6">
            <div className="max-w-sm rounded-[28px] bg-white p-6 text-center text-ink-900">
              <ShieldAlert className="mx-auto size-10 text-coral-500" />
              <h2 className="mt-4 text-lg font-extrabold">{t.classroom.permissionTitle}</h2>
              <p className="mt-2 text-[14px] text-ink-600">{t.classroom.permissionBody}</p>
              <div className="mt-5 grid gap-2">
                <Button onClick={() => void call.requestMedia()}>{t.classroom.tryAgain}</Button>
                <Button variant="outline" onClick={() => call.continueWithoutMedia()}>
                  {t.classroom.joinWithout}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomSheet open={panelOpen} onClose={() => setPanelOpen(false)} title={t.classroom.chat}>
        <SidePanel call={call} state={state} ticket={ticket} />
      </BottomSheet>

      <BottomSheet open={devicesOpen} onClose={() => setDevicesOpen(false)} title={t.classroom.devices}>
        <div className="space-y-4">
          {(["camera", "microphone"] as const).map((kind) => {
            const list = kind === "camera" ? state.devices.cameras : state.devices.microphones;
            const value = kind === "camera" ? state.selected.cameraId : state.selected.microphoneId;
            return (
              <label key={kind} className="block">
                <span className="mb-1.5 block text-sm font-semibold">{kind === "camera" ? t.classroom.camera : t.classroom.microphone}</span>
                <select
                  value={value ?? ""}
                  onChange={(e) => void call.selectDevice(kind, e.target.value)}
                  disabled={list.length === 0}
                  className="h-12 w-full rounded-2xl border border-ink-200 bg-white px-3 text-[14px] disabled:bg-ink-50"
                >
                  <option value="">{t.classroom.defaultDevice}</option>
                  {list.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `${kind === "camera" ? t.classroom.camera : t.classroom.microphone} ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
          {call.simulateConnectionDrop && (
            <Button
              variant="outline"
              block
              onClick={() => {
                setDevicesOpen(false);
                call.simulateConnectionDrop?.();
              }}
            >
              <WifiOff className="size-4" /> {t.classroom.simulateDrop}
            </Button>
          )}
        </div>
      </BottomSheet>

      <BottomSheet open={infoOpen} onClose={() => setInfoOpen(false)} title={t.classroom.lessonInfo}>
        <div className="space-y-3 text-[14px] text-ink-700">
          <p className="font-bold text-ink-900">{l(ticket.lesson.subject)}</p>
          {ticket.lesson.objectives && <p>🎯 {ticket.lesson.objectives}</p>}
          <ul className="space-y-1.5">
            {ticket.participants.map((p) => (
              <li key={p.userId} className="flex items-center gap-2">
                <Avatar name={l(p.displayName)} hue={p.avatarHue} size="sm" />
                <span>
                  {l(p.displayName)} · {t.classroom.roles[p.role]}
                  {p.userId === ticket.me.userId && ` (${t.classroom.you})`}
                </span>
              </li>
            ))}
          </ul>
          <p className="flex items-center gap-1.5 rounded-2xl bg-ink-50 p-3 text-[13px]">
            <CircleOff className="size-4 shrink-0" /> {t.classroom.notRecorded}
          </p>
        </div>
      </BottomSheet>
    </div>
  );
}

// ─── Access ─────────────────────────────────────────────────────────────────

interface ClosedDetails {
  reason: ClassroomDenial;
  opensAt: string;
  closesAt: string;
}

function Denied({ title, body, onBack }: { title: string; body: string; onBack: () => void }) {
  const { t } = useI18n();
  return (
    <div className="grid min-h-dvh place-items-center bg-ink-950 p-6 text-center text-white">
      <div className="max-w-sm">
        <ShieldAlert className="mx-auto size-12 text-accent-300" />
        <h1 className="mt-4 text-xl font-extrabold">{title}</h1>
        <p className="mt-2 text-[14px] text-white/70">{body}</p>
        <Button className="mt-6" onClick={onBack}>
          {t.classroom.backToLessons}
        </Button>
      </div>
    </div>
  );
}

function Classroom({ bookingId, demo }: { bookingId: string; demo: boolean }) {
  const { t, fmt, dayLabel, time, href } = useI18n();
  const router = useRouter();
  const join = useJoinClassroom();
  const { mutate } = join;
  // The prototype's "enter now" shortcut only skips the schedule; the service still checks
  // that the user is a participant and that the lesson is confirmed and paid.
  const demoIgnoreSchedule = appConfig.isPrototype && demo;

  useEffect(() => {
    mutate({ bookingId, demoIgnoreSchedule });
  }, [mutate, bookingId, demoIgnoreSchedule]);

  const back = () => router.push(href("/lessons"));

  if (join.isPending || join.isIdle) {
    return (
      <div className="grid min-h-dvh place-items-center bg-ink-950 text-white">
        <div className="text-center">
          <Spinner className="mx-auto size-6" />
          <p className="mt-3 text-[14px] text-white/70">{t.classroom.entering}</p>
        </div>
      </div>
    );
  }

  if (join.error) {
    if (isServiceError(join.error, "classroom_closed")) {
      const d = join.error.details as ClosedDetails;
      const at = (iso: string) => `${dayLabel(iso)} ${time(iso)}`;
      const body = {
        not_online: t.classroom.notOnline,
        not_paid: t.classroom.notPaid,
        not_confirmed: t.classroom.notConfirmed,
        too_early: fmt(t.classroom.closedBody, { time: at(d.opensAt), end: at(d.closesAt) }),
        ended: fmt(t.classroom.closedBody, { time: at(d.opensAt), end: at(d.closesAt) }),
        not_participant: t.classroom.deniedBody,
      }[d.reason];
      return <Denied title={d.reason === "ended" ? t.classroom.endedTitle : t.classroom.closedTitle} body={body} onBack={back} />;
    }
    return <Denied title={t.classroom.deniedTitle} body={t.classroom.deniedBody} onBack={back} />;
  }

  return <Call ticket={join.data} onLeave={back} />;
}

export function ClassroomScreen({ params, searchParams }: { params: Promise<{ bookingId: string }>; searchParams: Promise<{ demo?: string }> }) {
  const { bookingId } = use(params);
  const { demo } = use(searchParams);
  return (
    // Full-screen layer above the phone frame: the classroom also works on large screens.
    <div className="fixed inset-0 z-[55] bg-ink-950">
      <AuthGate>
        <Classroom key={bookingId} bookingId={bookingId} demo={demo === "1"} />
      </AuthGate>
    </div>
  );
}
