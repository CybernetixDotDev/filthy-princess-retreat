import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/domain";
import { formatUsd } from "@/lib/pricing";
import { addDateOnlyDays } from "@/lib/retreat-dates";

export default async function PublicInvoicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_public_invoice_by_slug", { p_public_slug: slug });
  if (error || !data?.[0]) notFound();

  const invoice = data[0];
  const checkout = invoice.end_date ? addDateOnlyDays(invoice.end_date, 1) : invoice.start_date;

  return (
    <main className="page-shell narrow-page">
      <p className="eyebrow">Your Filthy Princess Retreat</p>
      <h1>Invoice</h1>

      <section className="admin-panel">
        <p><strong>Invoice reference:</strong> {invoice.invoice_reference}</p>
        <p><strong>Prepared for:</strong> {invoice.guest_name}</p>
        <p><strong>Experience:</strong> {invoice.retreat_type_name}</p>
        <p><strong>Package:</strong> {invoice.retreat_format}</p>
        <p><strong>Arrival:</strong> {formatDate(invoice.start_date)}</p>
        <p><strong>Checkout:</strong> {formatDate(checkout)}</p>
        <p><strong>Guests:</strong> {invoice.guest_count}</p>
        <p><strong>Invoice total:</strong> {formatUsd(String(invoice.amount_usd))} USD</p>
        <p><strong>ETH amount:</strong> {invoice.amount_eth} ETH</p>
        <p><strong>Locked ETH price:</strong> {formatUsd(String(invoice.eth_price_usd))} USD / ETH</p>
        <p><strong>Wallet:</strong> {invoice.wallet_address}</p>
        <p><strong>Status:</strong> {invoice.status}</p>
        <p><strong>Issued:</strong> {formatDate(invoice.created_at.slice(0, 10))}</p>
        {invoice.status === "awaiting_payment" && (!invoice.payment_issue || invoice.retry_allowed) && <a className="button" href={`/invoice/${slug}/pay`}>Pay Now</a>}
        {invoice.status === "awaiting_payment" && invoice.payment_issue && !invoice.retry_allowed && <div className="notice"><strong>There was an issue with this payment.</strong><p>Please contact Cally about this invoice.</p></div>}
        {invoice.status === "payment_submitted" && <a className="button secondary" href={`/invoice/${slug}/pay`}>Payment Submitted — Awaiting Verification</a>}
        {invoice.status === "paid" && <div className="notice success"><strong>Payment Received</strong><p>Your payment has been verified. Cally will complete the retreat confirmation separately.</p></div>}
      </section>
    </main>
  );
}
