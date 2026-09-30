import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPayFastFields, createPayFastSignature, isPayFastSourceIp, parsePayFastNotification } from "../lib/payfast.ts";

test("PayFast signature preserves documented field order and excludes the passphrase from fields", () => {
  const fields = { merchant_id: "10000100", merchant_key: "merchant-key", amount: "10.00", item_name: "FP-ORDER" };
  const signature = createPayFastSignature(fields, "secret passphrase");
  assert.match(signature, /^[a-f0-9]{32}$/);
  assert.notEqual(signature, createPayFastSignature({ ...fields, item_name: "changed" }, "secret passphrase"));
  assert.doesNotMatch(JSON.stringify(buildPayFastFields({ config: { mode: "sandbox", merchantId: "10000100", merchantKey: "merchant-key", passphrase: "secret passphrase", returnBaseUrl: "https://filthyprincesss.com", validationUrl: "https://sandbox.payfast.co.za/eng/query/validate", processUrl: "https://sandbox.payfast.co.za/eng/process" }, orderReference: "FP-ORDER", attemptReference: "FP-PF-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", amount: 10 })), /secret passphrase/);
});

test("PayFast hosted fields use the existing order and attempt references", () => {
  const fields = buildPayFastFields({ config: { mode: "sandbox", merchantId: "10000100", merchantKey: "merchant-key", passphrase: "secret", returnBaseUrl: "https://filthyprincesss.com", validationUrl: "https://sandbox.payfast.co.za/eng/query/validate", processUrl: "https://sandbox.payfast.co.za/eng/process" }, orderReference: "FP-ORDER", attemptReference: "FP-PF-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", amount: 10 });
  assert.equal(fields.m_payment_id, "FP-PF-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  assert.equal(fields.amount, "10.00");
  assert.equal(fields.item_name, "FP-ORDER");
  assert.equal(fields.notify_url, "https://filthyprincesss.com/api/payfast/itn");
  assert.equal(fields.return_url.startsWith("https://filthyprincesss.com/checkout/FP-ORDER/payfast/return"), true);
});

test("ITN parsing rejects duplicate fields and source validation rejects non-PayFast addresses", () => {
  assert.throws(() => parsePayFastNotification("merchant_id=1&merchant_id=2&signature=00000000000000000000000000000000"), /payfast_duplicate_field/);
  assert.equal(isPayFastSourceIp("197.97.145.144"), true);
  assert.equal(isPayFastSourceIp("203.0.113.10"), false);
});

test("return and ITN routes cannot settle an order by browser navigation", () => {
  const returnPage = readFileSync("app/checkout/[reference]/payfast/return/page.tsx", "utf8");
  const itnRoute = readFileSync("app/api/payfast/itn/route.ts", "utf8");
  assert.doesNotMatch(returnPage, /supabase\.rpc|status.*paid|settle/);
  assert.match(itnRoute, /settle_payfast_store_payment/);
  assert.doesNotMatch(itnRoute, /payment_status.*paid/);
});