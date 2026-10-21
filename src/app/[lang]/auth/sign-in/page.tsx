import { Suspense } from "react";
import { SignInScreen } from "@/features/auth/auth-screens";

export default function SignInPage({ searchParams }: PageProps<"/[lang]/auth/sign-in">) {
  return (
    <Suspense>
      <SignInScreen searchParams={searchParams as Promise<{ next?: string }>} />
    </Suspense>
  );
}
