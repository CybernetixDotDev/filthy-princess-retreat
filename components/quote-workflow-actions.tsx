import { confirmBooking, markPaymentReceived } from "@/app/actions/admin";
import { SubmitButton } from "./submit-button";
export function QuoteWorkflowActions({ quoteId, enquiryId, paymentStatus, bookingId }: { quoteId: string; enquiryId: string; paymentStatus: string; bookingId?: string | null }) {
  if (bookingId) return <span className="status confirmed">Booking confirmed</span>;
  if (paymentStatus === "unpaid") return <form action={markPaymentReceived}><input type="hidden" name="quote_id" value={quoteId} /><input type="hidden" name="enquiry_id" value={enquiryId} /><select name="payment_status"><option value="deposit_received">Deposit received</option><option value="paid">Paid in full</option></select><SubmitButton className="button small">Mark payment received</SubmitButton></form>;
  return <form action={confirmBooking}><input type="hidden" name="quote_id" value={quoteId} /><input type="hidden" name="enquiry_id" value={enquiryId} /><SubmitButton className="button small">Confirm booking</SubmitButton></form>;
}
