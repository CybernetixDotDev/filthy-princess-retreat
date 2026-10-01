import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthState } from "@/lib/auth";
import { formatStoreMoney } from "@/lib/store";
import { FilthCheckoutControls, PayFastCheckoutControls, StoreCheckoutControls } from "@/components/store-checkout-controls";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function CheckoutPage({ params, searchParams }: {
  params: Promise<{ reference: string }>;
  searchParams: Promise<{ payfast?: string }>;
}) {
  const { reference } = await params;
  const { payfast } = await searchParams;
  const returnedFromPayFast = payfast === "return";
  if (!/^FP-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/.test(reference)) notFound();
  const { user, supabase } = await getAuthState();
  const { data: publicData } = await supabase.rpc("get_public_store_order", { p_order_reference: reference });
  const summary = publicData?.[0];
  if (!summary) notFound();
  const { data: order } = user ? await supabase.rpc("get_my_store_checkout", { p_order_reference: reference }) : { data: null };
  const [{ data: progression }, { data: hold }] = order?.acquisition_method === "filth" ? await Promise.all([
    supabase.rpc("get_my_filth_progression"),
    supabase.rpc("get_my_store_inventory_hold", { p_order_reference: reference }),
  ]) : [{ data: null }, { data: null }];
  const currentHold = hold?.[0];
  const lifetimeMembershipOrder = publicData.length === 1
    && publicData[0].product_type === "membership"
    && publicData[0].product_slug === "inner-sanctum-lifetime";
  const membershipConfirmed = Boolean(order
    && lifetimeMembershipOrder
    && order.status === "paid"
    && order.payment_status === "verified"
    && order.fulfilled_at);
  return <main className="store-order-page store-order-status-page"><section className="store-order-summary">
    <p className="eyebrow">Store order</p><h1>Order status</h1>
    <dl><dt>Order</dt><dd>{reference}</dd><dt>Total</dt><dd>{formatStoreMoney(Number(summary.total_amount), summary.currency)}</dd></dl>
    <ul>{publicData.map((line) => <li key={line.item_id}>{line.product_name} × {line.quantity} ({formatStoreMoney(Number(line.line_total_amount), line.currency)})</li>)}</ul>
    {!user ? <>{summary.order_status === "pending" && !returnedFromPayFast ? <PayFastCheckoutControls reference={reference} /> : null}{summary.order_status === "pending" && returnedFromPayFast ? <><h2>We&apos;re confirming your payment.</h2><p>PayFast can take a moment to confirm. Check this page again shortly.</p><Link className="text-link" href={`/checkout/${encodeURIComponent(reference)}?payfast=return`}>Check payment status</Link></> : null}<p>Order status: {summary.order_status}</p></> : !order ? <StoreCheckoutControls reference={reference} bind /> : <>
      <p>Payment: {order.acquisition_method === "filth" ? "Filth" : order.payment_status}</p>
      {order.status === "pending" && (order.payment_status === "pending" || order.payment_status === "rejected") && <>
        {order.acquisition_method === "money" && returnedFromPayFast ? <><h2>We&apos;re confirming your payment.</h2><p>PayFast can take a moment to confirm. Check this page again shortly.</p><Link className="text-link" href={`/checkout/${encodeURIComponent(reference)}?payfast=return`}>Check payment status</Link></> : order.acquisition_method === "money" ? <PayFastCheckoutControls reference={reference} /> : null}
        {order.acquisition_method === "filth" && progression?.[0] && order.filth_price_snapshot ? <><p>{currentHold?.status === "held" ? "Reserved for you for 15 minutes." : "This inventory hold is no longer active."}</p><FilthCheckoutControls reference={reference} price={order.filth_price_snapshot} available={Number(progression[0].available_filth)} /></> : <details className="store-manual-payment"><summary>Alternative: manual payment</summary><p style={{ whiteSpace: "pre-line" }}>{process.env.STORE_PAYMENT_INSTRUCTIONS?.trim() || "Contact Filthy Princess for payment instructions before sending funds. Only confirm below once you have made the agreed payment."}</p><StoreCheckoutControls reference={reference} bind={false} /></details>}
      </>}
      {order.payment_status === "submitted" && <p>Payment submitted. Awaiting independent verification. You can return to this page to check its status.</p>}
      {order.payment_status === "rejected" && <p>Payment could not be verified. Contact Filthy Princess with your order reference before taking any further payment action.</p>}
      {membershipConfirmed ? <><h2>The key is yours.</h2>{user.is_anonymous === true ? <Link className="primary-link" href="/you">Secure your account</Link> : <Link className="primary-link" href="/inner-sanctum">Enter the Inner Sanctum</Link>}</> : null}
      {order.payment_status === "verified" && !membershipConfirmed && <><p>{order.fulfilled_at || order.fulfillment_completed_at ? "Payment received and fulfilment completed." : "Payment received. Your order is awaiting fulfilment."}</p>{order.fulfilled_at ? <Link className="primary-link" href="/inner-sanctum">Enter the Inner Sanctum</Link> : <div className="store-checkout-next"><Link className="primary-link" href="/store">Return to Store →</Link><Link className="text-link" href="/contribute">Get Filthier →</Link></div>}</>}
      {(order.status === "cancelled" || order.status === "failed") && <p>This order is no longer open for payment.</p>}
      {order.payment_reference && <p>Your payment reference: {order.payment_reference}</p>}
    </>}
  </section></main>;
}
