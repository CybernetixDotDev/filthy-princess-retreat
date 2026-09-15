import Link from "next/link";
import { createEvent, updateEvent } from "@/app/actions/admin";
import { RetreatDurationFields } from "@/components/retreat-duration-fields";
import { SubmitButton } from "@/components/submit-button";
import { requireAdmin } from "@/lib/auth";
import { formatDate, titleCaseStatus } from "@/lib/domain";
import { retreatDatesFromInclusiveRange } from "@/lib/retreat-dates";

export default async function EventsPage() {
  const state = await requireAdmin();
  if (!state) return null;
  const [{ data: products }, { data: events }] = await Promise.all([
    state.supabase.from("retreat_products").select("id,name").order("sort_order"),
    state.supabase.from("retreat_events").select("*").order("start_date"),
  ]);
  const names = new Map(products?.map((product) => [product.id, product.name]));
  return <>
    <div className="admin-title"><div><p className="eyebrow">Fixed-date group retreats</p><h1>Events</h1></div></div>
    <section className="admin-panel"><h2>Create event</h2><form action={createEvent} className="form-grid compact-form">
      <label>Event title<input name="title" required /></label>
      <label>Retreat / Experience<select name="product_id">{products?.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
      <RetreatDurationFields /><label>Capacity<input type="number" name="capacity" min="1" required /></label>
      <input type="hidden" name="available_places" value="0" /><label>Status<select name="status"><option value="draft">Draft</option><option value="published">Published</option></select></label>
      <label className="full-span">Description<textarea name="description" rows={3} /></label>
      <label><input type="checkbox" name="invitation_only" /> Invitation only <small>Visible later, but not directly bookable.</small></label>
      <label><input type="checkbox" name="interest_enabled" /> Accepting member interest <small>Active Inner Sanctum members may express interest.</small></label>
      <SubmitButton>Create event</SubmitButton>
    </form></section>
    <div className="card-list">{events?.map((event) => { const dates = retreatDatesFromInclusiveRange(event.start_date, event.end_date); return <article className="admin-card event-admin-card" key={event.id}>
      <div><strong>{event.title}</strong><p>{names.get(event.retreat_product_id)} · Arrival {formatDate(dates.arrivalDate)} · {dates.nights} night{dates.nights === 1 ? "" : "s"} · Checkout {formatDate(dates.checkoutDate)}</p><p>Capacity {event.capacity} · {event.available_places} places remaining · {titleCaseStatus(event.status)}{event.invitation_only ? " · Invitation only" : ""}{event.interest_enabled ? " · Interest open" : ""}</p><Link className="text-link" href={`/admin/events/${event.id}`}>Review event interests</Link></div>
      <form action={updateEvent} className="inline-form"><input type="hidden" name="id" value={event.id} /><input type="hidden" name="capacity" value={event.capacity} /><input type="hidden" name="available_places" value={event.available_places} /><input type="hidden" name="invitation_only" value={event.invitation_only ? "on" : "off"} /><input type="hidden" name="interest_enabled" value={event.interest_enabled ? "on" : "off"} /><select name="status" defaultValue={event.status}><option value="draft">Draft</option><option value="published">Published</option><option value="full">Full</option><option value="cancelled">Cancelled</option><option value="completed">Completed</option></select><SubmitButton className="button small secondary">Update</SubmitButton></form>
    </article>; })}</div>
  </>;
}
