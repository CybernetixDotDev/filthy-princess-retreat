import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatStoreMoney, storeLabel } from "@/lib/store";
export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function StoreOrderPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_store_order", { p_order_reference: reference });
  const order = data?.[0];
  if (error || !order) notFound();

  return <div className="store-order-page"><section className="store-order-summary">
    <p className="eyebrow">Your order is ready</p>
    <h1>Payment comes next.</h1>
    <dl>
      <div><dt>Order</dt><dd>{order.order_reference}</dd></div>
      <div><dt>Product</dt><dd>{order.product_name}</dd></div>
      <div><dt>Total</dt><dd>{formatStoreMoney(Number(order.total_amount), order.currency)}</dd></div>
      <div><dt>Status</dt><dd>{storeLabel(order.order_status)}</dd></div>
    </dl>
    <Link className="primary-link" href={`/checkout/${encodeURIComponent(order.order_reference)}`}>Continue to secure checkout</Link>
  </section></div>;
}
