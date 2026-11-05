import { appConfig } from "@/config/app-config";
import type { VideoProvider } from "./contracts";
import { dailyVideoProvider } from "./daily-provider";
import { simulatedVideoProvider } from "./simulated-provider";

export type * from "./contracts";

/** Production always uses real calls. The prototype can try them with NEXT_PUBLIC_VIDEO_PROVIDER=daily. */
export function getVideoProvider(): VideoProvider {
  return !appConfig.isPrototype || appConfig.video.provider === "daily" ? dailyVideoProvider : simulatedVideoProvider;
}
