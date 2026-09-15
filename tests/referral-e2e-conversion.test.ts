import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const capture = readFileSync(new URL("../components/referral-capture.tsx", import.meta.url), "utf8");
const storeAction = readFileSync(new URL("../app/actions/store.ts", import.meta.url), "utf8");
const adminAction = readFileSync(new URL("../app/admin/referrals/actions.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260913108000_automatic_referral_conversion_on_claim.sql", import.meta.url), "utf8");

test("referral attribution uses the Store cookie and is first-touch", () => {
  assert.match(capture, /inner_sanctum_referral=/);
  assert.match(capture, /retreat_referral=/);
  assert.match(capture, /hasExisting/);
  assert.match(storeAction, /get\("inner_sanctum_referral"\)/);
});

test("successful membership claims automatically convert attributable referrals", () => {
  assert.match(migration, /new\.status = 'claimed'/);
  assert.match(migration, /record_successful_referral_conversion/);
  assert.match(migration, /'payfast'::public\.inner_sanctum_referral_conversion_source/);
  assert.match(migration, /conversion_id is null/);
  assert.match(migration, /new\.claimed_by/);
});

test("Admin test conversion remains synthetic and logs safe server diagnostics", () => {
  assert.match(adminAction, /admin_record_test_referral_conversion/);
  assert.match(adminAction, /console\.error\("Admin test referral conversion failed"/);
  assert.match(adminAction, /code: error\.code/);
  assert.match(adminAction, /The test conversion could not be recorded/);
});