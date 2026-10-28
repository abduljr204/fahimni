import type { AppMode } from "@/config/app-config";
import type {
  AdminOverview,
  ApplicationDetails,
  AppNotification,
  AvailabilityWindow,
  Booking,
  BookingDetails,
  ClassroomTicket,
  ConversationSummary,
  DaySlots,
  ID,
  LessonMode,
  Message,
  LessonProposal,
  ManagedStudent,
  Money,
  NotificationPreferences,
  OutboundMessage,
  PlatformSettings,
  ProposalDetails,
  Report,
  ReportDetails,
  Review,
  Session,
  Subject,
  SubjectCategory,
  TutorApplication,
  TutorProfile,
  TutorStats,
} from "@/domain/types";
import type {
  AcceptProposalInput,
  AccountProfileInput,
  ChangePasswordInput,
  ChildInput,
  CreateBookingInput,
  CreateProposalInput,
  ParentSignUpInput,
  PlatformSettingsInput,
  ReportInput,
  ResolveReportInput,
  ReviewApplicationInput,
  ReviewInput,
  SendMessageInput,
  SignInInput,
  SignUpInput,
  TutorApplicationInput,
  TutorProfileInput,
} from "@/domain/validation";

/**
 * Service contracts. The UI depends only on these interfaces; each backend
 * (mock for the prototype, Supabase for production) provides an implementation.
 * Every method that acts on behalf of a user takes the acting user's id so that a
 * server implementation can verify it against the authenticated session.
 */

export type Unsubscribe = () => void;

export interface AuthService {
  getSession(): Promise<Session | null>;
  /** Adult students only; younger students are registered by a parent. */
  signUp(input: SignUpInput): Promise<Session>;
  /** Creates the parent's account and their child's managed student profile. */
  signUpParent(input: ParentSignUpInput): Promise<Session>;
  /** Throws `account_suspended` for suspended accounts. */
  signIn(input: SignInInput): Promise<Session>;
  signOut(): Promise<void>;
  /**
   * Emails a single-use reset link if the address has an account; always resolves the same way
   * so it can't be used to discover accounts. Only the prototype returns `demoResetPath`, so
   * testers can open the simulated email's link.
   */
  requestPasswordReset(email: string): Promise<{ demoResetPath?: string }>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  onAuthStateChange(listener: (session: Session | null) => void): Unsubscribe;
}

/** The signed-in user's own account. */
export interface AccountService {
  updateProfile(actorUserId: ID, input: AccountProfileInput): Promise<Session>;
  changePassword(actorUserId: ID, input: ChangePasswordInput): Promise<void>;
  getPreferences(actorUserId: ID): Promise<NotificationPreferences>;
  updatePreferences(actorUserId: ID, prefs: NotificationPreferences): Promise<NotificationPreferences>;
  /** Email/SMS/push notifications sent to this user (simulated in the prototype). */
  listDeliveries(actorUserId: ID): Promise<OutboundMessage[]>;
  /** Parents only. */
  addChild(actorUserId: ID, input: ChildInput): Promise<ManagedStudent>;
  /**
   * Deletes the account and its personal data. Refused while the user has upcoming paid
   * lessons, so nobody loses a lesson or a refund by accident.
   */
  deleteAccount(actorUserId: ID, confirmEmail: string): Promise<void>;
}

/** Becoming a tutor, and the admin verification queue. */
export interface TutorOnboardingService {
  /**
   * Creates a tutor account with an unpublished profile and a pending application, then signs
   * the applicant in. The profile appears in search once an admin approves it.
   */
  apply(input: TutorApplicationInput): Promise<Session>;
  getMyApplication(actorUserId: ID): Promise<TutorApplication | null>;
  updateProfile(actorUserId: ID, tutorId: ID, input: TutorProfileInput): Promise<TutorProfile>;
  /** Admins only. */
  listApplications(actorUserId: ID): Promise<ApplicationDetails[]>;
  reviewApplication(actorUserId: ID, input: ReviewApplicationInput): Promise<TutorApplication>;
}

