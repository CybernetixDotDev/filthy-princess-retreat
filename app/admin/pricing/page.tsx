import { updateEventPrice, updateStandardRate } from "@/app/actions/pricing";
import { PricingCalculator } from "@/components/pricing-calculator";
import { SubmitButton } from "@/components/submit-button";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatLabels } from "@/lib/domain";
import { formatUsd, normalizeUsd } from "@/lib/pricing";
import { isPrivateRetreatFormat } from "@/lib/retreat-availability";

export default async function PricingPage() {
  const state = await requireAdmin();
  if (!state) return null;
  const [{ data: products }, { data: pricing }, { data: events }] = await Promise.all([
    state.supabase.from("retreat_products").select("id,name,allowed_formats").order("sort_order"),
    state.supabase.from("retreat_pricing").select("id,retreat_product_id,retreat_format,price_usd_per_person_per_night"),
    state.supabase.from("retreat_events").select("id,title,start_date,end_date,status,price_usd_per_person").in("status", ["draft", "published", "full"]).order("start_date"),
  ]);
  const rates = new Map((pricing ?? []).map((rate) => [`${rate.retreat_product_id}:${rate.retreat_format}`, normalizeUsd(rate.price_usd_per_person_per_night)]));

  return <>
    <div className="admin-title"><div><p className="eyebrow">Commercial rates</p><h1>Pricing</h1></div></div>
    <section className="admin-panel">
      <div className="pricing-section-heading"><div><h2>Retreat Pricing</h2><p className="muted">Current USD price per person, per night, for each private package.</p></div></div>
      <div className="pricing-list">{products?.flatMap((product) => product.allowed_formats.filter(isPrivateRetreatFormat).map((format) => {
        const rate = rates.get(`${product.id}:${format}`);
        return <article className="pricing-row" key={`${product.id}:${format}`}><div><strong>{product.name}</strong><span>{formatLabels[format]}</span></div><div className="current-price"><small>Current USD / person / night</small><strong>{rate ? formatUsd(rate) : "Not configured"}</strong></div><form action={updateStandardRate} className="pricing-edit-form"><input type="hidden" name="product_id" value={product.id} /><input type="hidden" name="retreat_format" value={format} /><label>USD rate<input name="rate_usd" type="number" min="0" max="9999999999.99" step="0.01" defaultValue={rate ?? ""} required /></label><SubmitButton className="button small">Save</SubmitButton></form></article>;
      }))}{!products?.length && <p className="muted">No retreat products are configured.</p>}</div>
    </section>

    <section className="admin-panel">
      <div className="pricing-section-heading"><div><h2>Special Event Pricing</h2><p className="muted">Current USD price per person. Event duration does not multiply this price.</p></div></div>
      <div className="pricing-list">{events?.map((event) => {
        const rate = normalizeUsd(event.price_usd_per_person);
        return <article className="pricing-row" key={event.id}><div><strong>{event.title}</strong><span>{formatDate(event.start_date)} – {formatDate(event.end_date)} · {event.status}</span></div><div className="current-price"><small>Current USD / person</small><strong>{formatUsd(rate)}</strong></div><form action={updateEventPrice} className="pricing-edit-form"><input type="hidden" name="event_id" value={event.id} /><label>USD rate<input name="rate_usd" type="number" min="0" max="9999999999.99" step="0.01" defaultValue={rate} required /></label><SubmitButton className="button small">Save</SubmitButton></form></article>;
      })}{!events?.length && <p className="muted">No events are configured.</p>}</div>
    </section>

    <PricingCalculator products={products ?? []} events={(events ?? []).map(({ id, title }) => ({ id, title }))} />
  </>;
}
