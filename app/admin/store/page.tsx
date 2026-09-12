import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

export default async function AdminStorePage() {
  const state = await requireAdmin(); if (!state) return null;
  const [{ count: productCount }, { count: orderCount }] = await Promise.all([
    state.supabase.from("store_products").select("id", { count: "exact", head: true }),
    state.supabase.from("store_orders").select("id", { count: "exact", head: true }),
  ]);
  return <><div className="admin-title"><div><p className="eyebrow">Commerce</p><h1>Store</h1></div></div><div className="admin-detail-grid">
    <Link className="admin-panel admin-store-link" href="/admin/store/products"><p className="eyebrow">Products</p><h2>{productCount ?? 0}</h2><p>Manage the Store catalogue.</p></Link>
    <Link className="admin-panel admin-store-link" href="/admin/store/orders"><p className="eyebrow">Orders</p><h2>{orderCount ?? 0}</h2><p>Inspect immutable order snapshots.</p></Link>
  </div></>;
}
