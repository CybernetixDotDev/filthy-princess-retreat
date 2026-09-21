import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
export default async function TeasersPage() {
  const state = await requireAdmin(); if (!state) return null;
  const { data: teasers, error } = await state.supabase.from("teasers").select("*").order("updated_at", { ascending: false });
  if (error) throw new Error("Teasers could not be loaded.");
  const ids = [...new Set((teasers ?? []).flatMap(t => t.store_product_id ? [t.store_product_id] : []))];
  const products = ids.length ? await state.supabase.from("store_products").select("id,name").in("id", ids) : { data: [], error: null };
  if (products.error) throw new Error("Store products could not be loaded.");
  const names = new Map(products.data?.map(p => [p.id, p.name]));
  return <><div className="admin-title"><div><p className="eyebrow">Commerce</p><h1>Teasers</h1></div><Link className="button" href="/admin/teasers/new">New Teaser</Link></div>
    {teasers?.length ? <div className="admin-detail-grid">{teasers.map(t => <article className="admin-panel" key={t.id}>
      <h2>{t.internal_name}</h2><p>{t.status} / {t.visibility}</p><h3>{t.title}</h3>
      <p>Destination: {t.destination_type === "promo" ? "Promo / Contribute" : t.store_product_id ? names.get(t.store_product_id) ?? "Unavailable" : "None"}</p>
      <p>{t.graffiti_lines.length} graffiti phrases / {[t.image_1_path, t.image_2_path, t.image_3_path].filter(Boolean).length} images</p>
      <p>Updated {new Date(t.updated_at).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })}</p>
      <Link href={`/admin/teasers/${t.id}`}>Edit</Link>
    </article>)}</div> : <section className="admin-panel"><p>No teasers yet. Create a draft to begin.</p></section>}
  </>;
}
