import { Suspense } from "react";
import { LegalScreen } from "@/features/legal/legal-screen";

export default function LegalPage({ params }: PageProps<"/[lang]/legal/[doc]">) {
  return (
    <Suspense>
      <LegalScreen params={params} />
    </Suspense>
  );
}
