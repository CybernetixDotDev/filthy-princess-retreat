import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatLabels, titleCaseStatus } from "@/lib/domain";
import { formatUsd } from "@/lib/pricing";
import { retreatDatesFromInclusiveRange } from "@/lib/retreat-dates";
import { QuoteLinkActions } from "@/components/quote-link-actions";
import { GuestShareCard } from "@/components/guest-share-card";
import { buildBookingConfirmedMessage, siteUrl } from "@/lib/guest-communication";

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const state = await requireAdmin();
  if (!state) return null;
  const { id } = await params;
  const { data: booking } = await state.supabase.from("retreat_bookings").select("*").eq("id", id).maybeSingle();
  if (!booking) notFound();
  const [{ data: enquiry }, { data: invoice }, { data: quote }, { data: preparation }] = await Promise.all([
    booking.enquiry_id ? state.supabase.from("retreat_enquiries").select("*").eq("id", booking.enquiry_id).maybeSingle() : Promise.resolve({ data: null }),
    booking.invoice_id ? state.supabase.from("retreat_invoices").select("*").eq("id", booking.invoice_id).maybeSingle() : Promise.resolve({ data: null }),
    booking.quote_id ? state.supabase.from("retreat_quotes").select("id,reference,public_slug").eq("id", booking.quote_id).maybeSingle() : Promise.resolve({ data: null }),
    state.supabase.from("retreat_booking_preparation").select("*").eq("booking_id", booking.id).maybeSingle(),
  ]);
  const dates = retreatDatesFromInclusiveRange(booking.start_date, booking.end_date);
  const confirmationUrl = booking.public_slug ? siteUrl(`/booking/${booking.public_slug}`) : null;
  return <>
    <div className="admin-title"><div><p className="eyebrow">Booking operations</p><h1>{booking.booking_reference ?? booking.id.slice(0, 8).toUpperCase()}</h1></div><span className="status">{titleCaseStatus(booking.booking_status)}</span></div>
    <div className="admin-detail-grid">
      <section className="admin-panel"><h2>Booking</h2><p><strong>Reference:</strong> {booking.booking_reference ?? "Manual booking"}</p><p><strong>Status:</strong> {titleCaseStatus(booking.booking_status)}</p><p><strong>Confirmed:</strong> {booking.confirmed_at ? new Date(booking.confirmed_at).toLocaleString("en-ZA") : "—"}</p><p><strong>Source:</strong> {titleCaseStatus(booking.booking_source)}</p></section>
      <section className="admin-panel"><h2>Guest</h2><p><strong>Name:</strong> {enquiry?.full_name ?? "Manual booking"}</p><p><strong>Email:</strong> {enquiry?.email ?? "—"}</p><p><strong>WhatsApp / Phone:</strong> {enquiry?.phone ?? "—"}</p><p><strong>Country:</strong> {enquiry?.country ?? "—"}</p>{enquiry && <Link className="button small secondary" href={`/admin/enquiries/${enquiry.id}`}>Open Enquiry</Link>}</section>
    </div>
    <section className="admin-panel"><h2>Stay</h2><p><strong>Experience:</strong> {booking.retreat_type_name}</p><p><strong>Package:</strong> {formatLabels[booking.retreat_format]}</p><p><strong>Guests:</strong> {booking.guest_count}</p><p><strong>Arrival:</strong> {formatDate(dates.arrivalDate)}</p><p><strong>Nights:</strong> {dates.nights}</p><p><strong>Checkout:</strong> {formatDate(dates.checkoutDate)}</p></section>
    <section className="admin-panel"><h2>Payment</h2>{invoice ? <><p><strong>Invoice:</strong> {invoice.invoice_reference}</p><p><strong>Invoice status:</strong> {titleCaseStatus(invoice.status)}</p><p><strong>Payment:</strong> {booking.payment_submission_id && invoice.status === "paid" ? "Payment Verified" : titleCaseStatus(booking.payment_status)}</p><p><strong>USD amount:</strong> {formatUsd(String(invoice.amount_usd))}</p><p><strong>ETH amount:</strong> {invoice.amount_eth} ETH</p><Link className="button small secondary" href={`/invoice/${invoice.public_slug}`}>Open Invoice</Link></> : <p>Manual Booking. No linked invoice.</p>}</section>
    <section className="admin-panel"><h2>Provenance</h2><p><strong>Quote:</strong> {quote?.reference ?? "—"}</p>{quote?.public_slug && <Link className="button small secondary" href={`/enquiry/quote/${quote.public_slug}`}>Open Quote</Link>}</section>
    {confirmationUrl && <section className="admin-panel"><h2>Guest confirmation</h2><p>Share this confirmation page with the guest.</p><QuoteLinkActions url={confirmationUrl} label="Guest confirmation link" openText="Open Guest Confirmation" copyText="Copy Confirmation Link" /></section>}
    {confirmationUrl && <GuestShareCard guestName={enquiry?.full_name ?? "Guest"} message={buildBookingConfirmedMessage(enquiry?.full_name ?? "Guest", confirmationUrl)} url={confirmationUrl} preferredContactMethod={preparation?.preferred_contact_method} contactDetail={preparation?.contact_detail} />}
    <section className="admin-panel"><h2>Guest Preparation</h2>{preparation ? <><p><strong>Preferred contact:</strong> {preparation.preferred_contact_method} · {preparation.contact_detail}</p><p><strong>Who is coming:</strong> {preparation.participant_names ?? "—"}</p><p><strong>Arrival method:</strong> {preparation.arrival_method ?? "—"}</p><p><strong>Arrival notes:</strong> {preparation.arrival_notes ?? "—"}</p><p><strong>Dietary requirements:</strong> {preparation.dietary_requirements ?? "—"}</p><p><strong>Accessibility / practical requirements:</strong> {preparation.accessibility_requirements ?? "—"}</p><p><strong>Anything Cally should know:</strong> {preparation.cally_notes ?? "—"}</p><p><strong>Last updated:</strong> {new Date(preparation.updated_at).toLocaleString("en-ZA")}</p></> : <p>Preparation details not submitted yet.</p>}</section>
  </>;
}
