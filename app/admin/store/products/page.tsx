import Link from "next/link";
import { archiveStoreProduct } from "@/app/admin/store/actions";
import { requireAdmin } from "@/lib/auth";
import { formatStoreMoney, storeLabel } from "@/lib/store";

export default async function AdminStoreProductsPage() {
  const state = await requireAdmin(); if (!state) return null;
  const { data: products, error } = await state.supabase.from("store_products").select("*").order("sort_order").order("created_at");
  if (error) throw new Error("Store products could not be loaded.");
  return <><div className="admin-title"><div><p className="eyebrow">Store</p><h1>Products</h1></div><Link className="button" href="/admin/store/products/new">New product</Link></div><section className="admin-panel"><div className="table-wrap"><table><thead><tr><th>Product</th><th>Type</th><th>Price</th><th>Status</th><th>Actions</th></tr></thead><tbody>{products?.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><br /><small>{product.slug}</small></td><td>{storeLabel(product.product_type)}</td><td>{formatStoreMoney(Number(product.price_amount), product.currency)}</td><td><span className={`status ${product.status}`}>{product.status}</span></td><td><div className="admin-row-actions"><Link className="button small" href={`/admin/store/products/${product.id}`}>Edit</Link>{product.status !== "archived" ? <form action={archiveStoreProduct}><input type="hidden" name="product_id" value={product.id} /><button className="button secondary small" type="submit">Archive</button></form> : null}</div></td></tr>)}{!products?.length ? <tr><td colSpan={5}>No Store products exist.</td></tr> : null}</tbody></table></div></section></>;
}
