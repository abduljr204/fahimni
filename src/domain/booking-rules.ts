import type {
  AvailabilityWindow,
  Booking,
  BookingStatus,
  DaySlots,
  Money,
  TutorProfile,
} from "./types";

/**
 * Pure booking rules shared by every backend. Keeping them free of I/O means the
 * Supabase implementation (or a database function) can apply exactly the same logic.
 */

export const SLOT_STEP_MINUTES = 30;
/** Students must book at least this far in advance. */
export const MIN_LEAD_TIME_MINUTES = 120;
/** Free cancellation is allowed up to this many hours before the lesson. */
export const FREE_CANCELLATION_HOURS = 12;

const BLOCKING_STATUSES: BookingStatus[] = ["pending", "confirmed"];

export function priceForDuration(hourlyRate: Money, durationMinutes: number): Money {
  return {
    currency: hourlyRate.currency,
    amountMinor: Math.round((hourlyRate.amountMinor * durationMinutes) / 60),
  };
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Builds the bookable start times for the next `days` days. A slot is available when
 * the whole lesson fits inside an availability window, respects the minimum lead
 * time and does not overlap an existing pending or confirmed booking.
 */
export function generateDaySlots(params: {
  availability: AvailabilityWindow[];
  bookings: Pick<Booking, "startsAt" | "durationMinutes" | "status">[];
  durationMinutes: number;
  from: Date;
  days: number;
  now?: Date;
}): DaySlots[] {
  const { availability, bookings, durationMinutes, from, days } = params;
  const now = params.now ?? new Date();
  const earliest = now.getTime() + MIN_LEAD_TIME_MINUTES * 60_000;

  const busy = bookings
    .filter((b) => BLOCKING_STATUSES.includes(b.status))
    .map((b) => {
      const start = new Date(b.startsAt).getTime();
      return { start, end: start + b.durationMinutes * 60_000 };
    });

  const result: DaySlots[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const windows = availability.filter((w) => w.weekday === day.getDay());
    const slots: DaySlots["slots"] = [];

    for (const window of windows) {
      const windowEnd = toMinutes(window.end);
      for (let m = toMinutes(window.start); m + durationMinutes <= windowEnd; m += SLOT_STEP_MINUTES) {
        const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, m);
        const startMs = start.getTime();
        const endMs = startMs + durationMinutes * 60_000;
        const available =
          startMs >= earliest && !busy.some((b) => overlaps(startMs, endMs, b.start, b.end));
        slots.push({ startsAt: start.toISOString(), available });
      }
    }

    slots.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    result.push({ date: localDateKey(day), slots });
  }
  return result;
}

export function isSlotBookable(
  tutor: Pick<TutorProfile, "availability">,
  bookings: Pick<Booking, "startsAt" | "durationMinutes" | "status">[],
  startsAt: string,
  durationMinutes: number,
  now = new Date(),
): boolean {
  const start = new Date(startsAt);
  const [day] = generateDaySlots({
    availability: tutor.availability,
    bookings,
    durationMinutes,
    from: start,
    days: 1,
    now,
  });
  return day.slots.some((s) => s.startsAt === start.toISOString() && s.available);
}

export function canCancel(booking: Pick<Booking, "status" | "startsAt">, now = new Date()) {
  return (
    BLOCKING_STATUSES.includes(booking.status) && new Date(booking.startsAt).getTime() > now.getTime()
  );
}

export function isFreeCancellation(booking: Pick<Booking, "startsAt">, now = new Date()) {
  return new Date(booking.startsAt).getTime() - now.getTime() >= FREE_CANCELLATION_HOURS * 3_600_000;
}

export function isUpcoming(booking: Pick<Booking, "status" | "startsAt" | "durationMinutes">, now = new Date()) {
  const end = new Date(booking.startsAt).getTime() + booking.durationMinutes * 60_000;
  return BLOCKING_STATUSES.includes(booking.status) && end > now.getTime();
}

/** Builds an iCalendar file so a confirmed lesson can be added to any calendar app. */
export function toICS(params: {
  uid: string;
  title: string;
  description: string;
  startsAt: string;
  durationMinutes: number;
  location?: string;
}): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = new Date(params.startsAt);
  const end = new Date(start.getTime() + params.durationMinutes * 60_000);
  const escape = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Fahimni//Lessons//EN",
    "BEGIN:VEVENT",
    `UID:${params.uid}`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${escape(params.title)}`,
    `DESCRIPTION:${escape(params.description)}`,
    params.location ? `LOCATION:${escape(params.location)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}
