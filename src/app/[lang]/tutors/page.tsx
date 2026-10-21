import { Suspense } from "react";
import { ExploreScreen } from "@/features/tutors/explore-screen";
import { TutorCardSkeleton } from "@/features/tutors/shared";

export default function TutorsPage({ searchParams }: PageProps<"/[lang]/tutors">) {
  return (
    <Suspense
      fallback={
        <div className="space-y-3 px-5 pt-24">
          {Array.from({ length: 3 }).map((_, i) => (
            <TutorCardSkeleton key={i} />
          ))}
        </div>
      }
    >
      <ExploreScreen searchParams={searchParams as Promise<{ q?: string; category?: string }>} />
    </Suspense>
  );
}
