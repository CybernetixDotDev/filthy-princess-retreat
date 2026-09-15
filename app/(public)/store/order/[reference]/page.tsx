import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatStoreMoney, storeLabel } from "@/lib/store";

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
    <div className="store-order-note"><p>I&apos;m just making sure the door opens properly before I let you throw money at it.</p><p>— Cally</p></div>
  </section></div>;
}
