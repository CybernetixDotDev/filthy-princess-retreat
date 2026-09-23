import { notFound } from "next/navigation";
import { AdminStoreClaimControls } from "@/components/admin-store-claim-controls";
import { AdminStorePaymentControls } from "@/components/admin-store-payment-controls";
import { requireAdmin } from "@/lib/auth";
import type { InnerSanctumMembershipStatus } from "@/lib/database.types";
import { formatStoreMoney, storeLabel } from "@/lib/store";
import { deriveStoreOrderLifecycle } from "@/lib/store-order-lifecycle";
import { markStoreOrderFulfilled } from "@/app/admin/store/fulfillment-actions";

export default async function AdminStoreOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await requireAdmin();
  if (!state) return null;
  const [{ data: order }, { data: items }, { data: fulfillment, error: fulfillmentError }] = await Promise.all([
    state.supabase.from("store_orders").select("*").eq("id", id).maybeSingle(),
    state.supabase.from("store_order_items").select("*").eq("order_id", id).order("created_at"),
    state.supabase.rpc("admin_get_store_fulfillment", { p_order_id: id }),
  ]);
  if (!order) notFound();
  if (fulfillmentError) throw new Error("Unable to load fulfillment state.");
  const rows = fulfillment ?? [];
  const authorization = rows[0] ?? null;
  const latestClaim = rows.find((row) => row.claim_id) ?? null;
  let membershipStatus: InnerSanctumMembershipStatus | null = null;

  const memberUserId = order.fulfilled_at ? order.user_id : latestClaim?.claim_status === "claimed" ? latestClaim.claimed_by : null;
  if (memberUserId) {
    const { data: members, error: membersError } = await state.supabase.rpc("admin_list_inner_sanctum_members");
    if (membersError) throw new Error("Unable to load resulting membership state.");
    membershipStatus = members?.find((member) => member.user_id === memberUserId)?.membership_status ?? null;
  }

  const isFulfilled = Boolean(order.fulfilled_at || order.fulfillment_completed_at);
  const lifecycle = deriveStoreOrderLifecycle({
    commercialStatus: order.status,
    isAuthorized: Boolean(authorization),
    claimStatus: latestClaim?.claim_status ?? null,
    membershipStatus,
    automaticallyFulfilled: isFulfilled,
  });
  const membershipClaimed = lifecycle.key === "Claimed" && lifecycle.membership === "Active";

  return <>
    <div className="admin-title"><div><p className="eyebrow">Store order</p><h1>{order.order_reference}</h1></div></div>
    {order.fulfilled_at ? <section className="admin-panel" aria-label="Membership fulfillment result">
      <p className="eyebrow">Automatic fulfillment</p>
      <h2>Membership fulfilled</h2>
      <p>Payment verification granted membership to the linked account. No claim key is required.</p>
      <p>Current membership: {lifecycle.membership}.</p>
    </section> : membershipClaimed ? <section className="admin-panel store-membership-claimed" aria-label="Membership fulfillment result">
      <p className="eyebrow">Membership claimed</p>
      <h2>Membership claimed</h2>
      <p>The customer has claimed this order and their Lifetime Inner Sanctum Membership is active.</p>
      {order.status === "pending" ? <p className="muted">Payment status remains pending because no payment provider has verified this order.</p> : null}
    </section> : null}
    <section className="admin-panel" aria-labelledby="order-lifecycle-heading">
      <p className="eyebrow">Order lifecycle</p>
      <h2 id="order-lifecycle-heading">Current state</h2>
      <dl className="store-order-lifecycle">
        <div><dt>Commercial</dt><dd>{lifecycle.commercial}</dd></div>
        <div><dt>Payment</dt><dd>{order.acquisition_method === "filth" ? "Paid with Filth" : lifecycle.commercial}</dd></div>
        <div><dt>Fulfillment</dt><dd>{isFulfilled ? "Fulfilled" : order.status === "paid" ? "Awaiting fulfilment" : "Not available"}</dd></div>
        <div><dt>Key</dt><dd>{lifecycle.key}</dd></div>
        <div><dt>Membership</dt><dd>{lifecycle.membership}</dd></div>
      </dl>
    </section>
    <section className="admin-panel"><dl className="detail-list">
      <div><dt>Commercial status</dt><dd>{lifecycle.commercial}</dd></div>
      <div><dt>Acquisition method</dt><dd>{order.acquisition_method === "filth" ? "Filth" : "Money"}</dd></div>
      <div><dt>Buyer email</dt><dd>{order.buyer_email}</dd></div>
      <div><dt>Linked Auth user</dt><dd>{order.user_id ?? "Not linked"}</dd></div>
      <div><dt>Total</dt><dd>{formatStoreMoney(Number(order.total_amount), order.currency)}</dd></div>
      <div><dt>Created</dt><dd>{new Date(order.created_at).toLocaleString("en-ZA")}</dd></div>
      <div><dt>Updated</dt><dd>{new Date(order.updated_at).toLocaleString("en-ZA")}</dd></div>
    </dl></section>
    <section className="admin-panel"><h2>Immutable order snapshot</h2>{items?.map((item) => <article className="store-order-item-admin" key={item.id}>
      <h3>{item.product_name}</h3><p>{item.product_slug} · {storeLabel(item.product_type)}</p>
      <p>{formatStoreMoney(Number(item.unit_price_amount), item.currency)} × {item.quantity} = {formatStoreMoney(Number(item.line_total_amount), item.currency)}</p>
      <p>Fulfillment: {storeLabel(item.fulfillment_type)} · {item.fulfillment_reference ?? "No reference"}</p>
    </article>)}</section>
    <section className="admin-panel"><h2>Payment review</h2>
      <dl className="detail-list">
        <div><dt>Payment status</dt><dd>{storeLabel(order.payment_status)}</dd></div>
        <div><dt>Method</dt><dd>{order.payment_method ? storeLabel(order.payment_method) : "Not submitted"}</dd></div>
        <div><dt>Customer reference</dt><dd>{order.payment_reference ?? "None supplied"}</dd></div>
        <div><dt>Submitted</dt><dd>{order.payment_submitted_at ?? "Not submitted"}</dd></div>
        <div><dt>Verified</dt><dd>{order.payment_verified_at ?? "Not verified"}</dd></div>
        <div><dt>Verified by</dt><dd>{order.payment_verified_by ?? "—"}</dd></div>
        <div><dt>Last review</dt><dd>{order.payment_reviewed_at ?? "Not reviewed"} {order.payment_reviewed_by ?? ""}</dd></div>
        <div><dt>Review note</dt><dd>{order.payment_verification_note ?? "None"}</dd></div>
        <div><dt>Automatic fulfilment</dt><dd>{order.fulfilled_at ?? "Not automatically fulfilled"}</dd></div>
        <div><dt>Fulfilled</dt><dd>{order.fulfillment_completed_at ?? "Awaiting fulfilment"}</dd></div>
      </dl>
      {order.payment_status === "submitted" && <AdminStorePaymentControls orderId={id} />}
    </section>
    <section className="admin-panel"><h2>Fulfillment and key</h2>
      {order.status === "paid" && !isFulfilled && !order.fulfilled_at ? <form action={markStoreOrderFulfilled}><input type="hidden" name="order_id" value={id} /><button className="button" type="submit">Mark as fulfilled</button></form> : null}
      {order.fulfilled_at && <p>Membership was fulfilled automatically after payment verification. No claim key is required.</p>}
      {authorization ? <dl className="detail-list">
        <div><dt>Authorization</dt><dd>Authorized</dd></div>
        <div><dt>Source</dt><dd>{storeLabel(authorization.authorization_source)}</dd></div>
        <div><dt>Authorized</dt><dd>{new Date(authorization.authorized_at).toLocaleString("en-ZA")}</dd></div>
        {latestClaim && <><div><dt>Latest key</dt><dd>{storeLabel(latestClaim.claim_status ?? "")}</dd></div>
          <div><dt>Key created</dt><dd>{latestClaim.claim_created_at ? new Date(latestClaim.claim_created_at).toLocaleString("en-ZA") : "—"}</dd></div>
          {latestClaim.claimed_at && <div><dt>Claimed</dt><dd>{new Date(latestClaim.claimed_at).toLocaleString("en-ZA")} by {latestClaim.claimed_email ?? latestClaim.claimed_by}</dd></div>}
          {latestClaim.revoked_at && <div><dt>Revoked</dt><dd>{new Date(latestClaim.revoked_at).toLocaleString("en-ZA")}</dd></div>}</>}
      </dl> : !order.fulfilled_at ? <p>Not authorized for fulfillment.</p> : null}
      <AdminStoreClaimControls orderId={id} authorizationExists={Boolean(authorization)} latestClaim={latestClaim?.claim_status ? { claim_status: latestClaim.claim_status } : null} />
    </section>
  </>;
}
