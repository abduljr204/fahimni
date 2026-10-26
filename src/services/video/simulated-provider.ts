import type { ClassroomTicket } from "@/domain/types";
import type { CallState, RemoteParticipant, VideoCall, VideoProvider } from "./contracts";

/**
 * PROTOTYPE video: the local camera, microphone and screen share are real browser media,
 * but nothing is sent anywhere and the other participant is simulated (they join after a
 * few seconds, "talk", and answer chat messages). The UI labels all of this clearly.
 */

const JOIN_DELAY_MS = 3500;
const RECONNECT_MS = 3000;

let seq = 0;
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

function stopStream(stream?: MediaStream) {
  stream?.getTracks().forEach((t) => t.stop());
}

class SimulatedCall implements VideoCall {
  private state: CallState;
  private listeners = new Set<(s: CallState) => void>();
  private timers: number[] = [];
  private speakingTimer?: number;
  private readonly me: string;

  constructor(private readonly ticket: ClassroomTicket) {
    this.me = ticket.me.userId;
    // The tutor meets the student; the student or parent meets the tutor.
    const others = ticket.participants.filter((p) => p.userId !== this.me && (ticket.me.role === "tutor" ? p.role === "student" : p.role === "tutor"));
    this.state = {
      status: "connecting",
      simulated: true,
      local: { micOn: true, camOn: true, mediaError: null, mediaReady: false },
      remote: others.map<RemoteParticipant>((p) => ({ ...p, connected: false, micOn: true, camOn: true, speaking: false, simulated: true })),
      chat: [],
      materials: [],
      devices: { cameras: [], microphones: [] },
      selected: {},
    };
  }

