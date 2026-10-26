import { Suspense } from "react";
import { CheckoutScreen } from "@/features/proposals/checkout-screen";

export default function ProposalCheckoutPage({ params }: PageProps<"/[lang]/proposals/[id]">) {
  return (
    <Suspense>
      <CheckoutScreen params={params} />
    </Suspense>
  );
}
