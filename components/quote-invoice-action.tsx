"use client";

import { useActionState } from "react";
import { createInvoiceForPublicQuote, type PublicInvoiceCreationState } from "@/app/actions/invoices";

export function QuoteInvoiceAction({ quoteSlug, hasInvoice }: { quoteSlug: string; hasInvoice?: boolean }) {
  const [state, action, pending] = useActionState<PublicInvoiceCreationState, FormData>(createInvoiceForPublicQuote, {});
  return <form id="quote-invoice-action" action={action}>{state.error && <p className="form-error">{state.error}</p>}<input type="hidden" name="quote_slug" value={quoteSlug} /><button className="button" disabled={pending}>{pending ? "Preparing invoice..." : state.error ? "Try Again" : hasInvoice ? "View Invoice & Pay" : "Generate Invoice & Pay"}</button></form>;
}