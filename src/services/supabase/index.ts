import { appConfig } from "@/config/app-config";
import type { AppServices } from "../contracts";
import { supabaseAccountService, supabaseOnboardingService } from "./account";
import { supabaseAuthService } from "./auth";
import {
  supabaseDashboardService,
  supabaseFavoritesService,
  supabasePlatformService,
  supabaseReviewRepository,
  supabaseSubjectRepository,
  supabaseTutorRepository,
} from "./catalog";
import { supabaseBookingService, supabaseClassroomService, supabasePaymentService, supabaseProposalService } from "./lessons";
import { supabaseMessagingService, supabaseModerationService, supabaseNotificationService } from "./messaging";

/**
 * PRODUCTION MODE services. Screens call these exactly as they call the mock services. Reads and
 * writes go to the database functions in supabase/migrations/0005_production_api.sql, which
 * check permissions themselves; the acting user always comes from the session there, never from
 * the `actorUserId` arguments. There is deliberately no fallback to demo data.
 */
export function createSupabaseServices(): AppServices {
  return {
    mode: "production",
    auth: supabaseAuthService,
    account: supabaseAccountService,
    onboarding: supabaseOnboardingService,
    moderation: supabaseModerationService,
    tutors: supabaseTutorRepository,
    subjects: supabaseSubjectRepository,
    reviews: supabaseReviewRepository,
    favorites: supabaseFavoritesService,
    bookings: supabaseBookingService,
    messaging: supabaseMessagingService,
    proposals: supabaseProposalService,
    classroom: supabaseClassroomService,
    notifications: supabaseNotificationService,
    payments: supabasePaymentService,
    dashboard: supabaseDashboardService,
    platform: supabasePlatformService,
  };
}

/** True once this deployment has its Supabase settings. */
export const productionServicesReady = appConfig.supabase.isConfigured;
