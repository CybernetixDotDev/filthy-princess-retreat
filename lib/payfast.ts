import { createHash } from "node:crypto";

export const PAYFAST_SANDBOX_PROCESS_URL = "https://sandbox.payfast.co.za/eng/process";
export const PAYFAST_LIVE_PROCESS_URL = "https://www.payfast.co.za/eng/process";
export type PayFastConfig = { mode: "sandbox" | "production"; merchantId: string; merchantKey: string; passphrase: string; returnBaseUrl: string; validationUrl: string; processUrl: string };

function payFastEncode(value: string) {
  return encodeURIComponent(value.trim()).replace(/%20/g, "+").replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function getPayFastConfig(): PayFastConfig {
  const mode = process.env.PAYFAST_MODE?.trim();
  if (mode !== "sandbox" && mode !== "production") throw new Error("PayFast mode is not enabled.");
  const merchantId = process.env[mode === "sandbox" ? "PAYFAST_SANDBOX_MERCHANT_ID" : "PAYFAST_PRODUCTION_MERCHANT_ID"]?.trim();
  const merchantKey = process.env[mode === "sandbox" ? "PAYFAST_SANDBOX_MERCHANT_KEY" : "PAYFAST_PRODUCTION_MERCHANT_KEY"]?.trim();
  const passphrase = process.env[mode === "sandbox" ? "PAYFAST_SANDBOX_PASSPHRASE" : "PAYFAST_PRODUCTION_PASSPHRASE"]?.trim();
  const returnBaseUrl = process.env.PAYFAST_RETURN_BASE_URL?.trim();
  if (!merchantId || !/^\d{1,8}$/.test(merchantId) || !merchantKey || !passphrase || !returnBaseUrl) throw new Error("PayFast Sandbox configuration is incomplete.");
  let parsedUrl: URL;
  try { parsedUrl = new URL(returnBaseUrl); } catch { throw new Error("PayFast return URL is invalid."); }
  const isLocalhost = parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1";
  const hasAllowedProtocol = parsedUrl.protocol === "https:" || (mode === "sandbox" && isLocalhost && parsedUrl.protocol === "http:");
  if (!hasAllowedProtocol || parsedUrl.search || parsedUrl.hash || (mode === "production" && parsedUrl.hostname !== "www.filthyprincesss.com")) throw new Error("PayFast return URL is not an allowed origin.");
  return { mode, merchantId, merchantKey, passphrase, returnBaseUrl: parsedUrl.origin, validationUrl: `https://${mode === "sandbox" ? "sandbox.payfast.co.za" : "www.payfast.co.za"}/eng/query/validate`, processUrl: mode === "sandbox" ? PAYFAST_SANDBOX_PROCESS_URL : PAYFAST_LIVE_PROCESS_URL };
}

export function createPayFastSignature(fields: Record<string, string>, passphrase: string) {
  return createPayFastSignatureFromEntries(Object.entries(fields), passphrase);
}

export function createPayFastSignatureFromEntries(entries: Array<[string, string]>, passphrase: string) {
  const parameterString = createPayFastParameterString(entries);
  return createHash("md5").update(`${parameterString}&passphrase=${payFastEncode(passphrase)}`).digest("hex");
}

export function createPayFastParameterString(entries: Array<[string, string]>) {
  return entries.filter(([, value]) => value !== "").map(([key, value]) => `${key}=${payFastEncode(value)}`).join("&");
}

export function parsePayFastNotification(rawBody: string) {
  if (!rawBody || rawBody.length > 32_000) throw new Error("payfast_body_invalid");
  const params = new URLSearchParams(rawBody);
  const entries: Array<[string, string]> = [];
  const values = new Map<string, string>();
  for (const [key, value] of params.entries()) {
    if (values.has(key)) throw new Error("payfast_duplicate_field");
    entries.push([key, value]);
    values.set(key, value);
  }
  if (!values.has("signature")) throw new Error("payfast_signature_absent");
  const signature = values.get("signature");
  if (signature === "") throw new Error("payfast_signature_empty");
  if (typeof signature !== "string" || !/^[a-f0-9]{32}$/i.test(signature)) throw new Error("payfast_signature_malformed");
  return { entries, values, signature };
}

export function isPayFastSourceIp(ip: string | null) {
  if (!ip || !/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return false;
  const parts = ip.split(".").map(Number);
  if (parts.some(part => part > 255)) return false;
  const value = parts.reduce((result, part) => result * 256 + part, 0);
  const ranges = [[197, 97, 145, 144, 28], [41, 74, 179, 192, 27], [102, 216, 36, 0, 28], [102, 216, 36, 128, 28], [144, 126, 193, 139, 32]];
  return ranges.some(([a, b, c, d, prefix]) => {
    const base = ((a * 256 + b) * 256 + c) * 256 + d;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (value & mask) === (base & mask);
  });
}

export function buildPayFastFields(input: { config: PayFastConfig; orderReference: string; attemptReference: string; amount: number }) {
  const fields = {
    merchant_id: input.config.merchantId,
    merchant_key: input.config.merchantKey,
    return_url: `${input.config.returnBaseUrl}/checkout/${input.orderReference}/payfast/return?attempt=${encodeURIComponent(input.attemptReference)}`,
    cancel_url: `${input.config.returnBaseUrl}/checkout/${input.orderReference}/payfast/cancel?attempt=${encodeURIComponent(input.attemptReference)}`,
    notify_url: `${input.config.returnBaseUrl}/api/payfast/itn`,
    m_payment_id: input.attemptReference,
    amount: input.amount.toFixed(2),
    item_name: input.orderReference,
    item_description: "Filthy Princess Store order",
  };
  return { ...fields, signature: createPayFastSignature(fields, input.config.passphrase) };
}