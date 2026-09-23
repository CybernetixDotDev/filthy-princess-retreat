import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { commercialStoreOrderLabel } from "@/lib/store-order-lifecycle";

export default async function AdminStoreOrdersPage() {
  const state = await requireAdmin(); if (!state) return null;
  const { data: orders, error } = await state.supabase.from("store_orders").select("*").order("created_at", { ascending: false });
  if (error) throw new Error("Store orders could not be loaded.");
  const ids = orders?.map((order) => order.id) ?? [];
  const { data: items } = ids.length ? await state.supabase.from("store_order_items").select("order_id,product_name").in("order_id", ids) : { data: [] };
  const productNames = new Map(items?.map((item) => [item.order_id, item.product_name]));
  return <><div className="admin-title"><div><p className="eyebrow">Store</p><h1>Orders</h1></div></div><section className="admin-panel"><div className="table-wrap"><table><thead><tr><th>Order</th><th>Created</th><th>Buyer</th><th>Product</th><th>Payment</th><th>Fulfilment</th></tr></thead><tbody>{orders?.map((order) => <tr key={order.id}><td><Link className="text-link" href={`/admin/store/orders/${order.id}`}>{order.order_reference}</Link></td><td>{new Date(order.created_at).toLocaleString("en-ZA")}</td><td>{order.buyer_email}</td><td>{productNames.get(order.id) ?? "—"}</td><td>{order.acquisition_method === "filth" ? "Paid with Filth" : commercialStoreOrderLabel(order.status)}</td><td>{order.fulfilled_at || order.fulfillment_completed_at ? "Fulfilled" : order.status === "paid" ? "Awaiting fulfilment" : "—"}</td></tr>)}{!orders?.length ? <tr><td colSpan={6}>No Store orders yet.</td></tr> : null}</tbody></table></div></section></>;
}
