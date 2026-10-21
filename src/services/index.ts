import { appConfig } from "@/config/app-config";
import type { AppServices } from "./contracts";
import { createMockServices } from "./mock";
import { createSupabaseServices } from "./supabase";

export type * from "./contracts";
export { ServiceError, isServiceError } from "./errors";

let instance: AppServices | null = null;

/**
 * Returns the service implementation for the configured mode. The UI never imports
 * a concrete implementation directly, so switching backends never touches screens.
 */
export function getServices(): AppServices {
  if (!instance) {
    instance = appConfig.isPrototype ? createMockServices() : createSupabaseServices();
  }
  return instance;
}
