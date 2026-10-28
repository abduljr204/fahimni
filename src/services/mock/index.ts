import type { AppServices } from "../contracts";
import { mockAccountService } from "./mock-account";
import { mockAuthService, mockDemoControls } from "./mock-auth";
import { mockBookingService } from "./mock-bookings";
import { mockClassroomService } from "./mock-classroom";
import {
  mockFavoritesService,
  mockReviewRepository,
  mockSubjectRepository,
  mockTutorRepository,
} from "./mock-catalog";
import { mockDashboardService } from "./mock-dashboard";
import { mockMessagingService } from "./mock-messaging";
import { mockModerationService } from "./mock-moderation";
import { mockNotificationService } from "./mock-notifications";
import { mockOnboardingService } from "./mock-onboarding";
import { mockPaymentService } from "./mock-payments";
import { mockPlatformService } from "./mock-platform";
import { mockProposalService } from "./mock-proposals";
import { startSimulator } from "./simulator";

/** PROTOTYPE MODE services: seeded demo data, simulated realtime and payments. */
export function createMockServices(): AppServices {
  startSimulator();
  return {
    mode: "prototype",
    auth: mockAuthService,
    account: mockAccountService,
    onboarding: mockOnboardingService,
    moderation: mockModerationService,
    tutors: mockTutorRepository,
    subjects: mockSubjectRepository,
    reviews: mockReviewRepository,
    favorites: mockFavoritesService,
    bookings: mockBookingService,
    messaging: mockMessagingService,
    proposals: mockProposalService,
    classroom: mockClassroomService,
    notifications: mockNotificationService,
    payments: mockPaymentService,
    dashboard: mockDashboardService,
    platform: mockPlatformService,
    demo: mockDemoControls,
  };
}
