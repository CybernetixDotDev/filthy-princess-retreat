import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync("supabase/migrations/20260911145238_referral_filth_meter_foundation.sql", "utf8");
const proxy = readFileSync("lib/supabase/proxy.ts", "utf8");
const storeAction = readFileSync("app/actions/store.ts", "utf8");

test("referral codes and order attribution are server controlled", () => {
  assert.match(migration, /code text not null unique/);
  assert.match(migration, /order_id uuid not null unique references public\.store_orders/);
  assert.match(proxy, /is_valid_inner_sanctum_referral_code/);
  assert.match(proxy, /httpOnly: true/);
  assert.match(proxy, /maxAge: 60 \* 60 \* 24 \* 90/);
  assert.match(storeAction, /cookies\(\)/);
  assert.match(storeAction, /p_referral_code: referralCode/);
});

test("conversion and Filth contracts are idempotent and configurable", () => {
  assert.match(migration, /order_id uuid not null unique references public\.store_orders/);
  assert.match(migration, /referred_user_id uuid not null unique references auth\.users/);
  assert.match(migration, /inner_sanctum_referral_conversions_not_self/);
  assert.match(migration, /select referral_points into points from public\.inner_sanctum_filth_settings/);
  assert.match(migration, /unique \(user_id, milestone_id\)/);
  assert.match(migration, /event_type,points,source_reference/);
});

test("PayFast seam is private and admin testing does not alter payment status", () => {
  assert.match(migration, /inner_sanctum_referral_private\.record_successful_referral_conversion/);
  assert.match(migration, /revoke all on function inner_sanctum_referral_private\.record_successful_referral_conversion/);
  assert.doesNotMatch(migration, /update public\.store_orders set status='paid'/);
  assert.doesNotMatch(migration, /insert into public\.store_payments/);
});

test("members cannot directly mutate conversion or Filth records", () => {
  assert.match(migration, /revoke all on table public\.inner_sanctum_referrals,public\.store_order_referrals,public\.inner_sanctum_referral_conversions/);
  assert.match(migration, /grant select on public\.store_order_referrals,public\.inner_sanctum_referral_conversions/);
  assert.doesNotMatch(migration, /grant insert[^;]*inner_sanctum_referral_conversions/i);
  assert.doesNotMatch(migration, /grant insert[^;]*inner_sanctum_filth_events/i);
});
