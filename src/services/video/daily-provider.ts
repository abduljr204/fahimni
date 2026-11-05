import type { DailyCall, DailyParticipant } from "@daily-co/daily-js";
import type { ClassroomTicket } from "@/domain/types";
import type { CallState, RemoteParticipant, ScreenShareResult, VideoCall, VideoProvider } from "./contracts";

/**
 * Real calls through Daily (https://docs.daily.co/reference/daily-js). Daily carries the audio
 * and video, including poor-network fallbacks; the classroom screen stays ours. The library is
 * loaded on demand so it never weighs down other pages.
 */

let seq = 0;
const chatId = () => `chat-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** A track counts as on unless the user or the browser turned it off. */
const isOn = (state?: string) => state !== undefined && state !== "off" && state !== "blocked";

function usableTrack(p: DailyParticipant, key: "video" | "audio" | "screenVideo"): MediaStreamTrack | undefined {
  const track = p.tracks[key];
  return track?.state === "playable" ? track.persistentTrack : undefined;
}

class DailyVideoCall implements VideoCall {
  private state: CallState;
  private listeners = new Set<(s: CallState) => void>();
  private call?: DailyCall;
  /** Bumped by start/leave, so async work from an abandoned attempt stops. */
  private generation = 0;
  private pendingDestroy: Promise<void> = Promise.resolve();
  private joined = false;
  private interrupted = false;
  private activePeer?: string;
  private shareResolver?: (r: ScreenShareResult) => void;
  /** Same tracks keep the same MediaStream, so <video> elements don't restart on every event. */
  private streams = new Map<string, { key: string; stream: MediaStream }>();

  constructor(private readonly ticket: ClassroomTicket) {
    this.state = this.initialState();
  }

  private initialState(): CallState {
    return {
      status: "connecting",
      simulated: false,
      materialsEnabled: false,
      local: { micOn: true, camOn: true, mediaError: null, mediaReady: false },
      remote: this.ticket.participants
        .filter((p) => p.userId !== this.ticket.me.userId)
        .map<RemoteParticipant>((p) => ({ ...p, connected: false, micOn: false, camOn: false, speaking: false, simulated: false })),
      chat: this.state?.chat ?? [],
      materials: [],
      devices: { cameras: [], microphones: [] },
      selected: {},
    };
  }

  getState() {
    return this.state;
  }

  subscribe(listener: (s: CallState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(patch: Partial<CallState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l(this.state));
  }

  private setLocal(patch: Partial<CallState["local"]>) {
    this.set({ local: { ...this.state.local, ...patch } });
  }

  start() {
    const generation = ++this.generation;
    this.joined = false;
    this.interrupted = false;
    this.streams.clear();
    this.state = this.initialState();
    this.listeners.forEach((l) => l(this.state));
    void this.boot(generation);
  }

  private async boot(generation: number) {
    // Daily allows one call object at a time, so the previous one must be fully gone.
    await this.pendingDestroy;
    const { default: Daily } = await import("@daily-co/daily-js");
    if (generation !== this.generation) return;
    const call = Daily.createCallObject({ subscribeToTracksAutomatically: true });
    this.call = call;
    this.wire(call);
    await this.requestMedia();
  }

  private wire(call: DailyCall) {
    const sync = () => this.call === call && this.sync();
    call.on("participant-joined", sync);
    call.on("participant-updated", sync);
    call.on("participant-left", sync);
    call.on("track-started", sync);
    call.on("track-stopped", sync);
    call.on("joined-meeting", () => {
      if (this.call !== call) return;
      this.joined = true;
      this.sync();
      void this.refreshDevices();
    });
    call.on("left-meeting", () => {
      if (this.call === call && this.state.status !== "ended") this.set({ status: "ended" });
    });
    call.on("error", (e) => {
      // Fatal: expired token, deleted room, ejected from the room…
      console.error("Daily call error:", e?.errorMsg, e?.error?.type);
      if (this.call === call) this.set({ status: "ended", connectionFailed: true });
    });
    call.on("network-connection", (e) => {
      if (this.call !== call || e?.type === "peer-to-peer") return;
      if (e?.event === "interrupted") this.interrupted = true;
      if (e?.event === "connected") this.interrupted = false;
      this.sync();
    });
    call.on("active-speaker-change", (e) => {
      this.activePeer = e?.activeSpeaker?.peerId;
      sync();
    });
    call.on("app-message", (e) => {
      if (this.call !== call || e?.data?.kind !== "chat" || typeof e.data.body !== "string") return;
      const sender = call.participants()[e.fromId]?.user_id;
      if (!sender || !this.ticket.participants.some((p) => p.userId === sender)) return;
      this.set({ chat: [...this.state.chat, { id: String(e.data.id ?? chatId()), senderId: sender, body: e.data.body.slice(0, 2000), at: Date.now() }] });
    });
    call.on("local-screen-share-started", () => {
      this.shareResolver?.("ok");
      this.shareResolver = undefined;
      sync();
    });
    call.on("local-screen-share-canceled", () => {
      this.shareResolver?.("cancelled");
      this.shareResolver = undefined;
    });
    call.on("local-screen-share-stopped", sync);
    call.on("nonfatal-error", () => {
      this.shareResolver?.("cancelled");
      this.shareResolver = undefined;
    });
  }

  private streamFor(id: string, tracks: (MediaStreamTrack | undefined)[]): MediaStream | undefined {
    const live = tracks.filter((t): t is MediaStreamTrack => Boolean(t));
    if (live.length === 0) {
      this.streams.delete(id);
      return undefined;
    }
    const key = live.map((t) => t.id).join("|");
    const cached = this.streams.get(id);
    if (cached?.key === key) return cached.stream;
    const stream = new MediaStream(live);
    this.streams.set(id, { key, stream });
    return stream;
  }

  /** Rebuilds the call state from Daily's participant list, which is the source of truth. */
  private sync() {
    const call = this.call;
    if (!call || this.state.status === "ended") return;
    const participants = call.participants();
    const local = participants.local;
    const others = Object.values(participants).filter((p) => !p.local);

    const remote = this.state.remote
      .map<RemoteParticipant>((r) => {
        const p = others.find((x) => x.user_id === r.userId);
        if (!p) return { ...r, connected: false, micOn: false, camOn: false, speaking: false, stream: undefined, screen: undefined };
        return {
          ...r,
          connected: true,
          micOn: isOn(p.tracks.audio?.state),
          camOn: Boolean(usableTrack(p, "video")),
          speaking: this.activePeer === p.session_id,
          stream: this.streamFor(`remote:${r.userId}`, [usableTrack(p, "video"), usableTrack(p, "audio")]),
          screen: this.streamFor(`screen:${r.userId}`, [usableTrack(p, "screenVideo")]),
        };
      })
      // Whoever is actually here takes the main tile.
      .sort((a, b) => Number(b.connected) - Number(a.connected));

    const anyoneHere = remote.some((r) => r.connected);
    const status = !this.joined ? "connecting" : this.interrupted ? "reconnecting" : anyoneHere ? "connected" : "waiting";
    this.set({
      status,
      remote,
      connectedAt: this.state.connectedAt ?? (anyoneHere && this.joined ? Date.now() : undefined),
      local: {
        ...this.state.local,
        // Only video: the local preview must never play your own microphone back.
        stream: local ? this.streamFor("local", [local.tracks.video?.persistentTrack]) : undefined,
        screen: local ? this.streamFor("local-screen", [usableTrack(local, "screenVideo")]) : undefined,
        micOn: local ? isOn(local.tracks.audio?.state) : this.state.local.micOn,
        camOn: local ? isOn(local.tracks.video?.state) : this.state.local.camOn,
      },
    });
  }

  private async refreshDevices() {
    try {
      const { devices } = (await this.call?.enumerateDevices()) ?? { devices: [] };
      this.set({
        devices: {
          cameras: devices.filter((d) => d.kind === "videoinput" && d.deviceId),
          microphones: devices.filter((d) => d.kind === "audioinput" && d.deviceId),
        },
      });
    } catch {
      // Device lists are optional.
    }
  }

  async requestMedia() {
    const call = this.call;
    if (!call) return;
    const generation = this.generation;
    this.setLocal({ mediaError: null });
    try {
      await call.startCamera({ url: this.ticket.serverUrl, token: this.ticket.token });
    } catch {
      // The track state below says what happened.
    }
    if (generation !== this.generation) return;
    const local = call.participants().local;
    const blocked = [local?.tracks.video, local?.tracks.audio].map((t) => t?.blocked);
    if (blocked.some((b) => b?.byPermissions)) {
      // Stay outside the room so the person can fix permissions or join without media.
      this.setLocal({ mediaError: "denied" });
      return;
    }
    if (blocked.every((b) => b?.byDeviceMissing || b?.byDeviceInUse)) this.setLocal({ mediaError: "no_devices" });
    await this.joinRoom(generation);
  }

  continueWithoutMedia() {
    this.setLocal({ micOn: false, camOn: false, mediaError: null });
    void this.joinRoom(this.generation, { startVideoOff: true, startAudioOff: true });
  }

  private async joinRoom(generation: number, options: { startVideoOff?: boolean; startAudioOff?: boolean } = {}) {
    const call = this.call;
    if (!call || this.state.local.mediaReady || generation !== this.generation) return;
    this.setLocal({ mediaReady: true });
    try {
      await call.join({ url: this.ticket.serverUrl, token: this.ticket.token, ...options });
    } catch (error) {
      console.error("Daily join failed:", error);
      if (generation === this.generation) this.set({ status: "ended", connectionFailed: true });
    }
  }

  setMicEnabled(on: boolean) {
    this.call?.setLocalAudio(on);
    this.setLocal({ micOn: on });
  }

  setCameraEnabled(on: boolean) {
    this.call?.setLocalVideo(on);
    this.setLocal({ camOn: on });
  }

  async selectDevice(kind: "camera" | "microphone", deviceId: string) {
    const devices = kind === "camera" ? { videoDeviceId: deviceId } : { audioDeviceId: deviceId };
    try {
      await this.call?.setInputDevicesAsync(devices);
      this.set({ selected: { ...this.state.selected, [kind === "camera" ? "cameraId" : "microphoneId"]: deviceId } });
    } catch {
      // Keep the current device if the new one can't be opened.
    }
  }

  async startScreenShare(): Promise<ScreenShareResult> {
    const { default: Daily } = await import("@daily-co/daily-js");
    if (!this.call || !Daily.supportedBrowser().supportsScreenShare) return "unsupported";
    return new Promise((resolve) => {
      this.shareResolver = resolve;
      this.call?.startScreenShare();
    });
  }

  stopScreenShare() {
    this.call?.stopScreenShare();
  }

  sendChat(body: string) {
    const text = body.trim().slice(0, 2000);
    if (!text) return;
    const id = chatId();
    this.call?.sendAppMessage({ kind: "chat", id, body: text }, "*");
    this.set({ chat: [...this.state.chat, { id, senderId: this.ticket.me.userId, body: text, at: Date.now() }] });
  }

  shareMaterial() {
    // Files need shared storage (Supabase); `materialsEnabled` keeps this out of the UI until then.
  }

  leave() {
    this.generation++;
    this.shareResolver?.("cancelled");
    this.shareResolver = undefined;
    const call = this.call;
    this.call = undefined;
    if (call) {
      this.pendingDestroy = call
        .leave()
        .catch(() => {})
        .then(() => call.destroy())
        .catch(() => {});
    }
    this.streams.clear();
    this.set({
      status: "ended",
      local: { ...this.state.local, stream: undefined, screen: undefined },
      remote: this.state.remote.map((r) => ({ ...r, connected: false, speaking: false, stream: undefined, screen: undefined })),
    });
  }
}

export const dailyVideoProvider: VideoProvider = {
  kind: "live",
  connect(ticket) {
    if (ticket.provider !== "daily" || !ticket.serverUrl) throw new Error("The Daily provider needs a Daily ticket.");
    return new DailyVideoCall(ticket);
  },
};
