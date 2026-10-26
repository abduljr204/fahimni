import type { TutorSearchFilters } from "@/services/contracts";

/** Centralised TanStack Query keys so invalidation stays consistent. */
export const qk = {
  subjects: ["subjects"] as const,
  tutors: {
    all: ["tutors"] as const,
    search: (f: TutorSearchFilters) => ["tutors", "search", f] as const,
    featured: ["tutors", "featured"] as const,
    detail: (id: string) => ["tutors", "detail", id] as const,
    reviews: (id: string) => ["tutors", "reviews", id] as const,
    slots: (id: string, duration: number) => ["tutors", "slots", id, duration] as const,
  },
  favorites: (userId: string) => ["favorites", userId] as const,
  bookings: {
    all: ["bookings"] as const,
    student: (userId: string) => ["bookings", "student", userId] as const,
    tutor: (tutorId: string) => ["bookings", "tutor", tutorId] as const,
    detail: (bookingId: string) => ["bookings", "detail", bookingId] as const,
  },
  proposals: {
    all: ["proposals"] as const,
    conversation: (conversationId: string) => ["proposals", "conversation", conversationId] as const,
    detail: (proposalId: string) => ["proposals", "detail", proposalId] as const,
  },
  conversations: {
    all: ["conversations"] as const,
    list: (userId: string) => ["conversations", "list", userId] as const,
    detail: (id: string) => ["conversations", "detail", id] as const,
    messages: (id: string) => ["conversations", "messages", id] as const,
  },
  notifications: (userId: string) => ["notifications", userId] as const,
  dashboard: (tutorId: string) => ["dashboard", tutorId] as const,
  platform: {
    all: ["platform"] as const,
    settings: ["platform", "settings"] as const,
    overview: ["platform", "overview"] as const,
  },
};
