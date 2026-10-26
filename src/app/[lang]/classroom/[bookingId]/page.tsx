import { Suspense } from "react";
import { ClassroomScreen } from "@/features/classroom/classroom-screen";

export default function ClassroomPage({ params, searchParams }: PageProps<"/[lang]/classroom/[bookingId]">) {
  return (
    <Suspense>
      <ClassroomScreen params={params} searchParams={searchParams as Promise<{ demo?: string }>} />
    </Suspense>
  );
}
