import Link from "next/link";
import { createManualBooking } from "@/app/actions/admin";
import { RetreatDurationFields } from "@/components/retreat-duration-fields";
import { SubmitButton } from "@/components/submit-button";
import { requireAdmin } from "@/lib/auth";
import { BOOKING_STATUSES, formatDate, formatLabels, PAYMENT_STATUSES, RETREAT_FORMATS, titleCaseStatus } from "@/lib/domain";
import { retreatDatesFromInclusiveRange } from "@/lib/retreat-dates";

function todayInJohannesburg() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatUsdSafe(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export default async function BookingsPage({ searchParams }: { searchParams: Promise<{ view?: string; start_date?: string }> }) {
  const state = await requireAdmin();
  if (!state) return null;
  const query = await searchParams;
  const view = query.view === "past" || query.view === "all" ? query.view : "upcoming";
  const defaultStart = /^\d{4}-\d{2}-\d{2}$/.test(query.start_date ?? "") ? query.start_date : "";
  const today = todayInJohannesburg();
  const [{ data: bookings }, { data: products }, { data: events }] = await Promise.all([
    state.supabase.from("retreat_bookings").select("*").order("start_date", { ascending: true }),
    state.supabase.from("retreat_products").select("id,name").order("sort_order"),
    state.supabase.from("retreat_events").select("id,title,start_date,end_date").order("start_date"),
  ]);
  const visibleBookings = (bookings ?? []).filter((booking) => view === "all" || (view === "upcoming" ? booking.booking_status === "confirmed" && booking.start_date >= today : booking.booking_status !== "confirmed" || booking.start_date < today));
  const enquiryIds = visibleBookings.flatMap((booking) => booking.enquiry_id ? [booking.enquiry_id] : []);
  const invoiceIds = visibleBookings.flatMap((booking) => booking.invoice_id ? [booking.invoice_id] : []);
  const [{ data: enquiries }, { data: invoices }] = await Promise.all([
    enquiryIds.length ? state.supabase.from("retreat_enquiries").select("id,full_name").in("id", enquiryIds) : Promise.resolve({ data: [] }),
    invoiceIds.length ? state.supabase.from("retreat_invoices").select("id,invoice_reference,amount_usd,amount_eth,status").in("id", invoiceIds) : Promise.resolve({ data: [] }),
  ]);
  const enquiryMap = new Map((enquiries ?? []).map((enquiry) => [enquiry.id, enquiry]));
  const invoiceMap = new Map((invoices ?? []).map((invoice) => [invoice.id, invoice]));
  const upcoming = (bookings ?? []).filter((booking) => booking.booking_status === "confirmed" && booking.start_date >= today);
  const guestCount = upcoming.reduce((total, booking) => total + booking.guest_count, 0);

  return <>
    <div className="admin-title"><div><p className="eyebrow">Confirmed and historical</p><h1>Bookings</h1></div><span className="status">{upcoming.length} upcoming</span></div>
    <section className="admin-detail-grid">
      <div className="admin-panel"><p className="eyebrow">Upcoming bookings</p><h2>{upcoming.length}</h2><p className="muted">{guestCount} guest{guestCount === 1 ? "" : "s"} arriving</p></div>
      <div className="admin-panel"><p className="eyebrow">Next arrival</p><h2>{upcoming[0] ? formatDate(upcoming[0].start_date) : "—"}</h2><p className="muted">Johannesburg calendar date</p></div>
    </section>
    <nav className="booking-filters" aria-label="Booking views">{(["upcoming", "past", "all"] as const).map((filter) => <Link key={filter} className={`button small ${view === filter ? "" : "secondary"}`} href={`/admin/bookings?view=${filter}`}>{titleCaseStatus(filter)}</Link>)}</nav>
    <section className="admin-panel"><h2>{view === "upcoming" ? "Upcoming Confirmed Bookings" : `${titleCaseStatus(view)} Bookings`}</h2><div className="table-wrap"><table><thead><tr><th>Reference</th><th>Guest</th><th>Experience</th><th>Package</th><th>Guests</th><th>Arrival</th><th>Checkout</th><th>Payment</th><th>Open</th></tr></thead><tbody>{visibleBookings.map((booking) => { const dates = retreatDatesFromInclusiveRange(booking.start_date, booking.end_date); const enquiry = booking.enquiry_id ? enquiryMap.get(booking.enquiry_id) : null; const invoice = booking.invoice_id ? invoiceMap.get(booking.invoice_id) : null; return <tr key={booking.id}><td><strong>{booking.booking_reference ?? booking.id.slice(0, 8).toUpperCase()}</strong></td><td>{enquiry?.full_name ?? "Manual booking"}</td><td>{booking.retreat_type_name}</td><td>{formatLabels[booking.retreat_format]}</td><td>{booking.guest_count}</td><td>{formatDate(booking.start_date)}</td><td>{formatDate(dates.checkoutDate)}</td><td>{invoice?.status === "paid" && booking.payment_submission_id ? "Payment Verified" : invoice ? titleCaseStatus(invoice.status) : "Manual Booking"}{invoice && <><br /><small>{formatUsdSafe(invoice.amount_usd)} USD{invoice.amount_eth ? ` · ${invoice.amount_eth} ETH` : ""}</small></>}</td><td><Link className="button small secondary" href={`/admin/bookings/${booking.id}`}>Open Booking</Link></td></tr>; })}{!visibleBookings.length && <tr><td colSpan={9}><p className="muted">No bookings in this view.</p></td></tr>}</tbody></table></div></section>
    <section className="admin-panel"><h2>Create manual booking</h2><form action={createManualBooking} className="form-grid compact-form"><label>Retreat<select name="product_id" required>{products?.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label>Format<select name="retreat_format" required>{RETREAT_FORMATS.map((format) => <option key={format} value={format}>{formatLabels[format]}</option>)}</select></label><RetreatDurationFields arrivalDefault={defaultStart} /><label>Guests<input type="number" name="guest_count" min="1" max="50" defaultValue="1" required /></label><label>Booking status<select name="booking_status" defaultValue="confirmed">{BOOKING_STATUSES.map((status) => <option key={status} value={status}>{titleCaseStatus(status)}</option>)}</select></label><label>Payment status<select name="payment_status" defaultValue="unpaid">{PAYMENT_STATUSES.map((status) => <option key={status} value={status}>{titleCaseStatus(status)}</option>)}</select></label><label>Group event (optional)<select name="event_id"><option value="">No group event</option>{events?.map((event) => <option key={event.id} value={event.id}>{event.title} · {formatDate(event.start_date)} – {formatDate(event.end_date)}</option>)}</select></label><div className="full-span"><SubmitButton>Create manual booking</SubmitButton></div></form></section>
  </>;
}
