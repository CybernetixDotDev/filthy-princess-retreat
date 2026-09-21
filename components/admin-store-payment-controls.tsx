"use client";
import { useActionState } from "react";
import { reviewStorePayment } from "@/app/admin/store/payment-actions";

export function AdminStorePaymentControls({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(reviewStorePayment, {});
  return <form action={action} className="stack-form">
    <input type="hidden" name="order_id" value={orderId} />
    <p>Verify only after independently confirming receipt of the payment.</p>
    <label>Verification note (optional)<textarea name="note" maxLength={2000} /></label>
    {state.error && <p role="alert">{state.error}</p>}{state.message && <p role="status">{state.message}</p>}
    <div><button type="submit" name="decision" value="verify" disabled={pending}>Verify Payment</button>{" "}<button type="submit" name="decision" value="reject" disabled={pending}>Reject Payment</button></div>
  </form>;
}
