import Link from "next/link";
import { notFound } from "next/navigation";
import { updateEvent } from "@/app/actions/admin";
import { confirmAcceptedEventBooking, createEventInvitation, setEventInterestStatus } from "@/app/actions/event-interests";
import { SubmitButton } from "@/components/submit-button";
import { requireAdmin } from "@/lib/auth";
import { formatDate, titleCaseStatus } from "@/lib/domain";
import { retreatDatesFromInclusiveRange } from "@/lib/retreat-dates";

export default async function EventInterestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await requireAdmin();
  if (!state) return null;
  const [{ data: event }, { data: interests, error }] = await Promise.all([
    state.supabase.from("retreat_events").select("*").eq("id", id).maybeSingle(),
    state.supabase.rpc("admin_list_retreat_event_interests", { p_event_id: id }),
  ]);
  if (!event) notFound();
  if (error) throw new Error("Event interests could not be loaded.");
  const dates = retreatDatesFromInclusiveRange(event.start_date, event.end_date);
  const rows = interests ?? [];
  const counts = rows.reduce<Record<string, number>>((result, interest) => { result[interest.status] = (result[interest.status] ?? 0) + 1; return result; }, {});

  return <>
    <div className="admin-title"><div><p className="eyebrow">Event interest review</p><h1>{event.title}</h1></div><Link className="text-link" href="/admin/events">Back to events</Link></div>
    <section className="admin-panel"><p>{formatDate(dates.arrivalDate)} · {dates.nights} nights · {event.capacity} places · {event.available_places} remaining</p><p>Status: {titleCaseStatus(event.status)} · {event.invitation_only ? "Invitation only" : "Public event"} · {event.interest_enabled ? "Interest open" : "Interest closed"}</p><form action={updateEvent} className="form-grid"><input type="hidden" name="id" value={event.id} /><input type="hidden" name="capacity" value={event.capacity} /><input type="hidden" name="available_places" value={event.available_places} /><label>Status<select name="status" defaultValue={event.status}><option value="draft">Draft</option><option value="published">Published</option><option value="full">Full</option><option value="cancelled">Cancelled</option><option value="completed">Completed</option></select></label><label><input type="checkbox" name="invitation_only" defaultChecked={event.invitation_only} /> Invitation only</label><label><input type="checkbox" name="interest_enabled" defaultChecked={event.interest_enabled} /> Accepting member interest</label><SubmitButton>Save event settings</SubmitButton></form><div className="definition-list"><div><dt>Interested</dt><dd>{counts.interested ?? 0}</dd></div><div><dt>Selected</dt><dd>{counts.selected ?? 0}</dd></div><div><dt>Invited</dt><dd>{rows.filter((interest) => interest.invitation_id).length}</dd></div><div><dt>Accepted</dt><dd>{rows.filter((interest) => interest.invitation_response === "accepted").length}</dd></div><div><dt>Confirmed</dt><dd>{rows.filter((interest) => interest.confirmed_booking_id).length}</dd></div><div><dt>Not selected</dt><dd>{counts.not_selected ?? 0}</dd></div></div></section>
    <section className="admin-panel"><h2>Interested members</h2>{rows.length ? <div className="card-list">{rows.map((interest) => <article className="admin-card" key={interest.id}>
      <p><strong>{interest.member_email ?? interest.user_id}</strong> · {interest.confirmed_booking_id ? "Confirmed" : interest.invitation_response === "accepted" ? "Accepted" : interest.invitation_id ? "Invited" : titleCaseStatus(interest.status)}{interest.invitation_response === "declined" ? " · Declined" : ""}</p>
      <p>{interest.message || "No message supplied."}</p>
      <form action={setEventInterestStatus} className="inline-form"><input type="hidden" name="interest_id" value={interest.id} /><input type="text" name="admin_notes" defaultValue={interest.admin_notes ?? ""} placeholder="Admin note" /><select name="status" defaultValue={interest.status}><option value="interested">Restore to interested</option><option value="selected">Mark selected</option><option value="not_selected">Mark not selected</option><option value="withdrawn">Withdraw</option></select><SubmitButton className="button small secondary">Save review</SubmitButton></form>
      {interest.status === "selected" && !interest.invitation_id ? <form action={createEventInvitation} className="stack-form"><input type="hidden" name="interest_id" value={interest.id} /><label>Personal note from Cally <span className="muted">(optional)</span><textarea name="personal_note" rows={3} maxLength={2000} placeholder="A short personal note to include with the invitation" /></label><SubmitButton className="button small">Send invitation</SubmitButton></form> : null}
      {interest.invitation_response === "accepted" && !interest.confirmed_booking_id ? <form action={confirmAcceptedEventBooking}><input type="hidden" name="interest_id" value={interest.id} /><SubmitButton className="button small">Confirm booking</SubmitButton></form> : null}
    </article>)}</div> : <p>No member interests yet.</p>}</section>
  </>;
}
