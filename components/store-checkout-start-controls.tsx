"use client";

import { useActionState, useState } from "react";
import { createAuthenticatedStoreOrder } from "@/app/actions/store-checkout";
import { SubmitButton } from "@/components/submit-button";

export function StoreCheckoutStartControls({ product, request }: { product: string; request: string }) {
  const [requestKey] = useState(request);
  const [state, action] = useActionState(createAuthenticatedStoreOrder, {});
  return <form action={action} className="stack-form">
    <input type="hidden" name="product" value={product} />
    <input type="hidden" name="request" value={requestKey} />
    {state.error && <p role="alert">{state.error}</p>}
    <SubmitButton>Continue with this account</SubmitButton>
  </form>;
}
