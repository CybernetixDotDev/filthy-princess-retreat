"use client";
import { useActionState } from "react";
import { submitEventEnquiry, type EnquiryState } from "@/app/actions/enquiries";
export function EventEnquiryForm({ eventId, placesRemaining }: { eventId: string; placesRemaining: number }) {
  const [state, action, pending] = useActionState<EnquiryState, FormData>(submitEventEnquiry, {});
  if (state.success) return <div className="notice success"><h2>Enquiry received</h2><p>Your request has been received. Your place is not yet confirmed or reserved. Cally will review your enquiry and be in touch; places are held only when a commercial quote is issued.</p></div>;
  return <form className="stack-form" action={action}><input type="hidden" name="event_id" value={eventId} /><label>Name<input name="full_name" required minLength={2} /></label><label>Email<input name="email" type="email" required /></label><label>Phone / WhatsApp<input name="phone" required /></label><label>Country<input name="country" required /></label><label>Places requested<input name="guest_count" type="number" min={1} max={placesRemaining} defaultValue={1} required /></label><label>Message / notes<textarea name="message" rows={4} /></label>{state.error && <p className="form-error">{state.error}</p>}<button className="button" type="submit" disabled={pending}>{pending ? "Sending…" : "Send Enquiry"}</button></form>;
}
