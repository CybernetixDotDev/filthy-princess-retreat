import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/domain";
import { formatUsd } from "@/lib/pricing";
import { addDateOnlyDays } from "@/lib/retreat-dates";
import { QuoteInvoiceAction } from "@/components/quote-invoice-action";

export default async function PublicQuotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_public_quote_by_slug", { p_public_slug: slug });
  if (error || !data?.[0]) notFound();

  const quote = data[0];
  const checkout = quote.end_date ? addDateOnlyDays(quote.end_date, 1) : quote.start_date;

  return (
    <main className="page-shell narrow-page">
      <p className="eyebrow">Your Filthy Princess Retreat</p>
      <h1>Quote</h1>

      <section className="admin-panel">
        <p><strong>Prepared for:</strong> {quote.guest_name}</p>
        <p><strong>Experience:</strong> {quote.retreat_type_name}</p>
        <p><strong>Package:</strong> {quote.retreat_format}</p>
        <p><strong>Arrival:</strong> {formatDate(quote.start_date)}</p>
        <p><strong>Nights:</strong> {quote.nights ?? 1}</p>
        <p><strong>Checkout:</strong> {formatDate(checkout)}</p>
        <p><strong>Guests:</strong> {quote.guest_count}</p>
        <p><strong>Rate:</strong> {formatUsd(String(quote.rate_usd_per_person_per_night ?? 0))} / person / night</p>
        <p><strong>Total:</strong> {formatUsd(String(quote.total_price))} USD</p>
        <p><strong>Quote created:</strong> {formatDate(quote.created_at.slice(0, 10))}</p>
        <QuoteInvoiceAction quoteSlug={slug} hasInvoice={Boolean(quote.invoice_public_slug)} />
      </section>
    </main>
  );
}
