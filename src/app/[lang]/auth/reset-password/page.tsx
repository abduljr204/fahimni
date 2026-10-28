import { Suspense } from "react";
import { ResetPasswordScreen } from "@/features/auth/password-reset";

export default function ResetPasswordPage({ searchParams }: PageProps<"/[lang]/auth/reset-password">) {
  return (
    <Suspense>
      <ResetPasswordScreen searchParams={searchParams as Promise<{ token?: string }>} />
    </Suspense>
  );
}
