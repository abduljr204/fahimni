"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { AvailabilityWindow, Message, Money, NotificationPreferences } from "@/domain/types";
import type {
  AcceptProposalInput,
  AccountProfileInput,
  AttachmentInput,
  ChangePasswordInput,
  ChildInput,
  ReportInput,
  ResolveReportInput,
  ReviewApplicationInput,
  TutorApplicationInput,
  TutorProfileInput,
  CreateBookingInput,
  CreateProposalInput,
  PlatformSettingsInput,
  ReviewInput,
} from "@/domain/validation";
import { qk } from "@/lib/query-keys";
import { getServices, type TutorSearchFilters } from "@/services";
import { useActiveChildId } from "./use-active-child";
import { useSession } from "./use-session";

/**
 * Data hooks: the only place where screens touch services. Each hook is a thin
 * TanStack Query wrapper, so swapping the backend never changes component code.
 */

const services = () => getServices();

function useUserId(): string | undefined {
  return useSession().session?.user.id;
}

/**
 * The learner the signed-in user acts for: themselves for students, the managed child for
 * parents (the prototype's demo parent manages one child).
 */
export function useActingStudentId(): string | undefined {
  const { session } = useSession();
  const activeChild = useActiveChildId();
  if (!session) return undefined;
  if (session.user.role === "parent") {
    const children = session.managedStudents ?? [];
    return (children.find((c) => c.userId === activeChild) ?? children[0])?.userId;
  }
  return session.user.role === "student" ? session.user.id : undefined;
}

// ─── Catalogue ──────────────────────────────────────────────────────────────

export function useSubjects() {
  return useQuery({ queryKey: qk.subjects, queryFn: () => services().subjects.list(), staleTime: Infinity });
}

export function useTutorSearch(filters: TutorSearchFilters) {
  return useQuery({
    queryKey: qk.tutors.search(filters),
    queryFn: () => services().tutors.search(filters),
    placeholderData: keepPreviousData,
  });
}

export function useFeaturedTutors() {
  return useQuery({ queryKey: qk.tutors.featured, queryFn: () => services().tutors.listFeatured(8) });
}

export function useTutor(id: string | undefined) {
  return useQuery({
    queryKey: qk.tutors.detail(id ?? ""),
    queryFn: () => services().tutors.getById(id!),
    enabled: Boolean(id),
  });
}

export function useTutorReviews(id: string) {
  return useQuery({ queryKey: qk.tutors.reviews(id), queryFn: () => services().reviews.listForTutor(id, 6) });
}

export function useAvailableSlots(tutorId: string, durationMinutes: number, days: number) {
  return useQuery({
    queryKey: qk.tutors.slots(tutorId, durationMinutes),
    queryFn: () => services().bookings.getAvailableSlots(tutorId, durationMinutes, days),
    placeholderData: keepPreviousData,
  });
}

// ─── Favourites ─────────────────────────────────────────────────────────────

export function useFavorites() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.favorites(userId ?? "guest"),
    queryFn: () => services().favorites.list(userId!),
    enabled: Boolean(userId),
  });
}

export function useToggleFavorite() {
  const userId = useUserId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (tutorId: string) => services().favorites.toggle(userId!, tutorId),
    // Optimistic update so the heart animates instantly.
    onMutate: async (tutorId) => {
      const key = qk.favorites(userId!);
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<string[]>(key) ?? [];
      client.setQueryData<string[]>(
        key,
        previous.includes(tutorId) ? previous.filter((id) => id !== tutorId) : [...previous, tutorId],
      );
      return { previous };
    },
    onError: (_err, _id, ctx) => ctx && client.setQueryData(qk.favorites(userId!), ctx.previous),
    onSettled: () => client.invalidateQueries({ queryKey: qk.favorites(userId!) }),
  });
}

// ─── Bookings ───────────────────────────────────────────────────────────────

export function useStudentBookings() {
  const userId = useUserId();
  const studentId = useActingStudentId();
  return useQuery({
    queryKey: qk.bookings.student(studentId ?? "guest"),
    queryFn: () => services().bookings.listForStudent(userId!, studentId!),
    enabled: Boolean(userId && studentId),
  });
}

