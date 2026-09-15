"use client";

import { useEffect, useState } from "react";
import { useActionState } from "react";
import { submitEventInterest, type EventInterestState } from "@/app/actions/event-interests";

export type InnerSanctumEvent = {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  description: string | null;
};

export type InnerSanctumEventState = "interest" | "interested" | "selected" | "invited" | "accepted" | "confirmed";

type EventWithState = InnerSanctumEvent & { state: InnerSanctumEventState };

export function InnerSanctumEventDiscovery({ events }: { events: EventWithState[] }) {
  const [selectedEvent, setSelectedEvent] = useState<EventWithState | null>(null);

  useEffect(() => {
    if (!selectedEvent) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSelectedEvent(null); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", close); };
  }, [selectedEvent]);

  if (!events.length) return null;
  return <section className="sanctum-event-discovery" aria-labelledby="sanctum-event-discovery-title">
    <p className="sanctum-eyebrow">From Cally&apos;s diary</p>
    <h2 id="sanctum-event-discovery-title">What&apos;s happening.</h2>
    <p className="sanctum-event-intro">A few things are kept closer than the public world. You can look, but some doors still open only when Cally decides they should.</p>
    <div className="sanctum-event-grid">{events.map((event) => <button className="sanctum-event-card" key={event.id} type="button" onClick={() => setSelectedEvent(event)}><span className="sanctum-event-card-eyebrow">By invitation only</span><strong>{event.title}</strong><span>{event.start_date} — {event.end_date}</span></button>)}</div>
    {selectedEvent ? <EventModal event={selectedEvent} onClose={() => setSelectedEvent(null)} /> : null}
  </section>;
}

function EventModal({ event, onClose }: { event: EventWithState; onClose: () => void }) {
  const [state, action] = useActionState<EventInterestState, FormData>(submitEventInterest, {});
  const currentState = state.success ? "interested" : event.state;
  return <div className="sanctum-event-modal-layer" role="presentation" onMouseDown={(eventTarget) => { if (eventTarget.target === eventTarget.currentTarget) onClose(); }}><section className="sanctum-event-modal" role="dialog" aria-modal="true" aria-labelledby="sanctum-event-modal-title">
    <button className="sanctum-event-modal-close" type="button" aria-label="Close event details" onClick={onClose}>×</button>
    <p className="sanctum-eyebrow">By invitation only</p>
    <h3 id="sanctum-event-modal-title">{event.title}</h3>
    <p className="sanctum-event-modal-dates">{event.start_date} — {event.end_date}</p>
    {event.description ? <p>{event.description}</p> : null}
    <p>You can&apos;t book this one directly.</p>
    <p>Tell Cally if you&apos;d like to be considered.</p>
    {currentState === "confirmed" ? <EventState title="You&apos;re coming. ♥" copy="Your place has been confirmed." /> : currentState === "accepted" ? <EventState title="Cally has your yes." copy="Your invitation has been accepted and is awaiting confirmation. This is not a booking yet." /> : currentState === "invited" ? <><EventState title="Your invitation is inside." copy="Open it in Benefits to respond. The invitation remains the authority for accepting or declining." /><a className="sanctum-link" href="/inner-sanctum/benefits">Open the invitation →</a></> : currentState === "selected" ? <EventState title="Cally is considering this one." copy="If she chooses to invite you, the invitation will appear in your Benefits." /> : currentState === "interested" ? <EventState title="Cally knows you&apos;re interested." copy="This is not yet a booking or an invitation." /> : <form className="sanctum-event-interest-form" action={action}><input type="hidden" name="event_id" value={event.id} /><label>Anything you&apos;d like Cally to know? <span>(optional)</span><textarea name="message" rows={4} maxLength={2000} /></label>{state.error ? <p className="sanctum-event-error" role="alert">{state.error}</p> : null}<button type="submit">I&apos;d like to be considered ♥</button></form>}
  </section></div>;
}

function EventState({ title, copy }: { title: string; copy: string }) {
  return <div className="sanctum-event-state"><h4>{title}</h4><p>{copy}</p></div>;
}
