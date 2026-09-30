import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPayFastFields, createPayFastSignature, getPayFastConfig, isPayFastSourceIp, parsePayFastNotification } from "../lib/payfast.ts";

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

test("ITN diagnostics expose fixed reason codes without payload logging", () => {
  const itnRoute = readFileSync("app/api/payfast/itn/route.ts", "utf8");
  for (const reason of ["malformed_payload", "invalid_merchant", "invalid_signature", "invalid_source", "invalid_amount", "provider_confirmation_failed"]) {
    assert.match(itnRoute, new RegExp(`\\"${reason}\\"`));
  }
  assert.match(itnRoute, /console\.warn\("\[payfast-itn\] rejected", \{ reason \}\)/);
  assert.doesNotMatch(itnRoute, /console\.warn\([^\n]*(rawBody|signature|passphrase|email|ip)/i);
});

test("PayFast origin validation accepts canonical production www and sandbox localhost", () => {
  const names = ["PAYFAST_MODE", "PAYFAST_PRODUCTION_MERCHANT_ID", "PAYFAST_PRODUCTION_MERCHANT_KEY", "PAYFAST_PRODUCTION_PASSPHRASE", "PAYFAST_SANDBOX_MERCHANT_ID", "PAYFAST_SANDBOX_MERCHANT_KEY", "PAYFAST_SANDBOX_PASSPHRASE", "PAYFAST_RETURN_BASE_URL"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.PAYFAST_MODE = "production";
    process.env.PAYFAST_PRODUCTION_MERCHANT_ID = "10000100";
    process.env.PAYFAST_PRODUCTION_MERCHANT_KEY = "production-key";
    process.env.PAYFAST_PRODUCTION_PASSPHRASE = "production-passphrase";
    process.env.PAYFAST_RETURN_BASE_URL = "https://www.filthyprincesss.com";
    assert.equal(getPayFastConfig().returnBaseUrl, "https://www.filthyprincesss.com");

    process.env.PAYFAST_MODE = "sandbox";
    process.env.PAYFAST_SANDBOX_MERCHANT_ID = "10000100";
    process.env.PAYFAST_SANDBOX_MERCHANT_KEY = "sandbox-key";
    process.env.PAYFAST_SANDBOX_PASSPHRASE = "sandbox-passphrase";
    process.env.PAYFAST_RETURN_BASE_URL = "http://localhost:3000";
    assert.equal(getPayFastConfig().returnBaseUrl, "http://localhost:3000");

    process.env.PAYFAST_MODE = "production";
    process.env.PAYFAST_RETURN_BASE_URL = "https://filthyprincesss.com";
    assert.throws(() => getPayFastConfig(), /allowed origin/);
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name]!;
    }
  }
});

test("malformed ITN diagnostics retain fixed parser subreason identifiers", () => {
  const itnRoute = readFileSync("app/api/payfast/itn/route.ts", "utf8");
  const payfast = readFileSync("lib/payfast.ts", "utf8");
  assert.match(itnRoute, /subreason: malformedReason\(error\)/);
  for (const subreason of ["payfast_body_invalid", "payfast_duplicate_field", "payfast_signature_missing"]) {
    assert.match(payfast, new RegExp(subreason));
  }
  assert.match(itnRoute, /invalid_form_encoding/);
  assert.doesNotMatch(itnRoute, /rawBody.*console|signature.*console|passphrase.*console/i);
});