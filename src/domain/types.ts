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

/** "parent" manages bookings and messages for younger students who have no login of their own. */
export type UserRole = "student" | "tutor" | "admin" | "parent";

export interface UserAccount extends BaseEntity {
  email: string;
  role: UserRole;
  displayName: LocalizedText;
  /** Hue (0-360) used for generated avatars when no photo is uploaded. */
  avatarHue: number;
  avatarUrl?: string;
  preferredLocale: Locale;
  /**
   * Private: used only for SMS notifications, never shown to other users. Production keeps it
   * in a table only the owner can read.
   */
  phone?: string;
  /** Set by an admin; suspended accounts can't sign in, message or book. */
  suspendedAt?: ISODateTime;
  suspensionReason?: string;
}

export interface StudentProfile extends BaseEntity {
  userId: ID;
  university: LocalizedText;
  major: LocalizedText;
  studyYear: number;
  level?: GradeLevel;
  /** Used for the age check: students under 18 are managed by a parent. */
  birthYear?: number;
  /**
   * Set for younger students: this parent books, pays and messages on their behalf,
   * and may join their classroom.
   */
  guardianUserId?: ID;
}

/** A student whose bookings and messages a parent manages. */
export interface ManagedStudent {
  userId: ID;
  displayName: LocalizedText;
  avatarHue: number;
  level?: GradeLevel;
}

