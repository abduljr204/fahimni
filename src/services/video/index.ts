import { appConfig } from "@/config/app-config";
import type { VideoProvider } from "./contracts";
import { dailyVideoProvider } from "./daily-provider";
import { liveKitVideoProvider } from "./livekit-provider";
import { simulatedVideoProvider } from "./simulated-provider";

export type * from "./contracts";

/** Chosen by NEXT_PUBLIC_VIDEO_PROVIDER. In production mode the server refuses to issue "simulated" tickets. */
export function getVideoProvider(): VideoProvider {
  switch (appConfig.video.provider) {
    case "livekit":
      return liveKitVideoProvider;
    case "daily":
      return dailyVideoProvider;
    default:
      return simulatedVideoProvider;
  }
}
