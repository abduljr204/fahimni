import { Suspense } from "react";
import { BookingScreen } from "@/features/booking/booking-screen";

export default function BookPage({ params, searchParams }: PageProps<"/[lang]/book/[tutorId]">) {
  return (
    <Suspense>
      <BookingScreen params={params} searchParams={searchParams as Promise<{ subject?: string; start?: string }>} />
    </Suspense>
  );
}
