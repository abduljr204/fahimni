# Running Fahimni on the real backend

The app has two modes, chosen by `NEXT_PUBLIC_APP_MODE`:

- `prototype` (the default): demo data in the browser, nothing leaves the device.
- `production`: real accounts and data in Supabase, real video through LiveKit or Daily.

Payments are still simulated in both modes. See [What isn't connected yet](#what-isnt-connected-yet).

## How it fits together

- **Database:** `supabase/migrations`, applied in order. The browser has no direct table access
  except reading its own rows for live updates. Everything else goes through the functions in
  `0005_production_api.sql`, which check who is asking.
- **Browser services:** `src/services/supabase/`, implementing the same contracts as the mock
  services, so screens don't change between modes.
- **Server routes:** rules that need app code run in Route Handlers with the service-role key:
  `POST /api/messages` and `POST /api/proposals` (contact details check), `DELETE /api/account`,
  and `POST /api/classroom/[bookingId]/token` (video access).
- **Scheduled job:** `fahimni-maintenance` (pg_cron, every 5 minutes) completes finished lessons,
  expires proposals and sends lesson reminders.

## Environment variables

Set these in `.env.local`, and in Vercel under Project Settings → Environment Variables.

| Variable | Where it comes from | Secret? |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_MODE` | `production` | No |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | No |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase publishable key | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key | **Yes** |
| `NEXT_PUBLIC_VIDEO_PROVIDER` | `livekit` or `daily` | No |
| `LIVEKIT_URL` | LiveKit project settings, `wss://…livekit.cloud` | No |
| `LIVEKIT_API_KEY` | LiveKit project settings | **Yes** |
| `LIVEKIT_API_SECRET` | LiveKit project settings | **Yes** |
| `VIDEO_PROVIDER_API_KEY` | Daily dashboard, only with `daily` | **Yes** |
| `VIDEO_PROVIDER_URL` | `https://<subdomain>.daily.co`, only with `daily` | No |

Never put a `NEXT_PUBLIC_` prefix on a secret: those values are built into the browser code.

`SUPABASE_ACCESS_TOKEN` is only for setup tooling, not the app. Don't add it to Vercel, and delete
the token at supabase.com/dashboard/account/tokens when setup is finished.

## Supabase Auth settings

In Authentication → Sign In / Providers → Email:

- **Confirm email: off** for now. The sign-up flow signs people straight in, and Supabase's built-in
  mailer only delivers to members of your Supabase organization, so real users couldn't confirm.
  The trade-off is that nobody proves they own the address they sign up with. Turn this back on
  once a mail provider is connected and the sign-up screens handle "check your email".
- **Minimum password length: 8**, matching the sign-up form.

In Authentication → URL Configuration, set the **Site URL** to the live address and add
`https://your-domain/**` (and `http://localhost:3000/**` for local work) to **Redirect URLs**, or
password reset links won't return to the app.

## Making someone an admin

Nobody can make themselves an admin through the app. After the person signs up, run this in the
Supabase SQL editor:

```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'person@example.com');
```

Tutors stay hidden from search until an admin approves their application, so the first admin is
needed before any tutor can appear.

## What isn't connected yet

- **Payments:** `simulate_payment` records a payment with `provider = 'simulated'` and no money
  moves, yet it still unlocks contact sharing and the classroom. **Don't take real bookings until
  a gateway is connected.** Implement `src/services/payments/provider.ts`, mark bookings paid only
  from its webhook, and revoke `simulate_payment`.
- **Email, SMS and push:** in-app notifications work; nothing is sent outside the app. Adapters go
  in `src/services/notifications/delivery.ts`. Until a mail provider is set as custom SMTP in
  Supabase, password reset emails only reach members of your Supabase organization.
- **Meeting places:** nothing in the app writes `booking_meeting_details` yet, so in-person details
  are agreed in the chat, which unlocks after payment.
- **Files in the classroom:** the Materials tab explains that this needs storage. Chat attachments
  and tutor documents already use private storage.
- **Document retention:** `tutor_documents.delete_after` is set on review, but no job deletes the
  files yet.
