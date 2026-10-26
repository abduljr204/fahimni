# Fahimni · فهمني — Interactive Prototype

Arabic-first tutoring marketplace for university students. This repository is the
**Phase 1 prototype**: every screen works with clearly labelled demo data, and the
code is structured so production services can be plugged in without rebuilding the UI.

> Everything you see in prototype mode is fictional. No real payments are taken and
> no messages or notifications leave the browser.

## Run it locally

Requirements: Node.js 20 or newer.

```bash
npm install
npm run dev        # http://localhost:3000  (redirects to /ar)
```

Production build check:

```bash
npm run build && npm start
```

Open it on your phone: run `npm run dev -- --hostname 0.0.0.0`, then visit
`http://<your-computer-ip>:3000` on the same Wi-Fi network.

## Share a preview link

The app deploys to Vercel as-is (no environment variables needed for prototype mode):

1. Push this folder to a GitHub repository.
2. On vercel.com → **Add New Project** → import the repository → **Deploy**.
3. Share the generated `*.vercel.app` URL. Each visitor gets their own private demo data.

## Demo script (≈5 minutes)

On a laptop, a **Demo guide** panel next to the app links to each journey.

| Journey | How |
|---|---|
| Create a student account | Profile → Create account (or "Quick sign-in → Sara") |
| Search & filter | Explore → category chips, search, filter sheet |
| Tutor profile | Tap any tutor card |
| Book a lesson | Tutor profile → Book a lesson → course → time → confirm 🎉 |
| Upcoming lessons | Lessons tab: join (simulated), message, cancel, rate past lessons |
| Messaging | Messages → open a chat → send; the tutor "types" and replies automatically |
| Tutor experience | Profile → Switch to tutor mode → accept Sara's pending request, edit schedule |
| Language | Profile → Language → English / العربية (full RTL ↔ LTR) |
| Ask → proposal → pay → classroom | As Sara: Youssef's profile → Ask a question (attach an exercise). Try sending a phone number to see the warning. Switch to tutor → open Sara's chat → Send lesson proposal. Switch back → Review and pay → chat unlocks → Lessons → Demo: enter now. Then as the tutor, enter the same classroom from the dashboard |
| Parent account | Profile → Try the parent account: lessons and messages for a younger student |
| Admin | Profile → Open admin dashboard: commission, price limits, payment options, classroom window |
| Reset | Tap the dark demo banner → Reset demo data |

Demo accounts (password `demo1234`): `sara@demo.fahimni` (student), `youssef@demo.fahimni` (tutor),
`fatima@demo.fahimni` (parent of a younger student), `admin@demo.fahimni` (admin).

Pre-booking chat, proposals, payments and the video classroom are described in
[docs/PRE_BOOKING_AND_CLASSROOM.md](docs/PRE_BOOKING_AND_CLASSROOM.md), including what is
simulated and what needs real services before launch.

Bookings with Youssef wait for his approval, so you can switch to tutor mode and accept
them yourself. Other tutors either confirm instantly or auto-accept after a few seconds.

## Modes

| | Prototype (`NEXT_PUBLIC_APP_MODE=prototype`, default) | Production (`=production`) |
|---|---|---|
| Data | Seeded demo data in the browser (localStorage) | Supabase Postgres |
| Auth | Demo accounts | Supabase Auth |
| Payments | Simulated, labelled | Real provider via server only |
| Demo data | Labelled everywhere | Never shown; the app refuses to fall back to it |

Production mode currently shows a "not configured" screen on purpose. Wiring it up
is Phase 4; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Tech

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript · Tailwind CSS 4 ·
Motion for React · TanStack Query · Zod.