/** Reports, lesson disputes and the admin moderation queue. */
export interface ModerationService {
  /** Participants only: you can report people you have a conversation or booking with. */
  report(actorUserId: ID, input: ReportInput): Promise<Report>;
  listMine(actorUserId: ID): Promise<Report[]>;
  /** Admins only. */
  listQueue(actorUserId: ID): Promise<ReportDetails[]>;
  /** Admins only. Applies the action (warning, suspension, unpublishing, refund) and closes the report. */
  resolve(actorUserId: ID, input: ResolveReportInput): Promise<Report>;
}

export type TutorSort = "recommended" | "rating" | "priceAsc" | "priceDesc";

export interface TutorSearchFilters {
  query?: string;
  category?: SubjectCategory;
  subjectId?: ID;
  mode?: LessonMode;
  maxHourlyRateMinor?: number;
  minRating?: number;
  instantOnly?: boolean;
  verifiedOnly?: boolean;
  sort?: TutorSort;
}

export interface TutorRepository {
  search(filters: TutorSearchFilters): Promise<TutorProfile[]>;
  getById(id: ID): Promise<TutorProfile | null>;
  listFeatured(limit?: number): Promise<TutorProfile[]>;
  updateAvailability(
    actorUserId: ID,
    tutorId: ID,
    patch: { availability: AvailabilityWindow[]; instantBook: boolean },
  ): Promise<TutorProfile>;
  /**
   * Must fall within the platform limits. Only lessons requested afterwards use the
   * new rate; existing requests and bookings keep their agreed price.
   */
  updateHourlyRate(actorUserId: ID, tutorId: ID, hourlyRate: Money): Promise<TutorProfile>;
}

export interface SubjectRepository {
  list(): Promise<Subject[]>;
}

export interface ReviewRepository {
  listForTutor(tutorId: ID, limit?: number): Promise<Review[]>;
  create(actorUserId: ID, input: ReviewInput): Promise<Review>;
}

export interface FavoritesService {
  list(userId: ID): Promise<ID[]>;
  /** Returns the new favourite state. */
  toggle(userId: ID, tutorId: ID): Promise<boolean>;
}

/**
 * Bookings returned to a participant hide the exact meeting place until the booking is
 * confirmed and paid (`BookingDetails.meetingDetailsVisible`).
 */
export interface BookingService {
  getAvailableSlots(tutorId: ID, durationMinutes: number, days: number): Promise<DaySlots[]>;
  /** Students book for themselves; parents pass `forStudentId`. */
  create(actorUserId: ID, input: CreateBookingInput): Promise<Booking>;
  getById(actorUserId: ID, bookingId: ID): Promise<BookingDetails | null>;
  /** The actor must be the student or their parent. */
  listForStudent(actorUserId: ID, studentUserId: ID): Promise<BookingDetails[]>;
  listForTutor(actorUserId: ID, tutorId: ID): Promise<BookingDetails[]>;
  /** Refunds the in-app payment according to `domain/refunds.ts`. */
  cancel(actorUserId: ID, bookingId: ID): Promise<Booking>;
  respond(actorUserId: ID, bookingId: ID, accept: boolean): Promise<Booking>;
}

export type MessagingEvent =
  | { type: "message"; conversationId: ID; message: Message }
  | { type: "typing"; conversationId: ID; userId: ID; isTyping: boolean }
  | { type: "read"; conversationId: ID; userId: ID };

/**
 * Participants of a conversation: the learner, their parent (for managed students) and the
 * tutor. Nobody else can read or write it.
 */
export interface MessagingService {
  listConversations(userId: ID): Promise<ConversationSummary[]>;
  getConversation(userId: ID, conversationId: ID): Promise<ConversationSummary | null>;
  listMessages(userId: ID, conversationId: ID): Promise<Message[]>;
  /**
   * Returns the existing conversation between a learner and tutor, creating it if needed.
   * Parents pass the managed student's id.
   */
  openWithTutor(actorUserId: ID, tutorId: ID, studentUserId?: ID): Promise<ConversationSummary>;
  /**
   * Until the pair has a confirmed, paid booking, messages containing contact details or
   * off-platform arrangements are rejected with `contact_blocked` (see `domain/contact-guard.ts`).
   */
  send(senderId: ID, input: SendMessageInput): Promise<Message>;
  markRead(userId: ID, conversationId: ID): Promise<void>;
  /** Realtime events for every conversation the user participates in. */
  subscribe(userId: ID, listener: (event: MessagingEvent) => void): Unsubscribe;
}

