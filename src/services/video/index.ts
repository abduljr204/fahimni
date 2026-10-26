import { appConfig } from "@/config/app-config";
import { ServiceError } from "../errors";
import type { VideoProvider } from "./contracts";
import { simulatedVideoProvider } from "./simulated-provider";

export type * from "./contracts";

/**
 * PRODUCTION integration point. Wrap the chosen provider's client SDK (e.g. `livekit-client`,
 * `@daily-co/daily-js`) in `VideoProvider`: `connect(ticket)` joins `ticket.roomName` on
 * `ticket.serverUrl` with `ticket.token`, which the server issued only to an authorised
 * participant (see `src/services/video/server.ts`). Until then production fails loudly.
 */
const liveVideoProvider: VideoProvider = {
  kind: "live",
  connect() {
    throw new ServiceError("not_configured", "No video provider is integrated yet. See docs/PRE_BOOKING_AND_CLASSROOM.md.");
  },
};

export function getVideoProvider(): VideoProvider {
  return appConfig.isPrototype ? simulatedVideoProvider : liveVideoProvider;
}
