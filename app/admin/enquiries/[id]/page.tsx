import { notFound } from "next/navigation";
import { createQuote, updateEnquiry } from "@/app/actions/admin";
import { allowInvoicePaymentRetry, confirmVerifiedRetreatBooking, createInvoiceForQuote, rejectInvoicePayment, verifyInvoicePayment } from "@/app/actions/invoices";
import { QuoteLinkActions } from "@/components/quote-link-actions";
import { SubmitButton } from "@/components/submit-button";
import { requireAdmin } from "@/lib/auth";
import { ENQUIRY_STATUSES, formatDate, formatLabels, titleCaseStatus } from "@/lib/domain";
import { formatUsd } from "@/lib/pricing";
import { retreatDatesFromInclusiveRange } from "@/lib/retreat-dates";

export default async function EnquiryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const state = await requireAdmin();
  if (!state) return null;

  const { id } = await params;
  const [{ data: enquiry }, { data: quote }] = await Promise.all([
    state.supabase.from("retreat_enquiries").select("*").eq("id", id).maybeSingle(),
    state.supabase.from("retreat_quotes").select("*").eq("enquiry_id", id).maybeSingle(),
  ]);

  let invoice = null;
  let paymentSubmissions: Array<{ id: string; status: "submitted" | "verified" | "rejected"; submitted_at: string; reviewed_at: string | null; reviewed_by: string | null; review_note: string | null }> = [];
  let paymentHold = null;
  let booking = null;
  if (quote?.id) {
    const { data } = await state.supabase.from("retreat_invoices").select("*").eq("quote_id", quote.id).maybeSingle();
    invoice = data;
    if (invoice) {
      const [{ data: submissions }, { data: hold }] = await Promise.all([
        state.supabase.from("retreat_payment_submissions").select("*").eq("invoice_id", invoice.id).order("submitted_at", { ascending: true }),
        state.supabase.from("retreat_holds").select("status, expires_at").eq("quote_id", quote.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      paymentSubmissions = submissions ?? [];
      paymentHold = hold;
      const { data } = await state.supabase.from("retreat_bookings").select("*").eq("invoice_id", invoice.id).maybeSingle();
      booking = data;
    }
  }

  if (!enquiry) notFound();

  const stayDates = enquiry.requested_start_date ? retreatDatesFromInclusiveRange(enquiry.requested_start_date, enquiry.requested_end_date) : null;
  const isStay = enquiry.enquiry_type === "stay";

  let preview: { rate: string; total: string; guests: number; nights: number } | null = null;
  if (isStay && enquiry.retreat_product_id && enquiry.retreat_format && enquiry.guest_count && enquiry.requested_start_date) {
    const { data: rateRow } = await state.supabase
      .from("retreat_pricing")
      .select("price_usd_per_person_per_night")
      .eq("retreat_product_id", enquiry.retreat_product_id)
      .eq("retreat_format", enquiry.retreat_format)
      .maybeSingle();

    if (rateRow?.price_usd_per_person_per_night) {
      const rate = Number(rateRow.price_usd_per_person_per_night).toFixed(2);
      const guests = Number(enquiry.guest_count);
      const nights = stayDates?.nights ?? 1;
      const total = (Number(rate) * guests * nights).toFixed(2);
      preview = { rate, total, guests, nights };
    }
  }

  const publicUrl = quote?.public_slug ? `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/enquiry/quote/${quote.public_slug}` : null;
  const invoiceUrl = invoice?.public_slug ? `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/invoice/${invoice.public_slug}` : null;

  return (
    <>
      <div className="admin-title">
        <div>
          <p className="eyebrow">Enquiry detail</p>
          <h1>{enquiry.full_name}</h1>
        </div>
        <span className="status">{titleCaseStatus(enquiry.status)}</span>
      </div>

      <div className="admin-detail-grid">
        <section className="admin-panel">
          <h2>Guest</h2>
          <p><strong>Name:</strong> {enquiry.full_name}</p>
          <p><strong>Email:</strong> {enquiry.email}</p>
          <p><strong>WhatsApp / Phone:</strong> {enquiry.phone}</p>
          <p><strong>Country:</strong> {enquiry.country}</p>
          <p><strong>Referral code:</strong> {enquiry.referral_code ?? "—"}</p>
          <p><strong>Submitted:</strong> {formatDate(enquiry.created_at.slice(0, 10))}</p>
          <p><strong>Enquiry type:</strong> {enquiry.enquiry_type === "stay" ? "Stay" : "General"}</p>
          <p><strong>Status:</strong> {titleCaseStatus(enquiry.status)}</p>
          {enquiry.message && <p><strong>Message:</strong> {enquiry.message}</p>}
        </section>

        <section className="admin-panel">
          <h2>Review</h2>
          <form action={updateEnquiry}>
            <input type="hidden" name="id" value={id} />
            <label>
              Status
              <select name="status" defaultValue={enquiry.status}>
                {ENQUIRY_STATUSES.map((status) => <option key={status} value={status}>{titleCaseStatus(status)}</option>)}
              </select>
            </label>
            <label>
              Private admin notes
              <textarea name="admin_notes" defaultValue={enquiry.admin_notes ?? ""} />
            </label>
            <SubmitButton>Save review</SubmitButton>
          </form>
        </section>
      </div>

      {isStay && (
        <section className="admin-panel">
          <h2>Requested stay</h2>
          <p><strong>Experience:</strong> {enquiry.retreat_type_name ?? "—"}</p>
          <p><strong>Package:</strong> {enquiry.retreat_format ? formatLabels[enquiry.retreat_format] : "—"}</p>
          <p><strong>Guests:</strong> {enquiry.guest_count ?? "—"}</p>
          {stayDates && (
            <p>
              <strong>Arrival:</strong> {formatDate(stayDates.arrivalDate)} · <strong>Nights:</strong> {stayDates.nights} · <strong>Checkout:</strong> {formatDate(stayDates.checkoutDate)}
            </p>
          )}
        </section>
      )}

      {isStay ? (
        <section className="admin-panel">
          <h2>Price preview</h2>
          {preview ? (
            <>
              <p><strong>Rate:</strong> {formatUsd(preview.rate)} / person / night</p>
              <p><strong>Guests:</strong> {preview.guests}</p>
              <p><strong>Nights:</strong> {preview.nights}</p>
              <p><strong>USD total:</strong> {formatUsd(preview.total)} USD</p>
              {!quote && (
                <form action={createQuote}>
                  <input type="hidden" name="enquiry_id" value={enquiry.id} />
                  <SubmitButton>Generate Quote</SubmitButton>
                </form>
              )}
            </>
          ) : (
            <p>No valid pricing is configured for this stay.</p>
          )}
        </section>
      ) : (
        <section className="admin-panel">
          <h2>Quote</h2>
          <p>General enquiries do not include a stay request, so quote generation is unavailable.</p>
        </section>
      )}

      {quote && (
        <section className="admin-panel">
          <h2>Generated quote</h2>
          <p><strong>Guest:</strong> {enquiry.full_name}</p>
          <p><strong>Experience:</strong> {quote.retreat_type_name}</p>
          <p><strong>Package:</strong> {quote.retreat_format ? formatLabels[quote.retreat_format] : "—"}</p>
          <p><strong>Guests:</strong> {quote.guest_count}</p>
          <p><strong>Arrival:</strong> {formatDate(quote.start_date)}</p>
          <p><strong>Checkout:</strong> {formatDate(quote.end_date ?? quote.start_date)}</p>
          <p><strong>Rate:</strong> {formatUsd(String(quote.rate_usd_per_person_per_night ?? 0))} / person / night</p>
          <p><strong>Total:</strong> {formatUsd(String(quote.total_price))} USD</p>
          {publicUrl && <QuoteLinkActions url={publicUrl} />}

          {!invoice ? (
            <form action={createInvoiceForQuote}>
              <input type="hidden" name="quote_id" value={quote.id} />
              <SubmitButton>Generate Invoice</SubmitButton>
            </form>
          ) : (
            <>
              <p><strong>Invoice reference:</strong> {invoice.invoice_reference}</p>
              <p><strong>ETH amount:</strong> {invoice.amount_eth} ETH</p>
              <p><strong>Locked ETH price:</strong> {formatUsd(String(invoice.eth_price_usd ?? 0))} USD / ETH</p>
              <p><strong>Wallet:</strong> {invoice.wallet_address}</p>
              {invoiceUrl && <QuoteLinkActions url={invoiceUrl} label="Invoice link" openText="Open Invoice" copyText="Copy Invoice Link" />}
              {paymentSubmissions.length > 0 && (
                <div className="notice success">
                  <h3>Payment Verification</h3>
                  <p><strong>Guest:</strong> {enquiry.full_name}</p>
                  <p><strong>Invoice:</strong> {invoice.invoice_reference}</p>
                  <p><strong>USD amount:</strong> {formatUsd(String(invoice.amount_usd))} USD</p>
                  <p><strong>Locked ETH:</strong> {invoice.amount_eth} ETH</p>
                  <p><strong>Destination wallet:</strong> {invoice.wallet_address}</p>
                  <p><strong>Current hold:</strong> {paymentHold?.status ?? "—"} · expires {paymentHold?.expires_at ? new Date(paymentHold.expires_at).toLocaleString("en-ZA") : "Persistent"}</p>
                  <p><strong>Arrival:</strong> {formatDate(quote.start_date)} · <strong>Nights:</strong> {quote.duration_days ?? 1} · <strong>Checkout:</strong> {formatDate(quote.end_date ?? quote.start_date)}</p>
                  <h4>Payment attempts</h4>
                  {paymentSubmissions.map((attempt, index) => (
                    <div key={attempt.id}>
                      <p><strong>Attempt {index + 1}:</strong> {titleCaseStatus(attempt.status)} · submitted {new Date(attempt.submitted_at).toLocaleString("en-ZA")}</p>
                      {attempt.reviewed_at && <p>Reviewed {new Date(attempt.reviewed_at).toLocaleString("en-ZA")}{attempt.reviewed_by ? ` by ${attempt.reviewed_by}` : ""}</p>}
                      {attempt.review_note && <p>Note: {attempt.review_note}</p>}
                    </div>
                  ))}
                  {paymentSubmissions.at(-1)?.status === "submitted" && (
                    <>
                      <form action={verifyInvoicePayment} className="stack-form">
                        <input type="hidden" name="invoice_id" value={invoice.id} />
                        <input type="hidden" name="enquiry_id" value={enquiry.id} />
                        <label>Optional review note<textarea name="review_note" maxLength={500} /></label>
                        <SubmitButton>Verify Payment</SubmitButton>
                      </form>
                      <form action={rejectInvoicePayment} className="stack-form">
                        <input type="hidden" name="invoice_id" value={invoice.id} />
                        <input type="hidden" name="enquiry_id" value={enquiry.id} />
                        <label>Optional rejection note<textarea name="review_note" maxLength={500} /></label>
                        <SubmitButton className="button secondary">Reject Payment</SubmitButton>
                      </form>
                    </>
                  )}
                  {paymentSubmissions.at(-1)?.status === "verified" && (
                    <>
                      <strong>Payment Verified</strong>
                      <p>Invoice status: Paid</p>
                      <p>Reviewed: {paymentSubmissions.at(-1)?.reviewed_at ? new Date(paymentSubmissions.at(-1)!.reviewed_at!).toLocaleString("en-ZA") : "—"}</p>
                      <p>Dates protected pending booking.</p>
                      {!booking ? (
                        <form action={confirmVerifiedRetreatBooking} className="stack-form">
                          <input type="hidden" name="invoice_id" value={invoice.id} />
                          <input type="hidden" name="enquiry_id" value={enquiry.id} />
                          <p><strong>Booking summary:</strong> {enquiry.full_name} · {quote.retreat_type_name} · {formatLabels[quote.retreat_format]} · {quote.guest_count} guest{quote.guest_count === 1 ? "" : "s"} · {formatDate(quote.start_date)} · {quote.duration_days ?? 1} night{(quote.duration_days ?? 1) === 1 ? "" : "s"} · checkout {formatDate(quote.end_date ?? quote.start_date)} · {formatUsd(String(invoice.amount_usd))} USD · {invoice.amount_eth} ETH</p>
                          <p>This will create the confirmed booking and permanently reserve these dates.</p>
                          <SubmitButton>Confirm Booking</SubmitButton>
                        </form>
                      ) : (
                        <div className="notice success">
                          <strong>Booking Confirmed</strong>
                          <p><strong>Reference:</strong> {booking.booking_reference}</p>
                          <p><strong>Guest:</strong> {enquiry.full_name}</p>
                          <p><strong>Arrival:</strong> {formatDate(booking.start_date)} · <strong>Nights:</strong> {booking.end_date ? retreatDatesFromInclusiveRange(booking.start_date, booking.end_date).nights : 1} · <strong>Checkout:</strong> {formatDate(booking.end_date ? retreatDatesFromInclusiveRange(booking.start_date, booking.end_date).checkoutDate : booking.start_date)}</p>
                          <p><strong>Confirmed:</strong> {new Date(booking.confirmed_at).toLocaleString("en-ZA")}</p>
                        </div>
                      )}
                    </>
                  )}
                  {paymentSubmissions.at(-1)?.status === "rejected" && (
                    <>
                      <strong>Payment Rejected</strong>
                      <p>Invoice status: {invoice.status}</p>
                      <p>Reviewed: {paymentSubmissions.at(-1)?.reviewed_at ? new Date(paymentSubmissions.at(-1)!.reviewed_at!).toLocaleString("en-ZA") : "—"}</p>
                      {paymentSubmissions.at(-1)?.review_note && <p>Note: {paymentSubmissions.at(-1)!.review_note}</p>}
                      <p>The hold has been released and these dates are no longer protected.</p>
                      {!invoice.retry_allowed_at && <form action={allowInvoicePaymentRetry} className="stack-form">
                        <input type="hidden" name="invoice_id" value={invoice.id} />
                        <input type="hidden" name="enquiry_id" value={enquiry.id} />
                        <input type="hidden" name="public_slug" value={invoice.public_slug} />
                        <SubmitButton>Allow Payment Retry</SubmitButton>
                      </form>}
                    </>
                  )}
                  {invoice.retry_allowed_at && paymentSubmissions.at(-1)?.status === "rejected" && <p><strong>Payment Retry Allowed — Awaiting Guest</strong><br />Allowed: {new Date(invoice.retry_allowed_at).toLocaleString("en-ZA")}</p>}
                </div>
              )}
            </>
          )}
        </section>
      )}
    </>
  );
}
