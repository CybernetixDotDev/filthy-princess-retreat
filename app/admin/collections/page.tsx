import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { collectibleLabel } from "@/lib/inner-sanctum-collections";

export default async function AdminCollectionsPage() {
  const state = await requireAdmin();
  if (!state) return null;
  const { data, error } = await state.supabase.from("inner_sanctum_collectibles").select("*").order("sort_order").order("created_at");
  if (error) throw new Error("Collectibles could not be loaded.");
  return <><div className="admin-title"><div><p className="eyebrow">Inner Sanctum</p><h1>Collections</h1></div><Link className="button" href="/admin/collections/new">New collectible</Link></div>
    <section className="admin-panel"><div className="table-wrap"><table><thead><tr><th>Title</th><th>Slug</th><th>Status</th><th>Media</th><th>Order</th><th>Action</th></tr></thead><tbody>
      {data?.map((item) => <tr key={item.id}><td><strong>{item.title}</strong></td><td>{item.slug}</td><td><span className={`status ${item.status}`}>{collectibleLabel(item.status)}</span></td><td>{item.media_type ?? "—"}</td><td>{item.sort_order}</td><td><Link className="button secondary small" href={`/admin/collections/${item.id}`}>Edit</Link></td></tr>)}
      {!data?.length ? <tr><td colSpan={6}>No collectibles yet.</td></tr> : null}
    </tbody></table></div></section></>;
}
