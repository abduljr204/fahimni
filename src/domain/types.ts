/**
 * Core domain model. These types are shared by the UI, the service contracts and
 * every backend implementation (mock today, Supabase in production). They mirror
 * the tables in `supabase/migrations/0001_init.sql`.
 */

export type ID = string;
/** ISO-8601 timestamp, always stored in UTC. */
export type ISODateTime = string;
export type Locale = "ar" | "en";

/** Text that may be written in one or both supported languages. */
export type LocalizedText = Partial<Record<Locale, string>>;

/** Money is stored in minor units (e.g. centimes) to avoid floating point errors. */
export interface Money {
  amountMinor: number;
  currency: string;
}

export interface BaseEntity {
  id: ID;
  createdAt: ISODateTime;
  /**
   * True for records created by the prototype's seed or simulations. Production
   * services refuse to return such records, see `assertNotDemo`.
   */
  isDemo?: boolean;
}

// ─── Users ──────────────────────────────────────────────────────────────────

export type UserRole = "student" | "tutor" | "admin";

export interface UserAccount extends BaseEntity {
  email: string;
  role: UserRole;
  displayName: LocalizedText;
  /** Hue (0-360) used for generated avatars when no photo is uploaded. */
  avatarHue: number;
  avatarUrl?: string;
  preferredLocale: Locale;
}

export interface StudentProfile extends BaseEntity {
  userId: ID;
  university: LocalizedText;
  major: LocalizedText;
  studyYear: number;
}

export interface Session {
  user: UserAccount;
  student?: StudentProfile;
  /** Present when the signed-in user owns a tutor profile. */
  tutorId?: ID;
  isDemo: boolean;
}

// ─── Catalogue ──────────────────────────────────────────────────────────────

export const SUBJECT_CATEGORIES = [
  "math",
  "science",
  "engineering",
  "medicine",
  "it",
  "business",
  "languages",
  "law",
] as const;
export type SubjectCategory = (typeof SUBJECT_CATEGORIES)[number];

export interface Subject {
  id: ID;
  slug: string;
  name: LocalizedText;
  category: SubjectCategory;
}

export type LessonMode = "online" | "in_person";
export type SpokenLanguage = "ar" | "darija" | "fr" | "en" | "amazigh";
export type VerificationStatus = "verified" | "pending" | "unverified";

/** A weekly recurring window in the tutor's local time, e.g. Monday 17:00–21:00. */
export interface AvailabilityWindow {
  /** 0 = Sunday … 6 = Saturday (matches `Date.getDay()`). */
  weekday: number;
  start: string; // "HH:mm"
  end: string; // "HH:mm"
}

export interface TutorProfile extends BaseEntity {
  userId: ID;
  displayName: LocalizedText;
  avatarHue: number;
  avatarUrl?: string;
  headline: LocalizedText;
  bio: LocalizedText;
  university: LocalizedText;
  city: LocalizedText;
  subjectIds: ID[];
  languages: SpokenLanguage[];
  modes: LessonMode[];
  hourlyRate: Money;
  yearsExperience: number;
  rating: number;
  reviewCount: number;
  lessonsCompleted: number;
  responseTimeMinutes: number;
  verification: VerificationStatus;
  /** When true, bookings are confirmed immediately; otherwise the tutor must accept. */
  instantBook: boolean;
  availability: AvailabilityWindow[];
  timezone: string;
}

export interface Review extends BaseEntity {
  tutorId: ID;
  studentId: ID;
  bookingId?: ID;
  authorName: LocalizedText;
  authorHue: number;
  rating: number;
  comment: LocalizedText;
  subjectId?: ID;
}

// ─── Bookings ───────────────────────────────────────────────────────────────

export type BookingStatus = "pending" | "confirmed" | "declined" | "cancelled" | "completed";
export type PaymentStatus = "unpaid" | "simulated" | "authorized" | "paid" | "refunded";

export interface Booking extends BaseEntity {
  studentId: ID;
  tutorId: ID;
  subjectId: ID;
  startsAt: ISODateTime;
  durationMinutes: number;
  mode: LessonMode;
  status: BookingStatus;
  price: Money;
  paymentStatus: PaymentStatus;
  note?: string;
  meetingUrl?: string;
  location?: LocalizedText;
  /** Set once the student has reviewed a completed lesson. */
  reviewId?: ID;
  updatedAt: ISODateTime;
}

/** A booking joined with the data most screens need to render it. */
export interface BookingDetails extends Booking {
  tutor: Pick<TutorProfile, "id" | "userId" | "displayName" | "avatarHue" | "avatarUrl" | "headline">;
  student: Pick<UserAccount, "id" | "displayName" | "avatarHue" | "avatarUrl">;
  subject: Subject;
}

export interface TimeSlot {
  startsAt: ISODateTime;
  available: boolean;
}

export interface DaySlots {
  /** Local calendar date, "YYYY-MM-DD". */
  date: string;
  slots: TimeSlot[];
}

// ─── Messaging ──────────────────────────────────────────────────────────────

export interface Conversation extends BaseEntity {
  studentId: ID;
  tutorUserId: ID;
  tutorId: ID;
  lastMessageAt: ISODateTime;
  lastMessagePreview: string;
  lastMessageSenderId?: ID;
}

export interface ConversationSummary extends Conversation {
  counterpart: Pick<UserAccount, "id" | "displayName" | "avatarHue" | "avatarUrl"> & {
    subtitle: LocalizedText;
  };
  unreadCount: number;
}

export interface Message extends BaseEntity {
  conversationId: ID;
  senderId: ID;
  body: string;
  readAt?: ISODateTime;
  /** Auto-generated reply produced by the prototype's simulator. */
  isSimulated?: boolean;
}

// ─── Notifications ──────────────────────────────────────────────────────────

export type NotificationType =
  | "booking_requested"
  | "booking_confirmed"
  | "booking_declined"
  | "booking_cancelled"
  | "lesson_reminder"
  | "new_message"
  | "review_received"
  | "welcome";

export interface AppNotification extends BaseEntity {
  userId: ID;
  type: NotificationType;
  /** Values interpolated into the localized notification template. */
  data: {
    name?: LocalizedText;
    subject?: LocalizedText;
    startsAt?: ISODateTime;
    bookingId?: ID;
    conversationId?: ID;
  };
  readAt?: ISODateTime;
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

export interface TutorStats {
  earningsThisMonth: Money;
  earningsLastMonth: Money;
  lessonsThisMonth: number;
  upcomingCount: number;
  pendingCount: number;
  averageRating: number;
  reviewCount: number;
  responseRate: number; // 0-100
  profileViews: number;
  profileCompleteness: number; // 0-100
  /** Lessons per weekday for the current week, index 0 = Sunday. */
  weeklyLessons: number[];
}
