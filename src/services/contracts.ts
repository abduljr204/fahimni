import type { AppMode } from "@/config/app-config";
import type {
  AppNotification,
  AvailabilityWindow,
  Booking,
  BookingDetails,
  ConversationSummary,
  DaySlots,
  ID,
  LessonMode,
  Message,
  Review,
  Session,
  Subject,
  SubjectCategory,
  TutorProfile,
  TutorStats,
} from "@/domain/types";
import type { CreateBookingInput, ReviewInput, SignInInput, SignUpInput } from "@/domain/validation";

/**
 * Service contracts. The UI depends only on these interfaces; each backend
 * (mock for the prototype, Supabase for production) provides an implementation.
 * Every method that acts on behalf of a user takes the acting user's id so that a
 * server implementation can verify it against the authenticated session.
 */

export type Unsubscribe = () => void;

export interface AuthService {
  getSession(): Promise<Session | null>;
  signUp(input: SignUpInput): Promise<Session>;
  signIn(input: SignInInput): Promise<Session>;
  signOut(): Promise<void>;
  onAuthStateChange(listener: (session: Session | null) => void): Unsubscribe;
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

export interface BookingService {
  getAvailableSlots(tutorId: ID, durationMinutes: number, days: number): Promise<DaySlots[]>;
  create(actorUserId: ID, input: CreateBookingInput): Promise<Booking>;
  getById(actorUserId: ID, bookingId: ID): Promise<BookingDetails | null>;
  listForStudent(studentUserId: ID): Promise<BookingDetails[]>;
  listForTutor(actorUserId: ID, tutorId: ID): Promise<BookingDetails[]>;
  cancel(actorUserId: ID, bookingId: ID): Promise<Booking>;
  respond(actorUserId: ID, bookingId: ID, accept: boolean): Promise<Booking>;
}

export type MessagingEvent =
  | { type: "message"; conversationId: ID; message: Message }
  | { type: "typing"; conversationId: ID; userId: ID; isTyping: boolean }
  | { type: "read"; conversationId: ID; userId: ID };

export interface MessagingService {
  listConversations(userId: ID): Promise<ConversationSummary[]>;
  getConversation(userId: ID, conversationId: ID): Promise<ConversationSummary | null>;
  listMessages(userId: ID, conversationId: ID): Promise<Message[]>;
  /** Returns the existing conversation between a student and tutor, creating it if needed. */
  openWithTutor(studentUserId: ID, tutorId: ID): Promise<ConversationSummary>;
  send(senderId: ID, conversationId: ID, body: string): Promise<Message>;
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
  status: "simulated" | "authorized" | "failed";
  reference: string;
}

export interface PaymentService {
  /** "simulated" never moves money; "live" talks to a real provider through the server. */
  readonly kind: "simulated" | "live";
  authorizeBooking(actorUserId: ID, booking: Booking): Promise<PaymentResult>;
}

export interface TutorDashboardService {
  getStats(actorUserId: ID, tutorId: ID): Promise<TutorStats>;
}

export interface DemoAccount {
  role: "student" | "tutor";
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
  tutors: TutorRepository;
  subjects: SubjectRepository;
  reviews: ReviewRepository;
  favorites: FavoritesService;
  bookings: BookingService;
  messaging: MessagingService;
  notifications: NotificationService;
  payments: PaymentService;
  dashboard: TutorDashboardService;
  demo?: DemoControls;
}
