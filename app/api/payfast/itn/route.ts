import { createHash } from "node:crypto";
import { getPayFastConfig, createPayFastParameterString, createPayFastSignatureFromEntries, getPayFastRequestDiagnostics, isPayFastSourceIp, parsePayFastFormData, parsePayFastNotification } from "@/lib/payfast";
import { createServiceClient } from "@/lib/supabase/service";

const referencePattern = /^FP-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/;
const attemptPattern = /^FP-PF-[A-F0-9]{32}$/;
const amountPattern = /^\d+(\.\d{1,2})?$/;

function response(message: string, status: number) {
  return new Response(message, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

function reject(reason: string, message: string, status = 400) {
  console.warn("[payfast-itn] rejected", { reason });
  return response(message, status);
}

function malformedReason(error: unknown) {
  if (!(error instanceof Error)) return "invalid_form_encoding";
  if (["payfast_body_invalid", "payfast_duplicate_field", "payfast_signature_absent", "payfast_signature_empty", "payfast_signature_malformed"].includes(error.message)) return error.message;
  return "invalid_form_encoding";
}

async function confirmWithPayFast(config: ReturnType<typeof getPayFastConfig>, entries: Array<[string, string]>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const result = await fetch(config.validationUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "FilthyPrincessPayFastITN/1.0" },
      body: createPayFastParameterString(entries),
      signal: controller.signal,
      cache: "no-store",
    });
    return result.ok && (await result.text()).trim() === "VALID";
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request) {
  let config: ReturnType<typeof getPayFastConfig>;
  try { config = getPayFastConfig(); } catch { return reject("configuration_unavailable", "PayFast configuration unavailable.", 503); }
  let parsed: ReturnType<typeof parsePayFastNotification>;
  const contentType = request.headers.get("content-type")?.toLowerCase().split(";", 1)[0] ?? "";
  let requestShape: ReturnType<typeof getPayFastRequestDiagnostics> | undefined;
  try {
    if (contentType === "application/x-www-form-urlencoded") {
      const rawBody = await request.text();
      requestShape = getPayFastRequestDiagnostics(rawBody, request.headers.get("content-type"));
      parsed = parsePayFastNotification(rawBody);
    } else if (contentType === "multipart/form-data") {
      const contentLength = Number(request.headers.get("content-length") ?? "");
      if (Number.isFinite(contentLength) && contentLength > 32_000) throw new Error("payfast_body_invalid");
      const formData = await request.clone().formData();
      const bodyBytes = await request.arrayBuffer();
      if (bodyBytes.byteLength > 32_000) throw new Error("payfast_body_invalid");
      requestShape = getPayFastRequestDiagnostics("", request.headers.get("content-type"), bodyBytes.byteLength);
      parsed = parsePayFastFormData(formData);
    } else {
      throw new Error("payfast_content_type_unsupported");
    }
  } catch (error) {
    const subreason = error instanceof Error && error.message === "payfast_content_type_unsupported" ? "unsupported_content_type" : error instanceof Error && error.message === "payfast_file_part" ? "file_part_rejected" : malformedReason(error);
    const safeShape = requestShape ?? { contentTypeCategory: contentType || "missing", bodyLengthBucket: "unknown", parsedFieldCount: 0, has_m_payment_id: false, has_pf_payment_id: false, has_payment_status: false, has_amount_gross: false, has_merchant_id: false, has_signature: false, hasUnexpectedFields: false };
    console.warn("[payfast-itn] rejected", { reason: "malformed_payload", subreason, ...safeShape });
    return response("Invalid PayFast notification.", 400);
  }
  const values = parsed.values;
  const required = ["merchant_id", "m_payment_id", "pf_payment_id", "payment_status", "item_name", "amount_gross"];
  if (required.some(field => !values.get(field))) return reject("missing_required_fields", "Incomplete PayFast notification.");
  const paymentStatus = values.get("payment_status")!.toUpperCase();
  const providerReference = values.get("m_payment_id")!;
  const orderReference = values.get("item_name")!;
  const amount = values.get("amount_gross")!;
  if (values.get("merchant_id") !== config.merchantId) return reject("invalid_merchant", "PayFast notification rejected.");
  if (!attemptPattern.test(providerReference)) return reject("invalid_attempt_reference", "PayFast notification rejected.");
  if (!referencePattern.test(orderReference)) return reject("invalid_order_reference", "PayFast notification rejected.");
  if (!/^\d+$/.test(values.get("pf_payment_id")!)) return reject("invalid_provider_payment_id", "PayFast notification rejected.");
  if (!["COMPLETE", "CANCELLED", "FAILED"].includes(paymentStatus)) return reject("invalid_status", "PayFast notification rejected.");
  if (!amountPattern.test(amount)) return reject("invalid_amount", "PayFast notification rejected.");
  if (createPayFastSignatureFromEntries(parsed.entries.filter(([key]) => key !== "signature"), config.passphrase).toLowerCase() !== parsed.signature.toLowerCase()) return reject("invalid_signature", "PayFast notification rejected.");
  const sourceIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip");
  if (!isPayFastSourceIp(sourceIp)) return reject("invalid_source", "PayFast source rejected.");
  try {
    if (!await confirmWithPayFast(config, parsed.entries.filter(([key]) => key !== "signature"))) return reject("provider_confirmation_failed", "PayFast server confirmation failed.");
  } catch { return reject("provider_confirmation_unavailable", "PayFast server confirmation unavailable.", 503); }

  const fingerprint = createHash("sha256").update(createPayFastParameterString(parsed.entries)).digest("hex");
  const supabase = createServiceClient();
  const { data, error } = await supabase.rpc("settle_payfast_store_payment", {
    p_provider_reference: providerReference,
    p_provider_payment_id: values.get("pf_payment_id")!,
    p_notification_fingerprint: fingerprint,
    p_payment_status: paymentStatus,
    p_amount: amount,
    p_currency: "ZAR",
    p_verification_note: paymentStatus === "COMPLETE" ? "PayFast ITN verified; membership attachment remains a later flow." : `PayFast status ${paymentStatus}.`,
  });
  if (error || !data?.[0]) return reject("settlement_unavailable", "PayFast notification could not be durably processed.", 503);
  return response("OK", 200);
}