export interface NotificationService {
  list(userId: ID): Promise<AppNotification[]>;
  markAllRead(userId: ID): Promise<void>;
  subscribe(userId: ID, listener: (notification: AppNotification) => void): Unsubscribe;
}

export interface PaymentResult {
  /**
   * "requires_action" means the student must finish on the provider's page (`redirectUrl`),
   * as most hosted card checkouts require. The provider's webhook then confirms the payment.
   */
  status: "simulated" | "succeeded" | "requires_action" | "failed";
  reference: string;
  amount: Money;
  redirectUrl?: string;
}

export interface PaymentService {
  /** "simulated" never moves money; "live" talks to a real provider through the server. */
  readonly kind: "simulated" | "live";
  /**
   * Charges the booking's in-app amount (`pricing.dueInApp`): the full price for online
   * lessons, only the commission for in-person ones. The amount always comes from the
   * stored booking, never from the client.
   */
  payForBooking(actorUserId: ID, bookingId: ID): Promise<PaymentResult>;
}

/** Lesson offers made by tutors inside a conversation. */
export interface ProposalService {
  /** Tutors only. Validates the slot and fixes the price from the tutor's current rate. */
  create(actorUserId: ID, input: CreateProposalInput): Promise<LessonProposal>;
  listForConversation(actorUserId: ID, conversationId: ID): Promise<LessonProposal[]>;
  getById(actorUserId: ID, proposalId: ID): Promise<ProposalDetails | null>;
  /**
   * The learner (or their parent) accepts with a payment option. Creates a confirmed booking
   * awaiting payment; `payments.payForBooking` completes it and unlocks the conversation.
   */
  accept(actorUserId: ID, input: AcceptProposalInput): Promise<Booking>;
  decline(actorUserId: ID, proposalId: ID): Promise<LessonProposal>;
  /** The tutor takes back a proposal that hasn't been answered. */
  withdraw(actorUserId: ID, proposalId: ID): Promise<LessonProposal>;
}

/**
 * Access to the private video classroom of a booking. The server issues a ticket only to the
 * booked student, their parent or the tutor, for a confirmed and paid online lesson, inside
 * the entry window. Knowing the classroom URL grants nothing.
 */
export interface ClassroomService {
  /**
   * Throws `forbidden` for anyone else and `classroom_closed` outside the window.
   * `demoIgnoreSchedule` is honoured by the prototype only, so testers can try the classroom
   * without waiting for a lesson time; the participant and payment checks still apply.
   */
  join(actorUserId: ID, bookingId: ID, options?: { demoIgnoreSchedule?: boolean }): Promise<ClassroomTicket>;
  leave(actorUserId: ID, bookingId: ID): Promise<void>;
}

export interface TutorDashboardService {
  getStats(actorUserId: ID, tutorId: ID): Promise<TutorStats>;
}

export interface PlatformService {
  /** Public: students need the commission to preview a lesson's price breakdown. */
  getSettings(): Promise<PlatformSettings>;
  /** Admins only. Affects lessons requested afterwards, never existing ones. */
  updateSettings(actorUserId: ID, input: PlatformSettingsInput): Promise<PlatformSettings>;
  /** Admins only. */
  getOverview(actorUserId: ID): Promise<AdminOverview>;
}

export interface DemoAccount {
  role: "student" | "tutor" | "admin" | "parent";
  email: string;
}

/** Prototype-only controls. Production builds never provide this. */
export interface DemoControls {
  accounts: DemoAccount[];
  signInAs(role: DemoAccount["role"]): Promise<Session>;
  reset(): Promise<void>;
}

export interface AppServices {
  mode: AppMode;
  auth: AuthService;
  account: AccountService;
  onboarding: TutorOnboardingService;
  moderation: ModerationService;
  tutors: TutorRepository;
  subjects: SubjectRepository;
  reviews: ReviewRepository;
  favorites: FavoritesService;
  bookings: BookingService;
  messaging: MessagingService;
  proposals: ProposalService;
  classroom: ClassroomService;
  notifications: NotificationService;
  payments: PaymentService;
  dashboard: TutorDashboardService;
  platform: PlatformService;
  demo?: DemoControls;
}
