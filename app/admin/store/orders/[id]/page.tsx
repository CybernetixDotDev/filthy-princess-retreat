import { notFound } from "next/navigation";
import { AdminStoreClaimControls } from "@/components/admin-store-claim-controls";
import { requireAdmin } from "@/lib/auth";
import type { InnerSanctumMembershipStatus } from "@/lib/database.types";
import { formatStoreMoney, storeLabel } from "@/lib/store";
import { deriveStoreOrderLifecycle } from "@/lib/store-order-lifecycle";

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

  if (latestClaim?.claim_status === "claimed" && latestClaim.claimed_by) {
    const { data: members, error: membersError } = await state.supabase.rpc("admin_list_inner_sanctum_members");
    if (membersError) throw new Error("Unable to load resulting membership state.");
    membershipStatus = members?.find((member) => member.user_id === latestClaim.claimed_by)?.membership_status ?? null;
  }

  const lifecycle = deriveStoreOrderLifecycle({
    commercialStatus: order.status,
    isAuthorized: Boolean(authorization),
    claimStatus: latestClaim?.claim_status ?? null,
    membershipStatus,
  });
  const membershipClaimed = lifecycle.key === "Claimed" && lifecycle.membership === "Active";

  return <>
    <div className="admin-title"><div><p className="eyebrow">Store order</p><h1>{order.order_reference}</h1></div></div>
    {membershipClaimed ? <section className="admin-panel store-membership-claimed" aria-label="Membership fulfillment result">
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
        <div><dt>Fulfillment</dt><dd>{lifecycle.fulfillment}</dd></div>
        <div><dt>Key</dt><dd>{lifecycle.key}</dd></div>
        <div><dt>Membership</dt><dd>{lifecycle.membership}</dd></div>
      </dl>
    </section>
    <section className="admin-panel"><dl className="detail-list">
      <div><dt>Commercial status</dt><dd>{lifecycle.commercial}</dd></div>
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
    <section className="admin-panel"><h2>Fulfillment and key</h2>
      {authorization ? <dl className="detail-list">
        <div><dt>Authorization</dt><dd>Authorized</dd></div>
        <div><dt>Source</dt><dd>{storeLabel(authorization.authorization_source)}</dd></div>
        <div><dt>Authorized</dt><dd>{new Date(authorization.authorized_at).toLocaleString("en-ZA")}</dd></div>
        {latestClaim && <><div><dt>Latest key</dt><dd>{storeLabel(latestClaim.claim_status ?? "")}</dd></div>
          <div><dt>Key created</dt><dd>{latestClaim.claim_created_at ? new Date(latestClaim.claim_created_at).toLocaleString("en-ZA") : "—"}</dd></div>
          {latestClaim.claimed_at && <div><dt>Claimed</dt><dd>{new Date(latestClaim.claimed_at).toLocaleString("en-ZA")} by {latestClaim.claimed_email ?? latestClaim.claimed_by}</dd></div>}
          {latestClaim.revoked_at && <div><dt>Revoked</dt><dd>{new Date(latestClaim.revoked_at).toLocaleString("en-ZA")}</dd></div>}</>}
      </dl> : <p>Not authorized for fulfillment.</p>}
      <AdminStoreClaimControls orderId={id} authorizationExists={Boolean(authorization)} latestClaim={latestClaim?.claim_status ? { claim_status: latestClaim.claim_status } : null} />
    </section>
  </>;
}
