# Accounts, onboarding, notifications and trust & safety

Implementation notes for tutor sign-up and verification, parent accounts, notifications
outside the app, account settings, and reporting/moderation. Every feature works in the
prototype with demo services; this page lists what each needs in production.

## Tutor sign-up and verification

- **Apply:** `/become-tutor`, four steps: account → profile (headline, bio, university,
  city, languages, formats, levels) → teaching (courses, qualifications, hourly rate within
  the admin limits) → documents (an ID document and a qualification document, images or PDF)
  plus consent to verification and the terms.
- The new account is a tutor account with an **unpublished** profile: it never appears in
  search, can't be messaged and can't be booked. The tutor dashboard shows "under review"
  and links to schedule and price so they can prepare.
- **Admin → Verification:** see the application and documents, then approve (verified and
  published, tutor notified) or reject with a reason (shown to the applicant).
- Tutors edit their public profile at **Tutor dashboard → Edit public profile**.
- **Production:** private storage bucket `tutor-documents` (admins and the applicant only);
  delete documents 90 days after review (`delete_after`, scheduled job). Consider re-review
  when a verified tutor changes qualifications.

## Parents and younger students

- Sign-up asks **Student** or **Parent**. Students give their year of birth: under 18 is
  refused with a pointer to the parent option.
- Parents register themselves and their child (name, school, level, year, year of birth
  6–17) and must confirm they are the parent or legal guardian.
- The child gets a managed profile **with no login**. The parent books, pays, messages and
  may join the classroom for them. Parents can add more children in Account settings and
  choose which one they're managing.
- **Production:** the age check uses year of birth only (can be a year off); decide with a
  lawyer whether to collect a full date of birth or verify guardianship further.

## Notifications outside the app

- **Channels:** email, SMS (only with a mobile number), and device (push).
- **Categories:** lessons & bookings, messages, account & safety. Users choose per channel in
  Account settings; in-app notifications are always on. Password-reset emails always send.
- **Lesson reminders:** 24 h and 1 h before every confirmed, paid lesson, to the learner's
  side and the tutor (`sendDueReminders`; the prototype runs it every minute).
- **Delivery log:** Account settings shows what was sent. In the prototype everything is
  **simulated** and labelled; nothing leaves the browser. If the user allows device
  notifications, the prototype shows real browser notifications while the app is in the
  background.
- **Production:** implement channel adapters in `src/services/notifications/delivery.ts`,
  a worker that sends queued notifications, and a scheduled reminders job. Credentials:
  `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM`, `SMS_PROVIDER_API_KEY`, `SMS_SENDER_ID`,
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`. Push needs a service worker and the
  `push_subscriptions` table so notifications arrive when the app is closed.

## Account settings

`/settings`: name, mobile number (private, never shown to others), study details; children
(parents); notification preferences and device permission; delivery log; change password;
my reports; terms and policies; delete account.

- **Forgot password:** sign-in → "Forgot password?" → email with a single-use link valid for
  one hour. The response is the same whether or not the email exists. In the prototype the
  "email" is simulated and the page offers its link directly. Production uses Supabase Auth's
  reset flow.
- **Delete account:** confirm by typing your email. Refused while you (or your children) have
  upcoming paid lessons. Pending requests are cancelled and refunded; personal data is
  removed; bookings and payments stay anonymised for accounting.

## Reporting, disputes and moderation

- **Report** a message (flag next to it), a person (flag in the chat header) or a tutor
  profile (link at the bottom). Reasons: harassment, paying/meeting outside Fahimni,
  inappropriate content, spam, fake profile, safety, other (needs details). You can only
  report people you have a conversation with, or a published tutor.
- **Dispute** a paid lesson from My lessons → past (flag button), from the lesson time until
  14 days after: tutor no-show, not as agreed, charged incorrectly, other. One open dispute
  per lesson.
- **Automatic flag:** 3 blocked contact-sharing attempts within 24 hours create a report with
  the attempted messages as evidence.
- **Admin → Reports:** disputes first, then oldest first. Actions: no action, warn
  (notification to the user), suspend (can't sign in, message, book, pay or report; tutor
  hidden), hide tutor profile, refund (disputes, full or partial, through the same refund
  path as cancellations). Or close without action. The reporter is notified when handled.
- **Spam limits** (per user): 20 messages/minute, 5 bookings/10 minutes, 10 proposals/hour,
  5 reports/hour, 3 sign-ups/10 minutes, 3 password resets/15 minutes. The prototype counts
  in memory; production needs a shared store (e.g. Upstash Redis, `RATE_LIMIT_REDIS_URL`)
  in the Route Handlers, keyed by user and IP.

## Legal pages

`/legal/terms`, `/legal/privacy`, `/legal/refunds`, in Arabic and English, linked from
sign-up, the tutor application and Account settings. They are **drafts** written for this
app's actual rules and must be reviewed by a lawyer against Libyan law before launch. Set the
real support email in `src/config/app-config.ts` (`brand.supportEmail`).

## Production checklist

1. Run `supabase/migrations/0004_accounts_and_trust.sql` after 0001–0003.
2. Storage buckets (private): `tutor-documents`.
3. Route Handlers: tutor application (account + documents), account deletion, the
   notification worker and reminders job, report filing with rate limits.
4. Implement `account`, `onboarding` and `moderation` in `src/services/supabase/` using the
   SQL functions `review_application`, `file_report`, `resolve_report`.
5. Configure email, SMS and Web Push credentials (see `.env.example`).
