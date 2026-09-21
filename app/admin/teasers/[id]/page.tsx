import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { TeaserForm } from "@/components/teaser-form";
import { TeaserImageControls } from "@/components/teaser-image-controls";
import { teaserReadiness } from "@/lib/teaser-publication";
import { teaserPromoUrl } from "@/lib/teaser-promo-url";
import { TeaserPublicationControls } from "@/components/teaser-publication-controls";
export default async function EditTeaserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ visibilityPending?: string }> }) {
  const state = await requireAdmin(); if (!state) return null;
  const { id } = await params; if (!z.uuid().safeParse(id).success) notFound();
  const { data: teaser, error } = await state.supabase.from("teasers").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("Teaser could not be loaded."); if (!teaser) notFound();
  let query = state.supabase.from("store_products").select("id,name,status,price_amount,currency").order("name");
  query = teaser.store_product_id ? query.or(`status.eq.active,id.eq.${teaser.store_product_id}`) : query.eq("status", "active");
  const { data: products, error: productError } = await query;
  if (productError) throw new Error("Store products could not be loaded.");
  const linkedProduct = products?.find(product => product.id === teaser.store_product_id) ?? null;
  const readiness = teaserReadiness(teaser, linkedProduct);
  let promoUrl: string | null = null;
  let promoError: string | null = null;
  if (teaser.status === "published") {
    try { promoUrl = teaserPromoUrl(teaser.slug); } catch (error) { promoError = error instanceof Error ? error.message : "Public-site origin is not configured."; }
  }
  const { visibilityPending } = await searchParams;
  return <><div className="admin-title"><h1>Edit Teaser</h1><Link href="/admin/teasers">Back to Teasers</Link></div>
    {visibilityPending && <p role="alert">Your draft was created, but Public visibility could not be saved. Select Public and save again.</p>}
    <section className="admin-panel"><h2>Publication</h2><p>Current status: {teaser.status}</p>
      <Link href={`/admin/teasers/${id}/preview`}>Preview saved content</Link>
      <p>Save your edits before previewing or publishing. Readiness reflects the saved record.</p>
      <h3>{readiness.ready ? "Ready to publish" : "Not ready to publish"}</h3>
      <ul>{readiness.checks.map(check => <li key={check.label}>{check.ok ? "Ready" : "Required"}: {check.label}</li>)}</ul>
      <p>{[teaser.image_1_path, teaser.image_2_path, teaser.image_3_path].filter(Boolean).length} images / {teaser.graffiti_lines.length} graffiti phrases</p>
      <h3>{teaser.visibility === "private" ? "Private / Unlisted" : "Public / Discoverable"}</h3>
      <p>{teaser.visibility === "private" ? "Anyone with the promotional link can view it once the public renderer exists. It will not be eligible for normal public discovery." : "Once the public renderer exists, the promotional link will work and this teaser may later be surfaced by public Filthy Princess discovery features."}</p>
      {teaser.status === "draft" && <p>This draft is not publicly available.</p>}
      {teaser.destination_type === "store" && teaser.status === "published" && linkedProduct?.status !== "active" && <p role="alert">The Store destination is missing or inactive. This teaser remains published; the future public renderer will disable ENTER until an active destination is available.</p>}
      {promoError && <p role="alert">Promo URL unavailable: {promoError}</p>}
      <TeaserPublicationControls id={id} status={teaser.status} ready={readiness.ready} promoUrl={promoUrl} />
    </section>
    <TeaserForm teaser={teaser} products={products ?? []} />
    <h2>Polaroid moments</h2><div className="admin-detail-grid">{([1, 2, 3] as const).map(slot => <TeaserImageControls key={slot} id={id} slot={slot} path={teaser[`image_${slot}_path`]} />)}</div>
  </>;
}
