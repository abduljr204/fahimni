"use client";

import { AnimatePresence, motion } from "motion/react";
import { CalendarClock, CalendarX2, Check, CreditCard, Flag, Hourglass, MessageCircle, Star, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AppLink } from "@/components/layout/app-link";
import { PageTitle, Screen } from "@/components/layout/screen";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Textarea } from "@/components/ui/field";
import { BottomSheet, ConfirmDialog } from "@/components/ui/overlays";
import { Badge, Skeleton, StarInput } from "@/components/ui/primitives";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { isPaid } from "@/domain/access";
import { canCancel, isFreeCancellation, isUpcoming } from "@/domain/booking-rules";
import { refundFor } from "@/domain/refunds";
import type { BookingDetails } from "@/domain/types";
import { AuthGate } from "@/features/auth/auth-gate";
import { JoinLessonButton } from "@/features/classroom/join-lesson-button";
import { ReportSheet, type ReportTarget } from "@/features/moderation/report-sheet";
import {
  useActingStudentId,
  useCancelBooking,
  useCreateReview,
  useOpenConversation,
  usePayBooking,
  useRespondToBooking,
  useStudentBookings,
  useTutorBookings,
} from "@/hooks/use-data";
import { useSession } from "@/hooks/use-session";
import { useI18n } from "@/i18n/i18n-provider";
import { LessonCard } from "./lesson-card";

type Tab = "upcoming" | "pending" | "past";

/** Problems can be reported for paid lessons, from the lesson time until 14 days after. */
function canDispute(b: BookingDetails, now = Date.now()) {
  const start = new Date(b.startsAt).getTime();
  return b.status === "confirmed" && isPaid(b.paymentStatus) && now >= start && now <= start + 14 * 86_400_000;
}

function ReviewSheet({ booking, onClose }: { booking: BookingDetails | null; onClose: () => void }) {
  const { t, l, fmt } = useI18n();
  const toast = useToast();
  const create = useCreateReview();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState(false);

  const submit = () => {
    if (!booking) return;
    if (!rating) {
      setError(true);
      return;
    }
    create.mutate(
      { bookingId: booking.id, rating, comment: comment || undefined },
      {
        onSuccess: () => {
          toast.success(t.lessons.reviewThanks);
          setRating(0);
          setComment("");
          onClose();
        },
        onError: () => toast.error(t.common.somethingWrong),
      },
    );
  };

  return (
    <BottomSheet
      open={Boolean(booking)}
      onClose={onClose}
      title={booking ? fmt(t.lessons.reviewTitle, { name: l(booking.tutor.displayName) }) : undefined}
      footer={
        <Button block size="lg" onClick={submit} loading={create.isPending}>
          {t.lessons.submitReview}
        </Button>
      }
    >
      <div className="py-2">
        <StarInput
          value={rating}
          onChange={(v) => {
            setRating(v);
            setError(false);
          }}
          label={t.lessons.review}
        />
        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0, x: [0, -6, 6, -3, 3, 0] }}
              exit={{ opacity: 0 }}
              className="mt-2 text-center text-sm font-medium text-coral-600"
            >
              {t.validation.pickRating}
            </motion.p>
          )}
        </AnimatePresence>
        <div className="mt-5">
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t.lessons.reviewPlaceholder} maxLength={600} />
        </div>
      </div>
    </BottomSheet>
  );
}