export function useBooking(bookingId: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.bookings.detail(bookingId),
    queryFn: () => services().bookings.getById(userId!, bookingId),
    enabled: Boolean(userId),
    retry: false,
  });
}

export function useTutorBookings() {
  const { session } = useSession();
  const tutorId = session?.tutorId;
  return useQuery({
    queryKey: qk.bookings.tutor(tutorId ?? "none"),
    queryFn: () => services().bookings.listForTutor(session!.user.id, tutorId!),
    enabled: Boolean(tutorId),
  });
}

function useInvalidateBookings() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: qk.bookings.all }),
      client.invalidateQueries({ queryKey: ["tutors", "slots"] }),
      client.invalidateQueries({ queryKey: ["dashboard"] }),
      client.invalidateQueries({ queryKey: qk.platform.overview }),
      // Payments and cancellations lock or unlock conversations.
      client.invalidateQueries({ queryKey: qk.conversations.all }),
      client.invalidateQueries({ queryKey: qk.proposals.all }),
    ]);
}

export function useCreateBooking() {
  const userId = useUserId();
  const studentId = useActingStudentId();
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: async (input: Omit<CreateBookingInput, "forStudentId">) => {
      const forStudentId = studentId && studentId !== userId ? studentId : undefined;
      const booking = await services().bookings.create(userId!, { ...input, forStudentId });
      // Charges `pricing.dueInApp`. A live provider may answer "requires_action" with a
      // hosted checkout URL; the prototype always settles instantly with a simulated payment.
      const payment = await services().payments.payForBooking(userId!, booking.id);
      return { ...booking, paymentStatus: payment.status === "simulated" ? "simulated" : booking.paymentStatus };
    },
    onSettled: invalidate,
  });
}

/** Retries the in-app payment for a confirmed booking that isn't paid yet. */
export function usePayBooking() {
  const userId = useUserId();
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: (bookingId: string) => services().payments.payForBooking(userId!, bookingId),
    onSettled: invalidate,
  });
}

export function useCancelBooking() {
  const userId = useUserId();
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: (bookingId: string) => services().bookings.cancel(userId!, bookingId),
    onSettled: invalidate,
  });
}

export function useRespondToBooking() {
  const userId = useUserId();
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: ({ bookingId, accept }: { bookingId: string; accept: boolean }) =>
      services().bookings.respond(userId!, bookingId, accept),
    onSettled: invalidate,
  });
}

export function useCreateReview() {
  const userId = useUserId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewInput) => services().reviews.create(userId!, input),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: qk.bookings.all }),
        client.invalidateQueries({ queryKey: qk.tutors.all }),
      ]),
  });
}

// ─── Messaging ──────────────────────────────────────────────────────────────

export function useConversations() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.conversations.list(userId ?? "guest"),
    queryFn: () => services().messaging.listConversations(userId!),
    enabled: Boolean(userId),
  });
}

export function useConversation(id: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.conversations.detail(id),
    queryFn: () => services().messaging.getConversation(userId!, id),
    enabled: Boolean(userId),
    // "forbidden" won't change on retry.
    retry: false,
  });
}

export function useMessages(conversationId: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.conversations.messages(conversationId),
    queryFn: () => services().messaging.listMessages(userId!, conversationId),
    enabled: Boolean(userId),
    retry: false,
  });
}

export function useOpenConversation() {
  const userId = useUserId();
  const studentId = useActingStudentId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (tutorId: string) =>
      services().messaging.openWithTutor(userId!, tutorId, studentId && studentId !== userId ? studentId : undefined),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.conversations.all }),
  });
}

export interface OutgoingMessage {
  body: string;
  attachments?: AttachmentInput[];
}

