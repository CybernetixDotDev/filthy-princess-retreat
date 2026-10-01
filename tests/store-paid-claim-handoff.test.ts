import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260930130000_store_paid_claim_handoff.sql", "utf8");

test("paid claim handoff requires verified payment and pure membership fulfillment", () => {
  assert.match(migration, /create function public\.issue_payfast_store_claim/);
  assert.match(migration, /attempt_row\.status <> 'settled'/);
  assert.match(migration, /order_row\.status <> 'paid'/);
  assert.match(migration, /order_row\.payment_status <> 'verified'/);
  assert.match(migration, /perform store_private\.assert_supported_order/);
  assert.match(migration, /grant execute on function public\.issue_payfast_store_claim[\s\S]*to service_role/);
});

test("new PayFast return skips the claim handoff while legacy redemption stays identity-bound", () => {
  const action = readFileSync("app/actions/store-checkout.ts", "utf8");
  const returnPage = readFileSync("app/checkout/[reference]/payfast/return/page.tsx", "utf8");
  const claimPage = readFileSync("app/claim/page.tsx", "utf8");
  const redeem = readFileSync("supabase/migrations/20260930130000_store_paid_claim_handoff.sql", "utf8");
  assert.doesNotMatch(action, /payfast_claim_handoff|store_claim_token|issue_payfast_store_claim|createStoreClaimSecret/);
  assert.match(returnPage, /redirect\(`\/checkout\/\$\{encodeURIComponent\(reference\)\}\?payfast=return`\)/);
  assert.doesNotMatch(returnPage, /claim/i);
  assert.match(claimPage, /signin\?returnTo=\/claim/);
  assert.match(redeem, /store_order_owned_by_another_user/);
  assert.doesNotMatch(redeem, /buyer_email/);
});

test("order status gates membership success on settlement and fulfillment, then distinguishes anonymous users", () => {
  const checkout = readFileSync("app/checkout/[reference]/page.tsx", "utf8");
  assert.match(checkout, /payfast === "return"/);
  assert.match(checkout, /order\.status === "paid"/);
  assert.match(checkout, /order\.payment_status === "verified"/);
  assert.match(checkout, /order\.fulfilled_at/);
  assert.match(checkout, /user\.is_anonymous === true/);
  assert.match(checkout, /The key is yours\./);
  assert.match(checkout, /Secure your account/);
  assert.match(checkout, /Enter the Inner Sanctum/);
  assert.match(checkout, /We&apos;re confirming your payment\./);
  assert.match(checkout, /Check payment status/);
});

test("admin fulfillment distinguishes membership, manual, and mixed orders", () => {
  const page = readFileSync("app/admin/store/orders/[id]/page.tsx", "utf8");
  const actions = readFileSync("app/admin/store/claim-actions.ts", "utf8");
  assert.match(page, /Membership fulfilment/);
  assert.match(page, /Mixed membership\/manual fulfillment cannot be marked complete/);
  assert.match(page, /!pureLifetimeMembership && !mixedFulfillment/);
  assert.match(actions, /Only paid, verified lifetime membership orders can issue a claim/);
  const controls = readFileSync("components/admin-store-claim-controls.tsx", "utf8");
  assert.match(controls, /It has not been emailed/);
});

test("legacy recovery is scoped to the known product and order", () => {
  const migration = readFileSync("supabase/migrations/20260930131000_store_lifetime_membership_legacy_recovery.sql", "utf8");
  const page = readFileSync("app/admin/store/orders/[id]/page.tsx", "utf8");
  assert.match(migration, /2a5564f3-502c-48db-bb45-a8a9a1de475e/);
  assert.match(migration, /77e5cde7-9535-4bc2-b53c-f54212d578b3/);
  assert.match(migration, /fulfillment_reference is null/);
  assert.match(migration, /selected_order\.total_amount = 5000\.00/);
  assert.match(page, /legacyLifetimeMembership/);
});