function LessonsList() {
  const { t, href, fmt, money } = useI18n();
  const { role } = useSession();
  const router = useRouter();
  const toast = useToast();
  const isTutor = role === "tutor";
  const studentQuery = useStudentBookings();
  const tutorQuery = useTutorBookings();
  const { data, isLoading } = isTutor ? tutorQuery : studentQuery;
  const cancel = useCancelBooking();
  const respond = useRespondToBooking();
  const pay = usePayBooking();
  const openChat = useOpenConversation();

  const [tab, setTab] = useState<Tab>("upcoming");
  const [toCancel, setToCancel] = useState<BookingDetails | null>(null);
  const [toReview, setToReview] = useState<BookingDetails | null>(null);
  const [disputing, setDisputing] = useState<ReportTarget | null>(null);

  const groups = useMemo(() => {
    const all = data ?? [];
    return {
      upcoming: all.filter((b) => b.status === "confirmed" && isUpcoming(b)),
      pending: all.filter((b) => b.status === "pending" && isUpcoming(b)),
      past: all.filter((b) => !isUpcoming(b)).reverse(),
    };
  }, [data]);

  const list = groups[tab];

  const message = (b: BookingDetails) => {
    if (isTutor) {
      router.push(href("/messages"));
      return;
    }
    openChat.mutate(b.tutor.id, { onSuccess: (c) => router.push(href(`/messages/${c.id}`)) });
  };

  const actionsFor = (b: BookingDetails) => {
    if (tab === "upcoming") {
      return (
        <>
          {!isTutor && !isPaid(b.paymentStatus) ? (
            <Button size="sm" variant="accent" className="flex-1" loading={pay.isPending && pay.variables === b.id} onClick={() => pay.mutate(b.id)}>
              <CreditCard className="size-4" /> {t.lessons.payNow}
            </Button>
          ) : (
            <JoinLessonButton booking={b} />
          )}
          <Button size="sm" variant="secondary" className="flex-1" onClick={() => message(b)}>
            <MessageCircle className="size-4" /> {t.tutor.message}
          </Button>
          {canCancel(b) && (
            <Button size="sm" variant="ghost" onClick={() => setToCancel(b)} aria-label={t.lessons.cancel}>
              <X className="size-4" />
            </Button>
          )}
        </>
      );
    }
    if (tab === "pending") {
      if (isTutor) {
        return (
          <>
            <Button
              size="sm"
              className="flex-1"
              loading={respond.isPending && respond.variables?.bookingId === b.id && respond.variables.accept}
              onClick={() => respond.mutate({ bookingId: b.id, accept: true }, { onSuccess: () => toast.success(t.dashboard.accepted) })}
            >
              <Check className="size-4" /> {t.dashboard.accept}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              loading={respond.isPending && respond.variables?.bookingId === b.id && !respond.variables.accept}
              onClick={() => respond.mutate({ bookingId: b.id, accept: false }, { onSuccess: () => toast.info(t.dashboard.declined) })}
            >
              {t.dashboard.decline}
            </Button>
          </>
        );
      }
      return (
        <Button size="sm" variant="outline" block onClick={() => setToCancel(b)}>
          {t.lessons.cancel}
        </Button>
      );
    }
    if (!isTutor && b.lessonStatus === "completed") {
      const problem = canDispute(b) && (
        <Button size="sm" variant="ghost" onClick={() => setDisputing({ kind: "dispute", targetUserId: b.tutor.userId, bookingId: b.id })} aria-label={t.report.problem}>
          <Flag className="size-4" />
        </Button>
      );
      return b.reviewId ? (
        <>
          <Badge tone="mint" className="mx-auto">
            <Check className="size-3.5" /> {t.lessons.reviewed}
          </Badge>
          {problem}
        </>
      ) : (
        <>
          <Button size="sm" variant="accent" className="flex-1" onClick={() => setToReview(b)}>
            <Star className="size-4" /> {t.lessons.review}
          </Button>
          {problem}
        </>
      );
    }
    return null;
  };

  // Shown before confirming, using the same rules the service applies.
  const cancelBody = (b: BookingDetails) => {
    const quote = refundFor(b, isTutor ? "tutor" : "student");
    const terms = isTutor || isFreeCancellation(b) ? t.lessons.cancelBodyFree : t.lessons.cancelBodyLate;
    if (!isPaid(b.paymentStatus)) return terms;
    const refund = quote.refund.amountMinor > 0 ? fmt(t.lessons.refundLine, { amount: money(quote.refund) }) : t.lessons.noRefundLine;
    return `${terms} ${refund}`;
  };

  const empty = {
    upcoming: { icon: <CalendarClock />, title: t.lessons.emptyUpcomingTitle, body: t.lessons.emptyUpcomingBody },
    pending: { icon: <Hourglass />, title: t.lessons.emptyPendingTitle, body: t.lessons.emptyPendingBody },
    past: { icon: <CalendarX2 />, title: t.lessons.emptyPastTitle, body: t.lessons.emptyPastBody },
  }[tab];

  return (
    <>
      <div className="px-5">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: "upcoming", label: t.lessons.upcoming, badge: groups.upcoming.length || undefined },
            { value: "pending", label: t.lessons.pending, badge: groups.pending.length || undefined },
            { value: "past", label: t.lessons.past },
          ]}
        />
      </div>
      <div className="space-y-3 px-5 pt-4">
        {isLoading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-3xl" />)
        ) : (
          <AnimatePresence mode="popLayout" initial={false}>
            {list.length === 0 ? (
              <motion.div key={`empty-${tab}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <EmptyState
                  icon={empty.icon}
                  title={empty.title}
                  body={empty.body}
                  action={
                    !isTutor && tab !== "past" ? (
                      <AppLink href="/tutors">
                        <Button variant="secondary">{t.lessons.findTutor}</Button>
                      </AppLink>
                    ) : undefined
                  }
                />
              </motion.div>
            ) : (
              list.map((b, i) => (
                <LessonCard key={`${tab}-${b.id}`} booking={b} perspective={isTutor ? "tutor" : "student"} actions={actionsFor(b)} index={i} />
              ))
            )}
          </AnimatePresence>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(toCancel)}
        onClose={() => setToCancel(null)}
        title={t.lessons.cancelTitle}
        body={toCancel ? cancelBody(toCancel) : undefined}
        confirmLabel={t.lessons.cancel}
        cancelLabel={t.lessons.keep}
        loading={cancel.isPending}
        icon={<CalendarX2 className="size-6" />}
        onConfirm={() =>
          toCancel &&
          cancel.mutate(toCancel.id, {
            onSuccess: () => {
              toast.success(t.lessons.cancelled);
              setToCancel(null);
            },
            onError: () => toast.error(t.common.somethingWrong),
          })
        }
      />
      <ReviewSheet booking={toReview} onClose={() => setToReview(null)} />
      <ReportSheet target={disputing} onClose={() => setDisputing(null)} />
    </>
  );
}

export function LessonsScreen() {
  const { t, l, fmt } = useI18n();
  const { session } = useSession();
  const actingStudentId = useActingStudentId();
  const child = session?.user.role === "parent" ? session.managedStudents?.find((c) => c.userId === actingStudentId) : undefined;
  return (
    <Screen>
      <PageTitle title={child ? fmt(t.lessons.titleFor, { name: l(child.displayName).split(" ")[0] }) : t.lessons.title} />
      <AuthGate>
        <LessonsList />
      </AuthGate>
    </Screen>
  );
}
