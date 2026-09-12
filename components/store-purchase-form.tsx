"use client";

import { useActionState } from "react";
import { createStoreOrder, type StoreOrderActionState } from "@/app/actions/store";
import { SubmitButton } from "@/components/submit-button";

export function StorePurchaseForm({ productId, requestKey, defaultEmail, buttonLabel }: { productId: string; requestKey: string; defaultEmail: string; buttonLabel: string }) {
  const [state, action] = useActionState<StoreOrderActionState, FormData>(createStoreOrder, {});
  return <form action={action} className="store-purchase-form">
    <input name="product_id" type="hidden" value={productId} />
    <input name="request_key" type="hidden" value={requestKey} />
    <label>Your email<input name="buyer_email" type="email" defaultValue={defaultEmail} autoComplete="email" required /></label>
    {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
    <SubmitButton className="button store-buy-button">{buttonLabel}</SubmitButton>
  </form>;
}
