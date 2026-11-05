import type { LocalTrack, Participant, Room, TrackPublication } from "livekit-client";
import type { ClassroomTicket } from "@/domain/types";
import type { CallState, RemoteParticipant, ScreenShareResult, VideoCall, VideoProvider } from "./contracts";

/**
 * Real calls through LiveKit (https://docs.livekit.io). LiveKit carries the audio and video; the
 * classroom screen stays ours. The library is loaded on demand so it never weighs down other pages.
 */

type LiveKit = typeof import("livekit-client");

let seq = 0;
const chatId = () => `chat-${Date.now().toString(36)}-${(seq++).toString(36)}`;

function liveTrack(publication?: TrackPublication): MediaStreamTrack | undefined {
  return publication && !publication.isMuted ? publication.track?.mediaStreamTrack : undefined;
}

class LiveKitVideoCall implements VideoCall {
  private state: CallState;
  private listeners = new Set<(s: CallState) => void>();
  private lk?: LiveKit;
  private room?: Room;
  /** Bumped by start/leave, so async work from an abandoned attempt stops. */
  private generation = 0;
  private joined = false;
  private interrupted = false;
  /** Camera and microphone, held from when access is granted until they're published. */
  private localTracks: LocalTrack[] = [];
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
    const lk = await import("livekit-client");
    if (generation !== this.generation) return;
    this.lk = lk;
    // adaptiveStream only works with track.attach(); the classroom plays raw tracks itself.
    const room = new lk.Room({ adaptiveStream: false, dynacast: true });
    this.room = room;
    this.wire(lk, room);
    await this.requestMedia();
  }

  private wire(lk: LiveKit, room: Room) {
    const sync = () => this.room === room && this.sync();
    const { RoomEvent, DisconnectReason } = lk;
    for (const event of [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.TrackSubscribed,
      RoomEvent.TrackUnsubscribed,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.ActiveSpeakersChanged,
    ]) {
      room.on(event, sync);
    }
    room.on(RoomEvent.Reconnecting, () => {
      this.interrupted = true;
      sync();
    });
    room.on(RoomEvent.Reconnected, () => {
      this.interrupted = false;
      sync();
    });
    room.on(RoomEvent.Disconnected, (reason) => {
      if (this.room === room) this.set({ status: "ended", connectionFailed: reason !== DisconnectReason.CLIENT_INITIATED });
    });
    room.on(RoomEvent.MediaDevicesChanged, () => void this.refreshDevices());
    room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: Participant) => this.onData(payload, participant));
  }

  private onData(payload: Uint8Array, participant?: Participant) {
    const sender = participant?.identity;
    if (!sender || !this.ticket.participants.some((p) => p.userId === sender)) return;
    try {
      const data = JSON.parse(new TextDecoder().decode(payload));
      if (data?.kind !== "chat" || typeof data.body !== "string") return;
      this.set({ chat: [...this.state.chat, { id: String(data.id ?? chatId()), senderId: sender, body: data.body.slice(0, 2000), at: Date.now() }] });
    } catch {
      // Not one of our messages.
    }
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

  /** Rebuilds the call state from LiveKit's participant list, which is the source of truth. */
  private sync() {
    const { room, lk } = this;
    if (!room || !lk || this.state.status === "ended") return;
    const { Source } = lk.Track;
    const others = [...room.remoteParticipants.values()];

    const remote = this.state.remote
      .map<RemoteParticipant>((r) => {
        const p = others.find((x) => x.identity === r.userId);
        if (!p) return { ...r, connected: false, micOn: false, camOn: false, speaking: false, stream: undefined, screen: undefined };
        const camera = liveTrack(p.getTrackPublication(Source.Camera));
        const microphone = liveTrack(p.getTrackPublication(Source.Microphone));
        return {
          ...r,
          connected: true,
          micOn: Boolean(microphone),
          camOn: Boolean(camera),
          speaking: p.isSpeaking,
          stream: this.streamFor(`remote:${r.userId}`, [camera, microphone]),
          screen: this.streamFor(`screen:${r.userId}`, [liveTrack(p.getTrackPublication(Source.ScreenShare))]),
        };
      })
      // Whoever is actually here takes the main tile.
      .sort((a, b) => Number(b.connected) - Number(a.connected));

    // Before joining, the preview comes from the tracks held back for publishing.
    const held = (source: LocalTrack["source"]) => this.localTracks.find((t) => t.source === source);
    const me = room.localParticipant;
    const camera = me.getTrackPublication(Source.Camera)?.track ?? held(Source.Camera);
    const microphone = me.getTrackPublication(Source.Microphone)?.track ?? held(Source.Microphone);

    const anyoneHere = remote.some((r) => r.connected);
    this.set({
      status: !this.joined ? "connecting" : this.interrupted ? "reconnecting" : anyoneHere ? "connected" : "waiting",
      remote,
      connectedAt: this.state.connectedAt ?? (anyoneHere && this.joined ? Date.now() : undefined),
      local: {
        ...this.state.local,
        // Only video: the local preview must never play your own microphone back.
        stream: this.streamFor("local", [camera && !camera.isMuted ? camera.mediaStreamTrack : undefined]),
        screen: this.streamFor("local-screen", [liveTrack(me.getTrackPublication(Source.ScreenShare))]),
        micOn: Boolean(microphone && !microphone.isMuted),
        camOn: Boolean(camera && !camera.isMuted),
      },
    });
  }

  private async refreshDevices() {
    const { lk } = this;
    if (!lk) return;
    try {
      const [cameras, microphones] = await Promise.all([lk.Room.getLocalDevices("videoinput", false), lk.Room.getLocalDevices("audioinput", false)]);
      this.set({ devices: { cameras: cameras.filter((d) => d.deviceId), microphones: microphones.filter((d) => d.deviceId) } });
    } catch {
      // Device lists are optional.
    }
  }

  private stopLocalTracks() {
    this.localTracks.forEach((t) => t.stop());
    this.localTracks = [];
  }

  async requestMedia() {
    const { room, lk } = this;
    if (!room || !lk) return;
    const generation = this.generation;
    this.setLocal({ mediaError: null });
    this.stopLocalTracks();

    let tracks: LocalTrack[] = [];
    let denied = false;
    try {
      tracks = await lk.createLocalTracks({ audio: true, video: true });
    } catch (error) {
      denied = lk.MediaDeviceFailure.getFailure(error) === lk.MediaDeviceFailure.PermissionDenied;
      if (!denied) {
        // One device may be missing or busy; a lesson can go ahead with the other.
        tracks = await lk.createLocalTracks({ audio: true }).catch(() => []);
        if (tracks.length === 0) tracks = await lk.createLocalTracks({ video: true }).catch(() => []);
      }
    }
    if (generation !== this.generation) {
      tracks.forEach((t) => t.stop());
      return;
    }
    if (denied) {
      // Stay outside the room so the person can fix permissions or join without media.
      this.setLocal({ mediaError: "denied" });
      return;
    }
    this.localTracks = tracks;
    if (tracks.length === 0) this.setLocal({ mediaError: "no_devices" });
    this.sync();
    await this.joinRoom(generation);
  }

  continueWithoutMedia() {
    this.setLocal({ micOn: false, camOn: false, mediaError: null });
    void this.joinRoom(this.generation);
  }

  private async joinRoom(generation: number) {
    const { room } = this;
    if (!room || !this.ticket.serverUrl || this.state.local.mediaReady || generation !== this.generation) return;
    this.setLocal({ mediaReady: true });
    try {
      await room.connect(this.ticket.serverUrl, this.ticket.token);
      if (generation !== this.generation) {
        await room.disconnect();
        return;
      }
      this.joined = true;
      this.sync();
      await Promise.all(this.localTracks.map((t) => room.localParticipant.publishTrack(t)));
      this.sync();
      void this.refreshDevices();
    } catch (error) {
      console.error("LiveKit join failed:", error);
      if (generation === this.generation) this.set({ status: "ended", connectionFailed: true });
    }
  }

  setMicEnabled(on: boolean) {
    this.setLocal({ micOn: on });
    void this.room?.localParticipant.setMicrophoneEnabled(on).then(
      () => this.sync(),
      () => this.setLocal({ micOn: !on }),
    );
  }

  setCameraEnabled(on: boolean) {
    this.setLocal({ camOn: on });
    void this.room?.localParticipant.setCameraEnabled(on).then(
      () => this.sync(),
      () => this.setLocal({ camOn: !on }),
    );
  }

  async selectDevice(kind: "camera" | "microphone", deviceId: string) {
    try {
      await this.room?.switchActiveDevice(kind === "camera" ? "videoinput" : "audioinput", deviceId);
      this.set({ selected: { ...this.state.selected, [kind === "camera" ? "cameraId" : "microphoneId"]: deviceId } });
    } catch {
      // Keep the current device if the new one can't be opened.
    }
  }

  async startScreenShare(): Promise<ScreenShareResult> {
    if (!this.room) return "cancelled";
    if (!navigator.mediaDevices?.getDisplayMedia) return "unsupported";
    try {
      await this.room.localParticipant.setScreenShareEnabled(true);
      this.sync();
      return "ok";
    } catch {
      return "cancelled";
    }
  }

  stopScreenShare() {
    void this.room?.localParticipant.setScreenShareEnabled(false).then(() => this.sync());
  }

  sendChat(body: string) {
    const text = body.trim().slice(0, 2000);
    if (!text) return;
    const id = chatId();
    const payload = new TextEncoder().encode(JSON.stringify({ kind: "chat", id, body: text }));
    void this.room?.localParticipant.publishData(payload, { reliable: true });
    this.set({ chat: [...this.state.chat, { id, senderId: this.ticket.me.userId, body: text, at: Date.now() }] });
  }

  shareMaterial() {
    // Files need shared storage; `materialsEnabled` keeps this out of the UI until then.
  }

  leave() {
    this.generation++;
    const { room } = this;
    this.room = undefined;
    void room?.disconnect();
    this.stopLocalTracks();
    this.streams.clear();
    this.set({
      status: "ended",
      local: { ...this.state.local, stream: undefined, screen: undefined },
      remote: this.state.remote.map((r) => ({ ...r, connected: false, speaking: false, stream: undefined, screen: undefined })),
    });
  }
}

export const liveKitVideoProvider: VideoProvider = {
  kind: "live",
  connect(ticket) {
    if (ticket.provider !== "livekit" || !ticket.serverUrl) throw new Error("The LiveKit provider needs a LiveKit ticket.");
    return new LiveKitVideoCall(ticket);
  },
};
