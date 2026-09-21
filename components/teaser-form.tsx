"use client";
import { useActionState, useState } from "react";
import { saveTeaser } from "@/app/admin/teasers/actions";
import { SubmitButton } from "@/components/submit-button";
import type { TeaserRow } from "@/lib/database.types";
import type { TeaserProductOption } from "@/lib/teasers";

export function TeaserForm({ teaser, products }: { teaser?: TeaserRow; products: TeaserProductOption[] }) {
  const [state, action] = useActionState(saveTeaser.bind(null, teaser?.id ?? null), {});
  const [destinationType, setDestinationType] = useState(teaser?.destination_type ?? "store");
  const linked = products.find(p => p.id === teaser?.store_product_id);
  return <form action={action} className="stack-form">
    <section className="admin-panel"><h2>Campaign</h2>
      <p>Status: {teaser?.status ?? "draft"}</p>
      <label>Internal campaign name<input name="internal_name" required maxLength={200} defaultValue={teaser?.internal_name} /></label>
      <label>Visibility<select name="visibility" defaultValue={teaser?.visibility ?? "private"}><option value="private">Private</option><option value="public">Public</option></select></label>
      <p><strong>Private:</strong> Unlisted promotional link. Anyone with the published link can view it.</p>
      <p><strong>Public:</strong> May also be surfaced through future public Filthy Princess promotions.</p>
    </section>
    <section className="admin-panel"><h2>Hero</h2>
      <label>Eyebrow<input name="eyebrow" maxLength={100} defaultValue={teaser?.eyebrow ?? ""} /></label>
      <label>Title<input name="title" required maxLength={200} defaultValue={teaser?.title} /></label>
      <label>Body<textarea name="body" required maxLength={12000} rows={8} defaultValue={teaser?.body} /></label>
    </section>
    {teaser && <section className="admin-panel"><h2>Graffiti</h2><p>Up to 15 phrases, in display order. Leave unused entries blank.</p>
      {Array.from({ length: 15 }, (_, i) => <label key={i}>Phrase {i + 1}<input name="graffiti_lines" maxLength={200} defaultValue={teaser.graffiti_lines[i] ?? ""} /></label>)}
    </section>}
    <section className="admin-panel"><h2>Destination</h2>
      <label>Destination type<select name="destination_type" value={destinationType} onChange={event => setDestinationType(event.target.value as "store" | "promo")}><option value="store">Store</option><option value="promo">Promo</option></select></label>
      {destinationType === "promo" ? <><label>Promo destination<select name="promo_destination" defaultValue="contribute"><option value="contribute">Contribute</option></select></label><p>Contribute leads visitors into the Contribution/Affiliate experience. They can sign in or create an account if needed.</p></> : <>
      {linked && linked.status !== "active" && <p role="alert">Linked product is no longer active. Select another product before publishing.</p>}
      <label>Store product<select name="store_product_id" defaultValue={teaser?.store_product_id ?? ""}>
        <option value="">No product selected</option>
        {products.map(p => <option key={p.id} value={p.id}>{p.name} - {p.currency} {p.price_amount}{p.status !== "active" ? " (inactive, currently linked)" : ""}</option>)}
      </select></label><p>A draft can have no destination. A Store product will be required before publishing.</p></>}
    </section>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
    <SubmitButton>{teaser ? "Save teaser" : "Create draft teaser"}</SubmitButton>
  </form>;
}