export function useSendMessage(conversationId: string) {
  const userId = useUserId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ body, attachments = [] }: OutgoingMessage) =>
      services().messaging.send(userId!, { conversationId, body, attachments }),
    onMutate: async ({ body, attachments = [] }) => {
      const key = qk.conversations.messages(conversationId);
      await client.cancelQueries({ queryKey: key });
      const optimistic: Message = {
        id: `optimistic-${Date.now()}`,
        conversationId,
        senderId: userId!,
        body,
        attachments: attachments.length ? attachments.map((a, i) => ({ ...a, id: `optimistic-att-${i}` })) : undefined,
        createdAt: new Date().toISOString(),
      };
      client.setQueryData<Message[]>(key, (old = []) => [...old, optimistic]);
      return { optimisticId: optimistic.id };
    },
    onSuccess: (message, _body, ctx) => {
      client.setQueryData<Message[]>(qk.conversations.messages(conversationId), (old = []) => {
        const withoutOptimistic = old.filter((m) => m.id !== ctx?.optimisticId);
        return withoutOptimistic.some((m) => m.id === message.id) ? withoutOptimistic : [...withoutOptimistic, message];
      });
    },
    onError: (_e, _b, ctx) =>
      client.setQueryData<Message[]>(qk.conversations.messages(conversationId), (old = []) =>
        old.filter((m) => m.id !== ctx?.optimisticId),
      ),
    onSettled: () => client.invalidateQueries({ queryKey: qk.conversations.list(userId!) }),
  });
}

export function useMarkConversationRead() {
  const userId = useUserId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (conversationId: string) => services().messaging.markRead(userId!, conversationId),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: qk.conversations.list(userId!) }),
        client.invalidateQueries({ queryKey: qk.notifications(userId!) }),
      ]),
  });
}

// ─── Lesson proposals ───────────────────────────────────────────────────────

export function useConversationProposals(conversationId: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.proposals.conversation(conversationId),
    queryFn: () => services().proposals.listForConversation(userId!, conversationId),
    enabled: Boolean(userId),
    retry: false,
  });
}

export function useProposal(proposalId: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.proposals.detail(proposalId),
    queryFn: () => services().proposals.getById(userId!, proposalId),
    enabled: Boolean(userId),
    retry: false,
  });
}

export function useCreateProposal() {
  const userId = useUserId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProposalInput) => services().proposals.create(userId!, input),
    onSuccess: (p) =>
      Promise.all([
        client.invalidateQueries({ queryKey: qk.proposals.conversation(p.conversationId) }),
        client.invalidateQueries({ queryKey: qk.conversations.messages(p.conversationId) }),
      ]),
  });
}

/** Accepts a proposal and pays the in-app part straight away (simulated in the prototype). */
export function useAcceptProposal() {
  const userId = useUserId();
  const invalidate = useInvalidateBookings();
  return useMutation({
    mutationFn: async (input: AcceptProposalInput) => {
      const booking = await services().proposals.accept(userId!, input);
      // A live provider may answer "requires_action" with a hosted checkout URL to open.
      const payment = await services().payments.payForBooking(userId!, booking.id);
      return { booking, payment };
    },
    onSettled: invalidate,
  });
}

export function useRespondToProposal() {
  const userId = useUserId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ proposalId, action }: { proposalId: string; action: "decline" | "withdraw" }) =>
      action === "decline" ? services().proposals.decline(userId!, proposalId) : services().proposals.withdraw(userId!, proposalId),
    onSettled: () => client.invalidateQueries({ queryKey: qk.proposals.all }),
  });
}

// ─── Classroom ──────────────────────────────────────────────────────────────

export function useJoinClassroom() {
  const userId = useUserId();
  return useMutation({
    mutationFn: ({ bookingId, demoIgnoreSchedule }: { bookingId: string; demoIgnoreSchedule?: boolean }) =>
      services().classroom.join(userId!, bookingId, { demoIgnoreSchedule }),
  });
}

// ─── Notifications ──────────────────────────────────────────────────────────

export function useNotifications() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.notifications(userId ?? "guest"),
    queryFn: () => services().notifications.list(userId!),
    enabled: Boolean(userId),
  });
}

export function useMarkAllNotificationsRead() {
  const userId = useUserId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => services().notifications.markAllRead(userId!),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.notifications(userId!) }),
  });
}

