import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPayFastFields, createPayFastItnParameterString, createPayFastParameterString, createPayFastSignature, createPayFastSignatureFromEntries, getPayFastConfig, getPayFastRequestDiagnostics, isPayFastSourceIp, parsePayFastFormData, parsePayFastNotification, parsePayFastNotificationEntries } from "../lib/payfast.ts";

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
  assert.throws(() => parsePayFastNotification("merchant_id=1"), /payfast_signature_absent/);
  assert.throws(() => parsePayFastNotification("signature="), /payfast_signature_empty/);
  assert.throws(() => parsePayFastNotification("signature=not-a-signature"), /payfast_signature_malformed/);
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
  assert.match(itnRoute, /getPayFastRequestDiagnostics\(rawBody, request\.headers\.get\("content-type"\)\)/);
  assert.doesNotMatch(itnRoute, /console\.warn\([^\n]*(parsed\.values|providerReference|orderReference|passphrase|sourceIp)/i);
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
  assert.match(itnRoute, /malformedReason\(error\)/);
  for (const subreason of ["payfast_body_invalid", "payfast_duplicate_field", "payfast_signature_absent", "payfast_signature_empty", "payfast_signature_malformed"]) {
    assert.match(payfast, new RegExp(subreason));
  }
  assert.match(itnRoute, /invalid_form_encoding/);
  assert.doesNotMatch(itnRoute, /rawBody.*console|signature.*console|passphrase.*console/i);
});

test("synthetic documented ITN form preserves the signature field", () => {
  const parsed = parsePayFastNotification([
    "m_payment_id=FP-PF-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "pf_payment_id=123456",
    "payment_status=COMPLETE",
    "amount_gross=5000.00",
    "merchant_id=10000100",
    "signature=0123456789abcdef0123456789abcdef",
  ].join("&"));
  assert.equal(parsed.signature, "0123456789abcdef0123456789abcdef");
  assert.equal(parsed.values.has("signature"), true);
  assert.equal(parsed.entries.length, 6);
});

test("malformed diagnostics expose only request shape metadata", () => {
  const diagnostics = getPayFastRequestDiagnostics("m_payment_id=x&signature=0123456789abcdef0123456789abcdef", "application/x-www-form-urlencoded; charset=UTF-8");
  assert.deepEqual(diagnostics, {
    contentTypeCategory: "application/x-www-form-urlencoded",
    bodyLengthBucket: "1-100",
    parsedFieldCount: 2,
    has_m_payment_id: true,
    has_pf_payment_id: false,
    has_payment_status: false,
    has_amount_gross: false,
    has_merchant_id: false,
    has_signature: true,
    hasUnexpectedFields: false,
  });
});

test("multipart ITN entries preserve order, empty optional fields, and signature", () => {
  const form = new FormData();
  form.append("m_payment_id", "FP-PF-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  form.append("pf_payment_id", "123456");
  form.append("payment_status", "COMPLETE");
  form.append("amount_gross", "5000.00");
  form.append("item_description", "");
  form.append("merchant_id", "10000100");
  form.append("signature", "0123456789abcdef0123456789abcdef");
  const parsed = parsePayFastNotificationEntries([...form.entries()].map(([key, value]) => {
    assert.equal(typeof value, "string");
    return [key, value as string];
  }));
  assert.equal(parsed.signature, "0123456789abcdef0123456789abcdef");
  assert.equal(parsed.entries[4][0], "item_description");
  assert.equal(parsed.entries[4][1], "");
});

test("multipart parser rejects duplicate keys and file parts", () => {
  assert.throws(() => parsePayFastNotificationEntries([["signature", "0123456789abcdef0123456789abcdef"], ["signature", "0123456789abcdef0123456789abcdef"]]), /payfast_duplicate_field/);
  const file = new File(["not a notification"], "payload.txt");
  const form = new FormData();
  form.append("signature", file);
  assert.throws(() => parsePayFastFormData(form), /payfast_file_part/);
});

test("multipart diagnostic body bucket uses actual request bytes", () => {
  const diagnostics = getPayFastRequestDiagnostics("", "multipart/form-data", 33000);
  assert.equal(diagnostics.bodyLengthBucket, "over-32000");
  assert.equal(diagnostics.contentTypeCategory, "multipart/form-data");
});

test("URL-encoded and multipart ITNs share PayFast canonical signatures", () => {
  const passphrase = "sandbox passphrase";
  const fields: Array<[string, string]> = [
    ["m_payment_id", "FP-PF-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"],
    ["item_description", "  Space + plus & ampersand % percent  "],
    ["custom_str1", ""],
    ["payment_status", "COMPLETE"],
    ["amount_gross", "5000.00"],
    ["merchant_id", "10000100"],
  ];
  const signature = createPayFastSignatureFromEntries(fields, passphrase);
  assert.equal(signature, "8dc254488e346197a1af1bef1f283625");
  const urlEncoded = new URLSearchParams([...fields, ["signature", signature]]).toString();
  const urlParsed = parsePayFastNotification(urlEncoded);
  const multipart = new FormData();
  for (const [key, value] of [...fields, ["signature", signature]]) multipart.append(key, value);
  const multipartParsed = parsePayFastFormData(multipart);
  assert.equal(urlParsed.signature, signature);
  assert.equal(multipartParsed.signature, signature);
  assert.equal(createPayFastSignatureFromEntries(urlParsed.entries.filter(([key]) => key !== "signature"), passphrase), signature);
  assert.equal(createPayFastSignatureFromEntries(multipartParsed.entries.filter(([key]) => key !== "signature"), passphrase), signature);
});

test("ITN canonicalization preserves empty fields while checkout canonicalization omits them", () => {
  const entries: Array<[string, string]> = [["first", "value"], ["optional", ""], ["last", "value"]];
  assert.equal(createPayFastItnParameterString(entries), "first=value&optional=&last=value");
  assert.equal(createPayFastParameterString(entries), "first=value&last=value");
});