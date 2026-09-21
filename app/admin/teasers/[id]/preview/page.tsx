import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { teaserMediaPublicUrl } from "@/lib/teaser-media";
export default async function TeaserPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const state = await requireAdmin(); if (!state) return null;
  const { id } = await params; if (!z.uuid().safeParse(id).success) notFound();
  const { data: teaser, error } = await state.supabase.from("teasers").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("Teaser could not be loaded."); if (!teaser) notFound();
  const productResult = teaser.store_product_id ? await state.supabase.from("store_products").select("id,name,status,price_amount,currency").eq("id", teaser.store_product_id).maybeSingle() : { data: null, error: null };
  if (productResult.error) throw new Error("Store product could not be loaded.");
  const product = productResult.data;
  return <><div className="admin-title"><div><p className="eyebrow">Saved content preview</p><h1>Teaser preview</h1></div><Link href={`/admin/teasers/${id}`}>Back to editor</Link></div>
    <section className="admin-panel"><p>Status: {teaser.status}</p><p>{teaser.visibility === "private" ? "Private / Unlisted" : "Public / Discoverable"}</p><p>This Admin preview does not publish the teaser.</p></section>
    <article className="admin-panel">{teaser.eyebrow && <p className="eyebrow">{teaser.eyebrow}</p>}<h2>{teaser.title}</h2><p style={{ whiteSpace: "pre-wrap" }}>{teaser.body}</p>
      {teaser.graffiti_lines.length > 0 && <section><h3>Graffiti</h3><ul>{teaser.graffiti_lines.map((line, index) => <li key={index}>{line}</li>)}</ul></section>}
      <div className="admin-detail-grid">{([1, 2, 3] as const).map(slot => {
        const url = teaserMediaPublicUrl(teaser[`image_${slot}_path`]);
        // eslint-disable-next-line @next/next/no-img-element
        return url ? <figure key={slot}><img src={url} alt={`Teaser image ${slot}`} style={{ width: "100%", maxHeight: 420, objectFit: "contain" }} /><figcaption>Image {slot}</figcaption></figure> : null;
      })}</div>
      <h3>Destination</h3>{teaser.destination_type === "promo" ? <p>Promo / Contribute - Contribution and Affiliate experience</p> : product ? <><p>{product.name} - {product.currency} {product.price_amount}</p>{product.status !== "active" && <p role="alert">Linked product is no longer active. Select another product before publishing.</p>}</> : <p>No Store product selected.</p>}
    </article>
  </>;
}
