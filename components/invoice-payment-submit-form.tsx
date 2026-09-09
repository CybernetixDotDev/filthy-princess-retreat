"use client";

import { useActionState } from "react";
import { submitInvoicePayment, type InvoicePaymentState } from "@/app/actions/invoices";

export function InvoicePaymentSubmitForm({ publicSlug }: { publicSlug: string }) {
  const [state, action, pending] = useActionState<InvoicePaymentState, FormData>(submitInvoicePayment, {});

  if (state.success) {
    return (
      <div className="notice success">
        <strong>Payment submitted</strong>
        <p>Thank you. We&apos;ve recorded that you&apos;ve made payment. Cally will verify the transfer before your retreat is confirmed.</p>
        <p>Your requested dates are being held while payment is reviewed.</p>
      </div>
    );
  }

  return (
    <form action={action} className="stack-form">
      <input type="hidden" name="public_slug" value={publicSlug} />
      {state.error && <p className="form-error">{state.error}</p>}
      <button className="button" disabled={pending}>{pending ? "Submitting..." : "I've Made Payment"}</button>
    </form>
  );
}