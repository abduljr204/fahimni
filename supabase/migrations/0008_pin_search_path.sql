-- Pins the search path on the last helper without one (flagged by Supabase's security advisor).
alter function public.is_paid_and_confirmed(public.bookings) set search_path = public;