export interface Session {
  user: UserAccount;
  student?: StudentProfile;
  /** Present when the signed-in user owns a tutor profile. */
  tutorId?: ID;
  /** Present for parents: the students they act for. */
  managedStudents?: ManagedStudent[];
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
export type GradeLevel = "secondary" | "university_early" | "university_advanced" | "postgraduate";
export type SpokenLanguage = "ar" | "libyan" | "fr" | "en" | "amazigh";
export type VerificationStatus = "verified" | "pending" | "unverified" | "rejected";

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
  /** Degrees, certificates and relevant achievements, shown before booking. */
  qualifications: LocalizedText[];
  gradeLevels: GradeLevel[];
  hourlyRate: Money;
  yearsExperience: number;
  rating: number;
  reviewCount: number;
  lessonsCompleted: number;
  responseTimeMinutes: number;
  verification: VerificationStatus;
  /** When true, bookings are confirmed immediately; otherwise the tutor must accept. */
  instantBook: boolean;
  /** Only published profiles appear in search. New tutors are published once an admin approves them. */
  published: boolean;
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

// ─── Platform ───────────────────────────────────────────────────────────────

/** Marketplace rules managed by admins. Changes only affect lessons priced afterwards. */
export interface PlatformSettings {
  /** Platform commission in basis points: 1000 = 10%. Integers keep the maths exact. */
  commissionBps: number;
  minHourlyRate: Money;
  maxHourlyRate: Money;
  /**
   * Payment options offered for in-person lessons (at least one). Online lessons are
   * always paid in full through the platform.
   */
  inPersonPaymentOptions: Settlement[];
  /** The classroom opens this many minutes before the lesson starts… */
  classroomOpensMinutesBefore: number;
  /** …and closes this many minutes after it is scheduled to end. */
  classroomClosesMinutesAfter: number;
  updatedAt: ISODateTime;
  updatedBy?: ID;
}

/**
 * How the student pays: "in_app" is the full price through the platform;
 * "deposit_and_cash" (in-person only) is the platform fee now and the rest in cash to the tutor.
 */
export type Settlement = "in_app" | "deposit_and_cash";

/**
 * The price agreed when a lesson is requested. It is stored on the booking and never
 * recalculated, so later rate or commission changes leave existing lessons untouched.
 * Invariants: commission + tutorEarnings = total, and dueInApp + dueInCash = total.
 */
export interface LessonPricing {
  /** The tutor's hourly rate at the time of the request. */
  hourlyRate: Money;
  total: Money;
  commissionBps: number;
  /** Platform share, included in `total` (never added on top). */
  commission: Money;
  tutorEarnings: Money;
  settlement: Settlement;
  /** Charged through the app when booking. */
  dueInApp: Money;
  /** Paid by the student directly to the tutor at the lesson. */
  dueInCash: Money;
}

// ─── Bookings ───────────────────────────────────────────────────────────────

/** The agreement between student and tutor. Payment and lesson completion are tracked separately. */
export type BookingStatus = "pending" | "confirmed" | "declined" | "cancelled";
/** State of the in-app part of the payment. */
export type PaymentStatus = "unpaid" | "simulated" | "authorized" | "paid" | "partially_refunded" | "refunded";
/** What happened to the lesson itself. Only meaningful for confirmed bookings. */
export type LessonStatus = "scheduled" | "in_progress" | "completed";

export interface Booking extends BaseEntity {
  studentId: ID;
  tutorId: ID;
  subjectId: ID;
  startsAt: ISODateTime;
  durationMinutes: number;
  mode: LessonMode;
  status: BookingStatus;
  pricing: LessonPricing;
  /** State of the in-app part of the payment (`pricing.dueInApp`). */
  paymentStatus: PaymentStatus;
  lessonStatus: LessonStatus;
  /** Reminders already sent for this lesson. */
  remindersSent?: ("24h" | "1h")[];
  /** Who made the booking: the student, or their parent. */
  bookedBy: ID;
  /** Set when the booking came from a tutor's lesson proposal. */
  proposalId?: ID;
  objectives?: string;
  note?: string;
  /** General area for in-person lessons (city, district). Visible before payment. */
  area?: string;
  /**
   * Exact meeting place. Only returned to participants once the booking is confirmed
   * and paid; see `canSeeMeetingDetails`.
   */
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
  /** False when `location` was withheld because the booking isn't confirmed and paid. */
  meetingDetailsVisible: boolean;
}

export type PaymentPurpose = "lesson" | "commission_deposit";
export type PaymentRecordStatus = "pending" | "requires_action" | "succeeded" | "failed" | "partially_refunded" | "refunded";

/** One charge made through the app. `provider: "simulated"` records never moved money. */
export interface Payment extends BaseEntity {
  bookingId: ID;
  payerId: ID;
  amount: Money;
  /** "lesson" pays an online lesson in full; "commission_deposit" is the in-app part of an in-person lesson. */
  purpose: PaymentPurpose;
  provider: "simulated" | (string & {});
  providerReference: string;
  status: PaymentRecordStatus;
  refundedAmount?: Money;
  updatedAt: ISODateTime;
}

// ─── Lesson proposals ───────────────────────────────────────────────────────

export type ProposalStatus = "pending" | "accepted" | "declined" | "withdrawn" | "expired";

/**
 * A lesson offered by a tutor inside a conversation. Its price is fixed when it is sent;
 * the student reviews it and pays to turn it into a confirmed booking.
 */
export interface LessonProposal extends BaseEntity {
  conversationId: ID;
  tutorId: ID;
  tutorUserId: ID;
  /** The learner (a student, or a child managed by a parent). */
  studentId: ID;
  subjectId: ID;
  objectives: string;
  startsAt: ISODateTime;
  durationMinutes: number;
  mode: LessonMode;
  /** General area for in-person lessons. Exact places are shared after payment. */
  area?: string;
  /** Rate and commission at the time of the proposal; the payment option is chosen at checkout. */
  pricing: LessonPricing;
  status: ProposalStatus;
  expiresAt: ISODateTime;
  bookingId?: ID;
  respondedAt?: ISODateTime;
  /** Sent by the prototype's simulated tutor. */
  isSimulated?: boolean;
}

export interface ProposalDetails extends LessonProposal {
  tutor: Pick<TutorProfile, "id" | "userId" | "displayName" | "avatarHue" | "avatarUrl" | "headline">;
  student: Pick<UserAccount, "id" | "displayName" | "avatarHue">;
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
  /** The learner. For a managed child, their parent also takes part. */
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
  /**
   * True once the pair has a confirmed, paid booking. Before that, contact details and
   * exact meeting places are blocked in this conversation.
   */
  unlocked: boolean;
  /** Set when a parent manages the learner's side of this conversation. */
  guardian?: Pick<UserAccount, "id" | "displayName">;
}

export interface Attachment {
  id: ID;
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** A data URL in the prototype; a short-lived signed URL in production. */
  url: string;
  width?: number;
  height?: number;
}

export type MessageKind = "text" | "proposal" | "system";
export type SystemEvent = "contact_unlocked" | "contact_locked";

export interface Message extends BaseEntity {
  conversationId: ID;
  senderId: ID;
  body: string;
  kind?: MessageKind;
  attachments?: Attachment[];
  proposalId?: ID;
  systemEvent?: SystemEvent;
  readAt?: ISODateTime;
  /** Auto-generated reply produced by the prototype's simulator. */
  isSimulated?: boolean;
}

// ─── Classroom ──────────────────────────────────────────────────────────────

export type ClassroomRole = "tutor" | "student" | "guardian";

export interface ClassroomParticipant {
  userId: ID;
  role: ClassroomRole;
  displayName: LocalizedText;
  avatarHue: number;
}

/**
 * Issued by the server to one authorised participant of a confirmed, paid online
 * booking, inside the entry window. The classroom URL alone grants nothing.
 */
export interface ClassroomTicket {
  bookingId: ID;
  roomName: string;
  /** Short-lived credential for the video provider ("simulated" in the prototype). */
  token: string;
  provider: "simulated" | (string & {});
  /** Video provider endpoint in production. */
  serverUrl?: string;
  expiresAt: ISODateTime;
  me: ClassroomParticipant;
  participants: ClassroomParticipant[];
  lesson: { subject: LocalizedText; startsAt: ISODateTime; durationMinutes: number; objectives?: string };
  /** Lessons are never recorded by default. */
  recording: false;
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
  | "proposal_received"
  | "proposal_accepted"
  | "proposal_declined"
  | "application_approved"
  | "application_rejected"
  | "report_resolved"
  | "account_warning"
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
    proposalId?: ID;
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

export interface AdminPaymentRow extends Payment {
  studentName: LocalizedText;
  tutorName: LocalizedText;
}

export interface AdminOverview {
  /** Confirmed and completed lessons. */
  lessonCount: number;
  grossVolume: Money;
  commissionEarned: Money;
  /** Money that went through the app (simulated in the prototype). */
  collectedInApp: Money;
  /** Paid by students to tutors directly for in-person lessons. */
  paidInCash: Money;
  recentPayments: AdminPaymentRow[];
}

// ─── Tutor onboarding ───────────────────────────────────────────────────────

export type ApplicationStatus = "pending" | "approved" | "rejected";

export interface TutorDocument {
  kind: "identity" | "qualification";
  file: Attachment;
}

/** A new tutor's request to teach. The profile stays hidden until an admin approves it. */
export interface TutorApplication extends BaseEntity {
  userId: ID;
  tutorId: ID;
  documents: TutorDocument[];
  status: ApplicationStatus;
  reviewedAt?: ISODateTime;
  reviewedBy?: ID;
  /** Shown to the applicant when rejected. */
  note?: string;
}

export interface ApplicationDetails extends TutorApplication {
  tutor: TutorProfile;
  email: string;
}

// ─── Notifications outside the app ──────────────────────────────────────────

export type NotificationChannel = "email" | "sms" | "push";
export type NotificationCategory = "lessons" | "messages" | "account";

/** Which categories reach the user on each channel. In-app notifications are always on. */
export type NotificationPreferences = Record<NotificationChannel, Record<NotificationCategory, boolean>>;

/**
 * A notification sent (or, in the prototype, simulated) outside the app. Production keeps
 * this as a delivery log written by the server.
 */
export interface OutboundMessage extends BaseEntity {
  userId: ID;
  channel: NotificationChannel;
  /** Email address, phone number or "this device". */
  to: string;
  type: NotificationType | "password_reset";
  data: AppNotification["data"] & { link?: string };
  status: "simulated" | "sent" | "failed";
}

// ─── Trust & safety ─────────────────────────────────────────────────────────

export type ReportReason = "spam" | "harassment" | "inappropriate" | "off_platform" | "fake_profile" | "safety" | "other";
export type DisputeReason = "no_show" | "quality" | "billing" | "other";
export type ReportStatus = "open" | "resolved" | "dismissed";
export type ModerationAction = "none" | "warning" | "suspend" | "unpublish" | "refund";

/**
 * A report about a message, user or tutor profile, or (`kind: "dispute"`) a problem with a
 * paid lesson that may end in a refund.
 */
export interface Report extends BaseEntity {
  kind: "report" | "dispute";
  /** Absent for reports raised automatically by the system. */
  reporterId?: ID;
  targetUserId: ID;
  reason: ReportReason | DisputeReason;
  details: string;
  messageId?: ID;
  conversationId?: ID;
  bookingId?: ID;
  /** Copy of the reported message, kept even if the conversation changes. */
  evidence?: string;
  auto?: boolean;
  status: ReportStatus;
  resolution?: { action: ModerationAction; note: string; refund?: Money; by: ID; at: ISODateTime };
}

export interface ReportDetails extends Report {
  reporterName?: LocalizedText;
  targetName: LocalizedText;
  targetRole: UserRole;
  targetSuspended: boolean;
  booking?: Pick<Booking, "id" | "startsAt" | "durationMinutes" | "mode" | "status" | "paymentStatus" | "pricing"> & {
    subject: LocalizedText;
  };
}
