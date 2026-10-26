import type { AppServices } from "../contracts";
import { mockAuthService, mockDemoControls } from "./mock-auth";
import { mockBookingService } from "./mock-bookings";
import {
  mockFavoritesService,
  mockReviewRepository,
  mockSubjectRepository,
  mockTutorRepository,
} from "./mock-catalog";
import { mockDashboardService } from "./mock-dashboard";
import { mockMessagingService } from "./mock-messaging";
import { mockNotificationService } from "./mock-notifications";
import { mockPaymentService } from "./mock-payments";
import { mockPlatformService } from "./mock-platform";
import { startSimulator } from "./simulator";

/** PROTOTYPE MODE services: seeded demo data, simulated realtime and payments. */
export function createMockServices(): AppServices {
  startSimulator();
  return {
    mode: "prototype",
    auth: mockAuthService,
    tutors: mockTutorRepository,
    subjects: mockSubjectRepository,
    reviews: mockReviewRepository,
    favorites: mockFavoritesService,
    bookings: mockBookingService,
    messaging: mockMessagingService,
    notifications: mockNotificationService,
    payments: mockPaymentService,
    dashboard: mockDashboardService,
    platform: mockPlatformService,
    demo: mockDemoControls,
  };
}
