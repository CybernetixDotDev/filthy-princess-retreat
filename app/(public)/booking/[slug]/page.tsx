import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatLabels } from "@/lib/domain";
import { addDateOnlyDays } from "@/lib/retreat-dates";

export default async function PublicBookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_booking_by_slug", { p_public_slug: slug });
  if (error || !data?.[0]) notFound();

  const booking = data[0];
  const checkout = booking.end_date ? addDateOnlyDays(booking.end_date, 1) : booking.start_date;

  return (
    <main className="page-shell narrow-page">
      <p className="eyebrow">Filthy Princess Retreat</p>
      <h1>Your retreat is confirmed.</h1>
      <section className="admin-panel">
        <p><strong>Booking reference:</strong> {booking.booking_reference}</p>
        <p><strong>Guest:</strong> {booking.guest_name ?? "Guest"}</p>
        <p><strong>Experience:</strong> {booking.retreat_type_name}</p>
        <p><strong>Package:</strong> {formatLabels[booking.retreat_format]}</p>
        <p><strong>Guests:</strong> {booking.guest_count}</p>
        <p><strong>Arrival:</strong> {formatDate(booking.start_date)}</p>
        <p><strong>Nights:</strong> {booking.nights}</p>
        <p><strong>Checkout:</strong> {formatDate(checkout)}</p>
        <p><strong>Payment:</strong> Payment confirmed</p>
        <a className="button" href={`/booking/${slug}/prepare`}>Tell Cally a little more</a>
      </section>
      <section className="success-panel">
        <h2>What happens next</h2>
        <p>Cally will be in touch before your retreat with everything you need to know. For now, your dates are confirmed and your place is reserved.</p>
      </section>
    </main>
  );
}
