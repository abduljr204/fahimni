import type { ClassroomParticipant, ClassroomTicket } from "@/domain/types";
import type { AttachmentInput } from "@/domain/validation";

/**
 * Client-side video contract. The classroom screen only talks to these interfaces, so the
 * prototype's simulated call and a real provider (LiveKit, Daily, Twilio, Agora…) are
 * interchangeable. A provider connects with the ticket the server issued; it never decides
 * who may join.
 */

export type CallStatus = "connecting" | "waiting" | "connected" | "reconnecting" | "ended";
export type MediaError = "denied" | "no_devices" | null;

export interface RemoteParticipant extends ClassroomParticipant {
  connected: boolean;
  micOn: boolean;
  camOn: boolean;
  speaking: boolean;
  /** Real media from a provider; absent for the prototype's simulated participant. */
  stream?: MediaStream;
  simulated: boolean;
}

export interface CallChatItem {
  id: string;
  senderId: string;
  body: string;
  at: number;
  simulated?: boolean;
}

export interface CallMaterial extends AttachmentInput {
  id: string;
  sharedBy: string;
  at: number;
}

export interface CallState {
  status: CallStatus;
  /** True for the prototype's simulated call: the UI labels it clearly. */
  simulated: boolean;
  local: {
    stream?: MediaStream;
    screen?: MediaStream;
    micOn: boolean;
    camOn: boolean;
    mediaError: MediaError;
    /** False until the user has granted or skipped camera/microphone access. */
    mediaReady: boolean;
  };
  remote: RemoteParticipant[];
  chat: CallChatItem[];
  materials: CallMaterial[];
  devices: { cameras: MediaDeviceInfo[]; microphones: MediaDeviceInfo[] };
  selected: { cameraId?: string; microphoneId?: string };
  /** When both sides were first connected; drives the lesson timer. */
  connectedAt?: number;
}

export type ScreenShareResult = "ok" | "unsupported" | "cancelled";

export interface VideoCall {
  getState(): CallState;
  subscribe(listener: (state: CallState) => void): () => void;
  /** Connects, asking for camera and microphone first. Safe to call again after `leave()` to rejoin. */
  start(): void;
  /** Asks for camera and microphone. On failure `local.mediaError` explains why. */
  requestMedia(): Promise<void>;
  continueWithoutMedia(): void;
  setMicEnabled(on: boolean): void;
  setCameraEnabled(on: boolean): void;
  selectDevice(kind: "camera" | "microphone", deviceId: string): Promise<void>;
  startScreenShare(): Promise<ScreenShareResult>;
  stopScreenShare(): void;
  sendChat(body: string): void;
  shareMaterial(file: AttachmentInput): void;
  leave(): void;
  /** Prototype only: demonstrates the reconnecting state. */
  simulateConnectionDrop?(): void;
}

export interface VideoProvider {
  readonly kind: "simulated" | "live";
  connect(ticket: ClassroomTicket): VideoCall;
}
