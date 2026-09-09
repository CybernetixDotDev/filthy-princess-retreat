import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatLabels, titleCaseStatus } from "@/lib/domain";
import { retreatDatesFromInclusiveRange } from "@/lib/retreat-dates";

export default async function AdminPage() {
  const state = await requireAdmin();
  if (!state) return null;

  const { data: enquiries } = await state.supabase.from("retreat_enquiries").select("*").order("created_at", { ascending: false });
  const { data: quotes } = await state.supabase.from("retreat_quotes").select("enquiry_id, public_slug, status");
  const quoteMap = new Map((quotes ?? []).map((quote) => [quote.enquiry_id, quote]));

  return (
    <>
      <div className="admin-title">
        <div>
          <p className="eyebrow">Admin dashboard</p>
          <h1>Enquiries</h1>
        </div>
        <span>{enquiries?.length ?? 0} total</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Guest</th>
              <th>Type</th>
              <th>Experience</th>
              <th>Package</th>
              <th>Arrival</th>
              <th>Guests</th>
              <th>Submitted</th>
              <th>Status</th>
              <th>Quote</th>
            </tr>
          </thead>
          <tbody>
            {enquiries?.map((enquiry) => {
              const quote = quoteMap.get(enquiry.id);
              const dates = enquiry.requested_start_date ? retreatDatesFromInclusiveRange(enquiry.requested_start_date, enquiry.requested_end_date) : null;
              return (
                <tr key={enquiry.id}>
                  <td><Link href={`/admin/enquiries/${enquiry.id}`}>{enquiry.full_name}</Link></td>
                  <td>{enquiry.enquiry_type === "stay" ? "Stay" : "General"}</td>
                  <td>{enquiry.retreat_type_name ?? "—"}</td>
                  <td>{enquiry.retreat_format ? formatLabels[enquiry.retreat_format] : "—"}</td>
                  <td>{dates ? formatDate(dates.arrivalDate) : "—"}</td>
                  <td>{enquiry.guest_count ?? "—"}</td>
                  <td>{new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium" }).format(new Date(enquiry.created_at))}</td>
                  <td><span className="status">{titleCaseStatus(enquiry.status)}</span></td>
                  <td>{quote ? <Link href={`/admin/enquiries/${enquiry.id}`}>{quote.public_slug ? "Generated" : (quote.status ? titleCaseStatus(quote.status) : "Generated")}</Link> : "Not generated"}</td>
                </tr>
              );
            })}
            {!enquiries?.length && <tr><td colSpan={9}>No enquiries yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
