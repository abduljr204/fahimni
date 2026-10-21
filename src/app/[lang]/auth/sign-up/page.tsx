import { Suspense } from "react";
import { SignUpScreen } from "@/features/auth/auth-screens";

export default function SignUpPage({ searchParams }: PageProps<"/[lang]/auth/sign-up">) {
  return (
    <Suspense>
      <SignUpScreen searchParams={searchParams as Promise<{ next?: string }>} />
    </Suspense>
  );
}
