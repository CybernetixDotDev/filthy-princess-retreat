"use client";

import { useActionState } from "react";
import { submitEventInterest, type EventInterestState } from "@/app/actions/event-interests";
import { SubmitButton } from "@/components/submit-button";

export function BookingsEventInterestForm({ eventId }: { eventId: string }) {
  const [state, action] = useActionState<EventInterestState, FormData>(submitEventInterest, {});
  if (state.success) return <div className="bookings-interest-success" aria-live="polite"><p className="bookings-eyebrow">Cally has your note</p><h3>You&apos;re on Cally&apos;s list.</h3><p>This isn&apos;t a reservation or an invitation. It simply means Cally knows you&apos;d like to come.</p><p>If she chooses you, your invitation will appear inside the Inner Sanctum.</p></div>;
  return <form className="bookings-interest-form" action={action}>
    <input type="hidden" name="event_id" value={eventId} />
    <label>Anything you&apos;d like Cally to know? <span>(optional)</span><textarea name="message" rows={4} maxLength={2000} /></label>
    {state.error && <p className="bookings-form-error" role="alert">{state.error}</p>}
    <SubmitButton>I&apos;m interested →</SubmitButton>
  </form>;
}