/**
 * Keeps caches fresh from realtime events (Supabase Realtime in production, the
 * simulator in prototype mode). Mounted once in the app shell.
 */
export function useRealtimeSync(onNotification?: (n: import("@/domain/types").AppNotification) => void) {
  const userId = useUserId();
  const client = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const s = services();
    const offMessages = s.messaging.subscribe(userId, (event) => {
      if (event.type === "message") {
        client.setQueryData<Message[]>(qk.conversations.messages(event.conversationId), (old) =>
          old && !old.some((m) => m.id === event.message.id) ? [...old, event.message] : old,
        );
        client.invalidateQueries({ queryKey: qk.conversations.list(userId) });
        if (event.message.kind === "proposal") client.invalidateQueries({ queryKey: qk.proposals.conversation(event.conversationId) });
        if (event.message.kind === "system") client.invalidateQueries({ queryKey: qk.conversations.detail(event.conversationId) });
      }
      if (event.type === "read") {
        client.invalidateQueries({ queryKey: qk.conversations.messages(event.conversationId) });
      }
    });
    const offNotifications = s.notifications.subscribe(userId, (n) => {
      client.invalidateQueries({ queryKey: qk.notifications(userId) });
      if (n.type.startsWith("booking_") || n.type.startsWith("proposal_")) {
        client.invalidateQueries({ queryKey: qk.bookings.all });
        client.invalidateQueries({ queryKey: qk.proposals.all });
        client.invalidateQueries({ queryKey: ["dashboard"] });
      }
      onNotification?.(n);
    });
    return () => {
      offMessages();
      offNotifications();
    };
  }, [userId, client, onNotification]);
}

// ─── Tutor dashboard ────────────────────────────────────────────────────────

export function useTutorStats() {
  const { session } = useSession();
  const tutorId = session?.tutorId;
  return useQuery({
    queryKey: qk.dashboard(tutorId ?? "none"),
    queryFn: () => services().dashboard.getStats(session!.user.id, tutorId!),
    enabled: Boolean(tutorId),
  });
}

export function useUpdateAvailability() {
  const { session } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: { availability: AvailabilityWindow[]; instantBook: boolean }) =>
      services().tutors.updateAvailability(session!.user.id, session!.tutorId!, patch),
    onSuccess: (tutor) => {
      client.setQueryData(qk.tutors.detail(tutor.id), tutor);
      client.invalidateQueries({ queryKey: ["tutors", "slots"] });
    },
  });
}

export function useUpdateHourlyRate() {
  const { session } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (rate: Money) => services().tutors.updateHourlyRate(session!.user.id, session!.tutorId!, rate),
    onSuccess: (tutor) => {
      client.setQueryData(qk.tutors.detail(tutor.id), tutor);
      client.invalidateQueries({ queryKey: qk.tutors.all });
      client.invalidateQueries({ queryKey: qk.platform.overview });
    },
  });
}

// ─── Platform & admin ───────────────────────────────────────────────────────

export function usePlatformSettings() {
  return useQuery({ queryKey: qk.platform.settings, queryFn: () => services().platform.getSettings() });
}

export function useUpdatePlatformSettings() {
  const userId = useUserId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: PlatformSettingsInput) => services().platform.updateSettings(userId!, input),
    onSuccess: (settings) => {
      client.setQueryData(qk.platform.settings, settings);
      client.invalidateQueries({ queryKey: qk.platform.overview });
    },
  });
}

export function useAdminOverview() {
  const { session, role } = useSession();
  return useQuery({
    queryKey: qk.platform.overview,
    queryFn: () => services().platform.getOverview(session!.user.id),
    enabled: role === "admin",
  });
}

/** True while the other participant is typing in the given conversation. */
export function useTypingIndicator(conversationId: string) {
  const userId = useUserId();
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (!userId) return;
    return services().messaging.subscribe(userId, (event) => {
      if (event.conversationId !== conversationId) return;
      if (event.type === "typing" && event.userId !== userId) setTyping(event.isTyping);
      if (event.type === "message" && event.message.senderId !== userId) setTyping(false);
    });
  }, [userId, conversationId]);
  return typing;
}

