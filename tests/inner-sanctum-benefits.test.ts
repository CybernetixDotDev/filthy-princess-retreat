import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { BENEFIT_STATUSES, BENEFIT_TYPES, RESPONDABLE_BENEFIT_TYPES, isSafeBenefitCta } from "../lib/inner-sanctum-benefits.ts";

test("FP-7 keeps benefit vocabulary and response eligibility narrow", () => {
  assert.deepEqual(BENEFIT_TYPES, ["invitation", "gift", "experience", "event", "retreat", "personal"]);
  assert.deepEqual(BENEFIT_STATUSES, ["draft", "available", "withdrawn", "completed", "expired"]);
  assert.deepEqual(RESPONDABLE_BENEFIT_TYPES, ["invitation", "event", "retreat"]);
});

test("benefit CTAs accept internal paths and reject unsafe destinations", () => {
  assert.equal(isSafeBenefitCta("/inner-sanctum/collection"), true);
  assert.equal(isSafeBenefitCta("https://example.com"), false);
  assert.equal(isSafeBenefitCta("//example.com"), false);
  assert.equal(isSafeBenefitCta("javascript:alert(1)"), false);
  assert.equal(isSafeBenefitCta("/safe\\redirect"), false);
  assert.equal(isSafeBenefitCta("/safe\nredirect"), false);
});

test("private benefit media is signed only after the member benefit RPC resolves it", () => {
  const source = readFileSync(new URL("../lib/inner-sanctum-benefit-data.ts", import.meta.url), "utf8");
  assert.match(source, /rpc\("get_my_inner_sanctum_benefits"\)/);
  assert.match(source, /createSignedUrl\(benefit\.media_path, 300\)/);
  assert.doesNotMatch(source, /service.?role/i);
});
