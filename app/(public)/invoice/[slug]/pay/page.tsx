import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/domain";
import { formatUsd } from "@/lib/pricing";
import { addDateOnlyDays } from "@/lib/retreat-dates";
import { PaymentCopyControls } from "@/components/payment-copy-controls";
import { InvoicePaymentSubmitForm } from "@/components/invoice-payment-submit-form";

export default async function InvoicePaymentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_invoice_by_slug", { p_public_slug: slug });
  if (error || !data?.[0]) notFound();

  const invoice = data[0];
  const checkout = invoice.end_date ? addDateOnlyDays(invoice.end_date, 1) : invoice.start_date;
  const canSubmit = invoice.status === "awaiting_payment" && (invoice.retry_allowed || !invoice.payment_issue);

  return (
    <main className="page-shell narrow-page payment-page">
      <p className="eyebrow">Filthy Princess Retreat</p>
      <h1>Pay your Filthy Princess invoice</h1>
      <section className="admin-panel">
        <p><strong>Invoice reference:</strong> {invoice.invoice_reference}</p>
        <p><strong>Stay:</strong> {formatDate(invoice.start_date)} to {formatDate(checkout)} · {invoice.guest_count} guest{invoice.guest_count === 1 ? "" : "s"}</p>
        <p><strong>Invoice total:</strong> {formatUsd(String(invoice.amount_usd))} USD</p>

        {invoice.status === "cancelled" ? (
          <div className="notice"><strong>This invoice is cancelled.</strong><p>Payment cannot be submitted for this invoice.</p></div>
        ) : invoice.status === "awaiting_payment" && invoice.payment_issue && !invoice.retry_allowed ? (
          <div className="notice"><strong>There was an issue with this payment.</strong><p>Please contact Cally about this invoice before trying again.</p></div>
        ) : invoice.status === "payment_submitted" ? (
          <div className="notice success"><strong>Payment submitted</strong><p>Your payment claim is pending verification. Your requested dates are being held while payment is reviewed.</p></div>
        ) : invoice.status === "paid" ? (
          <div className="notice success"><strong>This invoice is already paid.</strong><p>No further payment submission is needed.</p></div>
        ) : null}

        <div className="instruction-box">
          <h2>Payment instructions</h2>
          <p>Send the exact ETH amount shown below to the displayed wallet address using your own wallet. Complete the transfer externally, then return here and click &quot;I&apos;ve Made Payment&quot;.</p>
          <p>This website does not connect to your wallet or send ETH. Payment will be verified separately before your retreat is confirmed.</p>
        </div>

        <p><strong>Wallet Address</strong></p>
        <p className="copy-field">{invoice.wallet_address}</p>
        <p><strong>Exact ETH Amount</strong></p>
        <p className="copy-field">{invoice.amount_eth} ETH</p>
        <PaymentCopyControls amount={String(invoice.amount_eth)} wallet={invoice.wallet_address} />

        {canSubmit && <InvoicePaymentSubmitForm publicSlug={slug} />}
      </section>
    </main>
  );
}