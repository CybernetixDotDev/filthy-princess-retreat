import { notFound } from "next/navigation";
import { BookingPreparationForm } from "@/components/booking-preparation-form";
import { createClient } from "@/lib/supabase/server";

export default async function BookingPreparationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const [{ data: booking }, { data: preparation }] = await Promise.all([
    supabase.rpc("get_public_booking_by_slug", { p_public_slug: slug }),
    supabase.rpc("get_public_booking_preparation", { p_booking_slug: slug }),
  ]);
  if (!booking?.[0]) notFound();

  return <main className="page-shell narrow-page"><p className="eyebrow">Before you arrive</p><h1>Tell Cally a little more</h1><p className="lead">A few practical details will help Cally prepare for your stay. You can return to this private link and update them later.</p><section className="panel"><BookingPreparationForm bookingSlug={slug} preparation={preparation?.[0] ?? null} /></section></main>;
}
