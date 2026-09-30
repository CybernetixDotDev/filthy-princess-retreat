import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260930100000_store_multi_item_cart_checkout.sql", "utf8");

test("multi-item migration preserves the legacy RPC and adds cart validation", () => {
  assert.match(migration, /create or replace function public\.create_public_store_order_multi\(/);
  assert.match(migration, /create or replace function public\.create_public_store_order\(/);
  assert.match(migration, /create_public_store_order_multi\(jsonb, text, uuid, text, public\.store_acquisition_method\)/);
  assert.match(migration, /store_order_request_conflict/);
  assert.match(migration, /store_currency_mismatch/);
  assert.match(migration, /store_membership_quantity_invalid/);
  assert.match(migration, /request_fingerprint/);
});

test("multi-item migration handles inventory line by line and mixed fulfillment", () => {
  assert.match(migration, /store_order_items_order_product_key unique/);
  assert.match(migration, /store_inventory_holds_order_product_key unique/);
  assert.match(migration, /for line in\s+select i\.product_id/);
  assert.match(migration, /perform store_private\.consume_inventory\(o\.id\)/);
  assert.match(migration, /not \(fulfillment_type = 'inner_sanctum_membership'/);
});

test("corrective RPC migration qualifies the order reference lookup", () => {
  const corrective = readFileSync("supabase/migrations/20260930102000_fix_store_multi_order_reference_ambiguity.sql", "utf8");
  assert.match(corrective, /create or replace function public\.create_public_store_order_multi\(/);
  assert.match(corrective, /order_row\.order_reference = candidate_reference/);
  assert.doesNotMatch(corrective, /from public\.store_orders\s+where order_reference = candidate_reference/);
  assert.match(corrective, /security definer/);
  assert.match(corrective, /set search_path = ''/);
  assert.match(corrective, /grant execute on function public\.create_public_store_order_multi\(/);
});

test("PayFast attempt migration keeps payment attempts private behind RPCs", () => {
  const migration = readFileSync("supabase/migrations/20260930110000_store_payfast_payment_attempts.sql", "utf8");
  assert.match(migration, /create table public\.store_payfast_payment_attempts/);
  assert.match(migration, /revoke all on table public\.store_payfast_payment_attempts/);
  assert.match(migration, /create function public\.begin_public_payfast_store_payment/);
  assert.match(migration, /payment_status in \('submitted', 'verified'\)/);
  assert.match(migration, /payfast_inventory_expired/);
  assert.match(migration, /grant execute on function public\.begin_public_payfast_store_payment/);
});