"use client";

import { useActionState } from "react";
import { savePublicBookingPreparation, type PreparationState } from "@/app/actions/preparation";

type Preparation = {
  preferred_contact_method: "whatsapp" | "phone" | "email";
  contact_detail: string;
  participant_names: string | null;
  arrival_method: string | null;
  arrival_notes: string | null;
  dietary_requirements: string | null;
  accessibility_requirements: string | null;
  cally_notes: string | null;
};

export function BookingPreparationForm({ bookingSlug, preparation }: { bookingSlug: string; preparation: Preparation | null }) {
  const [state, action, pending] = useActionState<PreparationState, FormData>(savePublicBookingPreparation, {});
  if (state.success) return <section className="success-panel" aria-live="polite"><h2>Thank you. Cally has your preparation details.</h2><p>You can return to this private link if anything changes before your retreat.</p></section>;
  return <form action={action} className="form-grid">
    <input type="hidden" name="booking_slug" value={bookingSlug} />
    <label>Preferred contact method<select name="preferred_contact_method" defaultValue={preparation?.preferred_contact_method ?? "whatsapp"}><option value="whatsapp">WhatsApp</option><option value="phone">Phone</option><option value="email">Email</option></select></label>
    <label>Contact detail<input name="contact_detail" defaultValue={preparation?.contact_detail ?? ""} maxLength={200} required /></label>
    <label className="full-span">Who will be joining you?<span className="muted">Names are enough for now.</span><textarea name="participant_names" defaultValue={preparation?.participant_names ?? ""} maxLength={1000} rows={3} /></label>
    <label>How are you planning to arrive?<input name="arrival_method" defaultValue={preparation?.arrival_method ?? ""} maxLength={100} placeholder="Driving, flying, or not sure yet" /></label>
    <label>Anything we should know about your arrival?<textarea name="arrival_notes" defaultValue={preparation?.arrival_notes ?? ""} maxLength={1000} rows={3} /></label>
    <label className="full-span">Dietary requirements<textarea name="dietary_requirements" defaultValue={preparation?.dietary_requirements ?? ""} maxLength={1000} rows={3} placeholder="Allergies, dietary preferences or anything important around food." /></label>
    <label className="full-span">Accessibility / practical requirements<textarea name="accessibility_requirements" defaultValue={preparation?.accessibility_requirements ?? ""} maxLength={1000} rows={3} placeholder="Anything that would help make your stay more comfortable or accessible." /></label>
    <label className="full-span">Anything Cally should know?<textarea name="cally_notes" defaultValue={preparation?.cally_notes ?? ""} maxLength={1000} rows={4} placeholder="Anything you'd like Cally to know before you arrive." /></label>
    {state.error && <p className="form-error full-span">{state.error}</p>}
    <div className="full-span"><button className="button" disabled={pending}>{pending ? "Saving..." : preparation ? "Update Preparation Details" : "Save Preparation Details"}</button></div>
  </form>;
}
