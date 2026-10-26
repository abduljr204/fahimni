# Pre-booking chat, protected bookings and the video classroom

Implementation notes for the features that let students assess a tutor before paying,
keep contact details inside Fahimni until a lesson is paid, and hold online lessons in a
private in-app classroom. Read this before connecting real payments or video.

## The journey

1. A student (or a parent, for a younger student) reads the tutor's profile:
   qualifications, levels taught, experience, price, availability, intro video and reviews.
2. They ask a question in the chat and may attach textbook pages or exercises
   (images or PDF, max 5 MB, max 4 per message).
3. The tutor answers and taps **Send lesson proposal**: course, learning objectives,
   date and time (from their real availability), duration, format, general area
   (in person only) and the total price, fixed from their current rate and commission.
4. The student reviews the proposal on a checkout screen, chooses a payment option,
   reads the cancellation and refund terms, and pays.
5. Payment unlocks the conversation (contact details and the exact meeting place can now
   be shared) and, for online lessons, the private classroom.

## Contact protection before payment

Until the pair has a **confirmed and paid** booking, messages (and attachment file names,
and the proposal's "general area") are checked by `src/domain/contact-guard.ts` for:

| Kind | Examples caught |
|---|---|
| Phone numbers | `0912345678`, `+218 91 234 5678`, Arabic digits `٠٩١٢…`, spelled out (`zero nine one…`, `صفر تسعة واحد…`) |
| Emails | `name@gmail.com`, `name at gmail dot com`, mentioning gmail/hotmail |
| Social media | WhatsApp, Telegram, Instagram, Facebook, Snapchat, Viber… in English and Arabic (including `الانستا`, `عالواتس`), `@handles` |
| External links | URLs, `wa.me`, `t.me`, map links, bare domains |
| Exact places | building/flat/floor numbers, numbered streets (`شارع … 14`), GPS coordinates |
| Paying privately | "pay directly / outside the app", "skip the fees", IBAN/account numbers, `ادفعلي مباشرة`, `برا التطبيق`, `بدون عمولة` |

Cities, districts, exercise numbers, dates, prices and "can I pay the rest in cash at the
lesson?" (the official deposit option) are allowed.

When something is found, the sender sees a friendly explanation with the detected parts
highlighted, and can **edit the message** or **remove the details and send**. The composer
check is for speed; the messaging service runs the same check again and rejects the
message (`contact_blocked`), so a modified app can't skip it.

### Limits of detection (be honest about these)

- It is **pattern matching**. Creative spelling ("zer0 9 one", "w h a t s"), splitting a
  number across several messages, or code words will get through.
- It **cannot read text inside images or PDFs**. A photo of a phone number on paper passes.
  Production options: OCR uploaded images on the server (e.g. a cloud vision API) before
  they are delivered, and flag rather than block.
- It sometimes flags innocent text (e.g. a long numeric ID). The edit option keeps that cheap.
- Recommended in production: a "report this message" button, rate-limiting repeated
  blocked attempts, and an admin review queue.

These measures **reduce** fee bypassing; they cannot **prevent** private arrangements once
two people have met in a lesson. The product's real defence is value: payment protection,
refunds, a lesson record, reviews and reminders that only work inside Fahimni.

## Payment options and terms

Admins configure, per platform (Admin → Pricing rules):

1. **Full payment in the app**: the whole price is paid when booking.
2. **Deposit + cash** (in-person only): the platform fee is paid when booking and the rest
   is paid in cash to the tutor at the lesson. Example: 100 LYD total with 10% commission =
   10 LYD now + 90 LYD to the tutor. The deposit is part of the total, never an extra fee.

Online lessons are always paid in full in the app. The checkout shows the breakdown and the
terms for that exact lesson before confirming (`src/domain/refunds.ts`):

| Situation | Refund of the in-app payment |
|---|---|
| Tutor declines or cancels, any time | Full |
| Student cancels ≥ 12 h before | Full |
| Student cancels < 12 h before | Platform fee kept, rest refunded (deposit option: nothing refunded) |

Cash is only paid at the lesson, so nothing is owed in cash if the lesson doesn't happen.

## Who can see and do what

| Data / action | Who | Rule |
|---|---|---|
| Conversation and messages | The learner, their parent, the tutor | `is_participant` |
| Contact details in chat | Same participants | Only once a booking between them is confirmed **and** paid |
| Exact meeting place | Same participants | Same; until then only the general area is shown |
| Accept / pay a proposal | The learner or their parent | `acts_for_student` |
| Send / withdraw a proposal | The tutor | |
| Enter the classroom | Tutor, booked student, their parent | Confirmed, paid, online, inside the entry window |

Booking status (`pending/confirmed/declined/cancelled`), payment status
(`unpaid/…/paid/partially_refunded/refunded`) and lesson status
(`scheduled/in_progress/completed`) are separate fields.

### How cancellations and refunds affect access

- When a booking is cancelled or declined, its classroom closes immediately (the booking is
  no longer confirmed, so no ticket can be issued; a ticket already issued expires with the
  window).
- If it was the pair's **last** confirmed, paid booking, the conversation goes back to
  pre-booking rules and a system message says so. Messages already sent stay visible to both
  people: contact details that were shared cannot be "unshared".
- If another paid booking between them remains, the conversation stays unlocked.
- The exact meeting place of a cancelled booking is hidden again.

## The video classroom

- Each confirmed, paid online booking has one private room (`lesson-<bookingId>`), opened
  from **Join lesson** on the lessons list, the student home screen and the tutor dashboard.
- Entry window: opens `classroomOpensMinutesBefore` (default 15) before the start and closes
  `classroomClosesMinutesAfter` (default 30) after the end. Admins configure both.
- The URL contains only the booking id. Entering asks the server for a ticket
  (`ClassroomService.join`); anyone who isn't a participant gets the same refusal whether
  or not the booking exists. **Sharing the link grants nothing.**
- Features: live video/audio, mic and camera toggles, device selection, tutor screen
  sharing, in-call chat, material sharing, names and roles, connection status, lesson timer,
  waiting / reconnecting / permission-denied / ended states, Leave lesson, phone and desktop
  layouts.
- **No recording.** Rooms are created with recording disabled. A future recording feature
  must ask every participant for explicit consent per lesson, show a visible "recording"
  indicator, store files in a private bucket with a stated retention period, and let
  participants delete recordings.

### Integrating a video provider

Use an established service rather than building video infrastructure. Good fits:
LiveKit (open source or cloud), Daily, Twilio Video, Agora.

1. Create a project with the provider and note the API key, API secret and server URL.
2. Set `VIDEO_PROVIDER_API_KEY`, `VIDEO_PROVIDER_API_SECRET`, `VIDEO_PROVIDER_URL`
   (server-only, see `.env.example`).
3. Implement `issueVideoToken` in `src/services/video/server.ts` with the provider's server
   SDK, and a Route Handler `POST /api/classroom/[bookingId]/token` that calls the database
   function `classroom_access(booking_id)` as the signed-in user, then returns a
   `ClassroomTicket` with a token that expires when the window closes. Disable recording in
   the room options.
4. Implement a `VideoProvider` with the provider's client SDK in `src/services/video/` and
   return it from `getVideoProvider()` in production. The classroom screen doesn't change.
5. Implement `ClassroomService.join` in the Supabase services to call that Route Handler.

## Production checklist

- Run `supabase/migrations/0003_pre_booking_and_classroom.sql` after 0001 and 0002.
- Private storage buckets: `chat-attachments`, `intro-videos`; serve with short-lived signed URLs.
- Route Handlers (server, with the user's session; service-role key only where noted):
  - `POST /api/messages`: runs `detectContactDetails` for locked conversations, uploads
    attachments, inserts with the service role. (Unlocked conversations may insert directly.)
  - `POST /api/proposals`: validates the tutor's area with the same check, then inserts.
  - `POST /api/payments/checkout` and the provider webhook (see
    `src/services/payments/provider.ts`). Mark bookings paid only from the webhook; refunds
    on decline/cancel follow `domain/refunds.ts`.
  - `POST /api/classroom/[bookingId]/token` (above).
- Credentials: Supabase URL/keys, `PAYMENT_PROVIDER_SECRET_KEY`, the three video variables.
- Parents: an onboarding flow that links a parent account to a younger student
  (`student_profiles.guardian_user_id`), with age and consent checks appropriate for Libya.

## What the prototype simulates

| Feature | Prototype | Needs before launch |
|---|---|---|
| Chat, attachments, proposals | Works in the browser, stored locally; replies and some proposals come from a labelled simulated tutor | Supabase tables, storage, Realtime, Route Handlers |
| Contact detection | Real, same code as production | Server Route Handler; optional OCR and reporting |
| Payments and refunds | Simulated and labelled; no money moves | Payment provider, webhook, payouts to tutors |
| Unlocking after payment | Real logic | Same logic in SQL (migration 0003) |
| Classroom access checks | Real logic (participant, paid, online, window) | `classroom_access` + token Route Handler |
| Video | Your own camera/mic/screen are real; the other participant is simulated and labelled; nothing is transmitted | Video provider SDK and tokens |
| "Demo: enter now" | Skips only the time window, to try the classroom without waiting | Not present in production |
