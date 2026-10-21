import { Suspense } from "react";
import { TutorProfileScreen } from "@/features/tutors/tutor-profile-screen";

export default function TutorPage({ params }: PageProps<"/[lang]/tutors/[id]">) {
  return (
    <Suspense>
      <TutorProfileScreen params={params} />
    </Suspense>
  );
}
