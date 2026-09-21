import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthState } from "@/lib/auth";
import { formatStoreMoney } from "@/lib/store";
import { StoreCheckoutControls } from "@/components/store-checkout-controls";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params }: { params: Promise<{ reference: string }> }) {
  const { reference } = await params;
  if (!/^FP-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/.test(reference)) notFound();
  const { user, supabase } = await getAuthState();
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/checkout/${reference}`)}`);
  const { data: publicData } = await supabase.rpc("get_public_store_order", { p_order_reference: reference });
  const summary = publicData?.[0];
  if (!summary) notFound();
  const { data: order } = await supabase.rpc("get_my_store_checkout", { p_order_reference: reference });
  return <main className="store-order-page"><section className="store-order-summary">
    <p className="eyebrow">Checkout</p><h1>{summary.product_name}</h1>
    <dl><dt>Order</dt><dd>{reference}</dd><dt>Total</dt><dd>{formatStoreMoney(Number(summary.total_amount), summary.currency)}</dd></dl>
    {!order ? <StoreCheckoutControls reference={reference} bind /> : <>
      <p>Payment: {order.payment_status}</p>
      {order.payment_status === "pending" && order.status === "pending" && <>
        <p style={{ whiteSpace: "pre-line" }}>{process.env.STORE_PAYMENT_INSTRUCTIONS?.trim() || "Contact Filthy Princess for payment instructions before sending funds. Only confirm below once you have made the agreed payment."}</p>
        <StoreCheckoutControls reference={reference} bind={false} />
      </>}
      {order.payment_status === "submitted" && <p>Payment submitted. Awaiting independent verification. You can return to this page to check its status.</p>}
      {order.payment_status === "rejected" && <p>Payment could not be verified. Contact Filthy Princess with your order reference before taking any further payment action.</p>}
      {order.payment_status === "verified" && <><p>Payment verified. {order.fulfilled_at ? "Your membership is ready." : "Your order is awaiting fulfilment."}</p>{order.fulfilled_at && <Link className="primary-link" href="/inner-sanctum">Enter the Inner Sanctum</Link>}</>}
      {(order.status === "cancelled" || order.status === "failed") && <p>This order is no longer open for payment.</p>}
      {order.payment_reference && <p>Your payment reference: {order.payment_reference}</p>}
    </>}
  </section></main>;
}