  start() {
    window.addEventListener("offline", this.onOffline);
    window.addEventListener("online", this.onOnline);
    if (this.state.status === "ended") {
      // Rejoining keeps the chat and materials, like a real room would.
      this.set({
        status: "connecting",
        connectedAt: undefined,
        local: { ...this.state.local, mediaError: null, mediaReady: false },
        remote: this.state.remote.map((r) => ({ ...r, connected: false, speaking: false })),
      });
    }
    void this.requestMedia();
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

  private later(fn: () => void, ms: number) {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private async getMedia(constraints: MediaStreamConstraints): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  private async refreshDevices() {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      this.set({
        devices: {
          cameras: all.filter((d) => d.kind === "videoinput" && d.deviceId),
          microphones: all.filter((d) => d.kind === "audioinput" && d.deviceId),
        },
      });
    } catch {
      // Device lists are optional.
    }
  }

  async requestMedia() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.setLocal({ mediaError: "no_devices", micOn: false, camOn: false });
      this.joinRoom();
      return;
    }
    try {
      const stream = await this.getMedia({ video: true, audio: true });
      stopStream(this.state.local.stream);
      this.setLocal({ stream, mediaError: null, micOn: true, camOn: true });
      await this.refreshDevices();
      this.joinRoom();
    } catch (error) {
      const name = (error as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        // Stay before the room so the person can fix permissions or join without media.
        this.setLocal({ mediaError: "denied" });
      } else {
        this.setLocal({ mediaError: "no_devices", micOn: false, camOn: false });
        this.joinRoom();
      }
    }
  }

  continueWithoutMedia() {
    this.setLocal({ micOn: false, camOn: false, mediaError: null });
    this.joinRoom();
  }

  private joinRoom() {
    if (this.state.local.mediaReady) return;
    this.setLocal({ mediaReady: true });
    this.later(() => {
      if (this.state.status === "ended") return;
      this.set({ status: "waiting" });
      this.later(() => this.remoteJoins(), JOIN_DELAY_MS);
    }, 900);
  }

  private remoteJoins() {
    if (this.state.status === "ended") return;
    this.set({
      status: "connected",
      connectedAt: this.state.connectedAt ?? Date.now(),
      remote: this.state.remote.map((r) => ({ ...r, connected: true })),
    });
    // Greet in the language the page is shown in.
    const greeting = document.documentElement.lang === "ar" ? "أهلًا! أسمعك جيدًا 👋" : "Hi! I can hear you well 👋";
    this.later(() => this.remoteSays(greeting), 1200);
    // The simulated person "talks" now and then so the speaking indicator is visible.
    this.speakingTimer = window.setInterval(() => {
      if (this.state.status !== "connected") return;
      const speaking = Math.random() > 0.55;
      this.set({ remote: this.state.remote.map((r) => ({ ...r, speaking })) });
    }, 1400);
  }

  private remoteSays(body: string) {
    const from = this.state.remote[0];
    if (!from || this.state.status === "ended") return;
    this.set({ chat: [...this.state.chat, { id: id("chat"), senderId: from.userId, body, at: Date.now(), simulated: true }] });
  }

  setMicEnabled(on: boolean) {
    this.state.local.stream?.getAudioTracks().forEach((t) => (t.enabled = on));
    this.setLocal({ micOn: on });
  }

  setCameraEnabled(on: boolean) {
    this.state.local.stream?.getVideoTracks().forEach((t) => (t.enabled = on));
    this.setLocal({ camOn: on });
  }

  async selectDevice(kind: "camera" | "microphone", deviceId: string) {
    const selected = { ...this.state.selected, [kind === "camera" ? "cameraId" : "microphoneId"]: deviceId };
    try {
      const stream = await this.getMedia({
        video: selected.cameraId ? { deviceId: { exact: selected.cameraId } } : true,
        audio: selected.microphoneId ? { deviceId: { exact: selected.microphoneId } } : true,
      });
      stopStream(this.state.local.stream);
      stream.getAudioTracks().forEach((t) => (t.enabled = this.state.local.micOn));
      stream.getVideoTracks().forEach((t) => (t.enabled = this.state.local.camOn));
      this.set({ selected });
      this.setLocal({ stream });
    } catch {
      // Keep the current device if the new one can't be opened.
    }
  }

  async startScreenShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) return "unsupported" as const;
    try {
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      screen.getVideoTracks()[0]?.addEventListener("ended", () => this.stopScreenShare());
      this.setLocal({ screen });
      return "ok" as const;
    } catch {
      return "cancelled" as const;
    }
  }

  stopScreenShare() {
    stopStream(this.state.local.screen);
    this.setLocal({ screen: undefined });
  }

  sendChat(body: string) {
    const text = body.trim();
    if (!text) return;
    this.set({ chat: [...this.state.chat, { id: id("chat"), senderId: this.me, body: text, at: Date.now() }] });
    const arabic = /[؀-ۿ]/.test(text);
    this.later(() => this.remoteSays(arabic ? "تمام، واضح 👍" : "Got it, thanks 👍"), 1800);
  }

  shareMaterial(file: Parameters<VideoCall["shareMaterial"]>[0]) {
    this.set({ materials: [...this.state.materials, { ...file, id: id("mat"), sharedBy: this.me, at: Date.now() }] });
  }

  simulateConnectionDrop() {
    if (this.state.status !== "connected") return;
    this.set({ status: "reconnecting" });
    this.later(() => this.state.status === "reconnecting" && this.set({ status: "connected" }), RECONNECT_MS);
  }

  private onOffline = () => {
    if (this.state.status === "connected" || this.state.status === "waiting") this.set({ status: "reconnecting" });
  };

  private onOnline = () => {
    if (this.state.status === "reconnecting") this.set({ status: this.state.remote.some((r) => r.connected) ? "connected" : "waiting" });
  };

  leave() {
    this.timers.forEach((t) => window.clearTimeout(t));
    this.timers = [];
    if (this.speakingTimer) window.clearInterval(this.speakingTimer);
    window.removeEventListener("offline", this.onOffline);
    window.removeEventListener("online", this.onOnline);
    stopStream(this.state.local.stream);
    stopStream(this.state.local.screen);
    this.set({
      status: "ended",
      local: { ...this.state.local, stream: undefined, screen: undefined },
      remote: this.state.remote.map((r) => ({ ...r, connected: false, speaking: false })),
    });
  }
}

export const simulatedVideoProvider: VideoProvider = {
  kind: "simulated",
  connect(ticket) {
    if (ticket.provider !== "simulated") throw new Error("The simulated provider only accepts simulated tickets.");
    return new SimulatedCall(ticket);
  },
};