// ─── Account ────────────────────────────────────────────────────────────────

export function useUpdateAccountProfile() {
  const userId = useUserId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: AccountProfileInput) => services().account.updateProfile(userId!, input),
    onSuccess: () => client.invalidateQueries(),
  });
}

export function useChangePassword() {
  const userId = useUserId();
  return useMutation({ mutationFn: (input: ChangePasswordInput) => services().account.changePassword(userId!, input) });
}

export function usePreferences() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.account.preferences(userId ?? "guest"),
    queryFn: () => services().account.getPreferences(userId!),
    enabled: Boolean(userId),
  });
}

export function useUpdatePreferences() {
  const userId = useUserId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (prefs: NotificationPreferences) => services().account.updatePreferences(userId!, prefs),
    onSuccess: (prefs) => client.setQueryData(qk.account.preferences(userId!), prefs),
  });
}

export function useDeliveries() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.account.deliveries(userId ?? "guest"),
    queryFn: () => services().account.listDeliveries(userId!),
    enabled: Boolean(userId),
  });
}

export function useAddChild() {
  const userId = useUserId();
  return useMutation({ mutationFn: (input: ChildInput) => services().account.addChild(userId!, input) });
}

export function useDeleteAccount() {
  const userId = useUserId();
  return useMutation({ mutationFn: (confirmEmail: string) => services().account.deleteAccount(userId!, confirmEmail) });
}

// ─── Tutor onboarding ───────────────────────────────────────────────────────

/** Creates the tutor account and signs it in; the session listener picks up the change. */
export function useApplyAsTutor() {
  return useMutation({ mutationFn: (input: TutorApplicationInput) => services().onboarding.apply(input) });
}

export function useMyApplication() {
  const { session } = useSession();
  return useQuery({
    queryKey: qk.onboarding.mine(session?.user.id ?? "guest"),
    queryFn: () => services().onboarding.getMyApplication(session!.user.id),
    enabled: session?.user.role === "tutor",
  });
}

export function useUpdateTutorProfile() {
  const { session } = useSession();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: TutorProfileInput) => services().onboarding.updateProfile(session!.user.id, session!.tutorId!, input),
    onSuccess: (tutor) => {
      client.setQueryData(qk.tutors.detail(tutor.id), tutor);
      client.invalidateQueries({ queryKey: qk.tutors.all });
    },
  });
}

export function useApplications() {
  const { session, role } = useSession();
  return useQuery({
    queryKey: qk.onboarding.queue,
    queryFn: () => services().onboarding.listApplications(session!.user.id),
    enabled: role === "admin",
  });
}

export function useReviewApplication() {
  const userId = useUserId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewApplicationInput) => services().onboarding.reviewApplication(userId!, input),
    onSettled: () =>
      Promise.all([client.invalidateQueries({ queryKey: qk.onboarding.queue }), client.invalidateQueries({ queryKey: qk.tutors.all })]),
  });
}

// ─── Trust & safety ─────────────────────────────────────────────────────────

export function useReport() {
  const userId = useUserId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ReportInput) => services().moderation.report(userId!, input),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.moderation.all }),
  });
}

export function useMyReports() {
  const userId = useUserId();
  return useQuery({
    queryKey: qk.moderation.mine(userId ?? "guest"),
    queryFn: () => services().moderation.listMine(userId!),
    enabled: Boolean(userId),
  });
}

export function useReportQueue() {
  const { session, role } = useSession();
  return useQuery({
    queryKey: qk.moderation.queue,
    queryFn: () => services().moderation.listQueue(session!.user.id),
    enabled: role === "admin",
  });
}

export function useResolveReport() {
  const userId = useUserId();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ResolveReportInput) => services().moderation.resolve(userId!, input),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: qk.moderation.all }),
        client.invalidateQueries({ queryKey: qk.platform.overview }),
        client.invalidateQueries({ queryKey: qk.tutors.all }),
      ]),
  });
}
