import Link from "next/link";
import { RetreatExplorer } from "@/components/retreat-explorer";
import { formatDate } from "@/lib/domain";
import { retreatDatesFromInclusiveRange } from "@/lib/retreat-dates";
import { createClient } from "@/lib/supabase/server";

function todayInJohannesburg() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export default async function RetreatPage() {
  const supabase = await createClient();
  const today = todayInJohannesburg();
  const [{ data: products }, { data: events }] = await Promise.all([
    supabase.from("retreat_products").select("id,name,positioning,allowed_formats").eq("is_published", true).order("sort_order"),
    supabase.rpc("list_public_retreat_events"),
  ]);

  return <section className="page-shell retreat-page">
    <div className="page-intro"><p className="eyebrow">Private retreat catalogue</p><h1>Choose your retreat</h1><p className="lead">Select an experience, format, and stay length, then choose the arrival date that suits you.</p></div>
    <RetreatExplorer products={products ?? []} initialMonth={today.slice(0, 7)} />
    <section className="quote-section">
      <div className="page-intro"><p className="eyebrow">Fixed-date experiences</p><h2>Upcoming Events</h2></div>
      <div className="card-list">{events?.map((event) => {
        const dates = retreatDatesFromInclusiveRange(event.start_date, event.end_date);
        const remaining = event.effective_places_remaining;
        return <article className="quote-card" key={event.id}><div><h3>{event.title}</h3><p>Arrival: {formatDate(dates.arrivalDate)} · {dates.nights} night{dates.nights === 1 ? "" : "s"} · Checkout: {formatDate(dates.checkoutDate)}</p>{event.description && <p>{event.description}</p>}<p>{remaining > 0 ? `${remaining} place${remaining === 1 ? "" : "s"} remaining` : "Sold Out"}</p></div>{remaining > 0 && <Link className="button small" href={`/retreat/events/${event.slug}`}>Open Event</Link>}</article>;
      })}{!events?.length && <p className="muted">No upcoming events are currently published.</p>}</div>
    </section>
  </section>;
}
