"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getPayFastConfig } from "@/lib/payfast";
import { createServiceClient } from "@/lib/supabase/service";
import { createStoreClaimSecret } from "@/lib/store-claims";
import { z } from "zod";

export type CheckoutActionState = { error?: string; message?: string };
const referenceSchema = z.string().regex(/^FP-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/);

export async function createAuthenticatedStoreOrder(_: CheckoutActionState, form: FormData): Promise<CheckoutActionState> {
  const parsed = z.object({ product: z.uuid(), request: z.uuid(), method: z.enum(["money", "filth"]).default("money") }).safeParse({
    product: form.get("product"), request: form.get("request"), method: form.get("method") ?? "money",
  });
  if (!parsed.success) return { error: "Invalid checkout request. Return to the Store and try again." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/checkout/start?product=${parsed.data.product}&method=${parsed.data.method}`)}`);
  if (!user.email) return { error: "Your account needs an email address to continue." };

  // Scope the form's retry token to this authenticated account and product.
  // The public RPC's request-key lookup is global, so never forward a raw client key.
  const digest = createHash("sha256").update(JSON.stringify([
    "authenticated-store-entry", user.id, parsed.data.product.toLowerCase(), parsed.data.request.toLowerCase(), parsed.data.method,
  ])).digest("hex");
  const requestKey = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  const referralCode = (await cookies()).get("inner_sanctum_referral")?.value ?? null;
  const { data, error } = await supabase.rpc("create_public_store_order", {
    p_product_id: parsed.data.product, p_buyer_email: user.email,
    p_request_key: requestKey, p_referral_code: referralCode, p_acquisition_method: parsed.data.method,
  });
  const order = data?.[0];
  if (error || !order) return { error: error?.message.includes("insufficient_filth") ? "You need a little more Filth before this can be yours. Get Filthier →" : error?.message.includes("store_inventory_unavailable") ? "This product is no longer available." : "That order could not be prepared. Please try again." };
  redirect(`/checkout/${encodeURIComponent(order.order_reference)}`);
}

export async function redeemFilthStoreOrder(_: CheckoutActionState, form: FormData): Promise<CheckoutActionState> {
  const reference = referenceSchema.safeParse(form.get("order_reference"));
  if (!reference.success) return { error: "Invalid checkout reference." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("settle_my_filth_store_order", { p_order_reference: reference.data });
  if (error) return { error: error.message.includes("filth_configuration_changed") ? "The Filth price changed. Refresh this checkout to review the current price." : error.message.includes("insufficient_filth") ? "You no longer have enough Available Filth for this order." : error.message.includes("hold_expired") ? "This inventory hold has expired. Return to the Store to try again." : "Filth could not be committed. Refresh and review this order before trying again." };
  revalidatePath(`/checkout/${reference.data}`);
  return { message: "Filth committed. Your order is confirmed." };
}

export async function bindStoreOrder(_: CheckoutActionState, form: FormData): Promise<CheckoutActionState> {
  const reference = referenceSchema.safeParse(form.get("order_reference"));
  if (!reference.success) return { error: "Invalid checkout reference." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("bind_my_store_order", { p_order_reference: reference.data });
  if (error) return { error: "This order cannot be linked to your account. It may already belong to another account." };
  revalidatePath(`/checkout/${reference.data}`);
  return {};
}

export async function submitStorePayment(_: CheckoutActionState, form: FormData): Promise<CheckoutActionState> {
  const parsed = z.object({ reference: referenceSchema, method: z.enum(["manual_transfer", "manual_crypto", "manual_other"]), paymentReference: z.string().trim().max(300) }).safeParse({
    reference: form.get("order_reference"), method: form.get("payment_method"), paymentReference: form.get("payment_reference") ?? "",
  });
  if (!parsed.success) return { error: "Check the payment details and try again." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_my_store_payment", { p_order_reference: parsed.data.reference, p_payment_method: parsed.data.method, p_payment_reference: parsed.data.paymentReference || null });
  if (error) return { error: "Payment could not be submitted. Refresh to check the current order state." };
  revalidatePath(`/checkout/${parsed.data.reference}`);
  return { message: "Payment submitted. Awaiting independent verification." };
}

export async function startPayFastStorePayment(_: CheckoutActionState, form: FormData): Promise<CheckoutActionState> {
  const reference = referenceSchema.safeParse(form.get("order_reference"));
  if (!reference.success) return { error: "Invalid checkout reference." };
  try { getPayFastConfig(); } catch { return { error: "PayFast Sandbox payment is not currently available." }; }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("begin_public_payfast_store_payment", { p_order_reference: reference.data });
  const attempt = data?.[0];
  if (error || !attempt) return { error: error?.message.includes("currency") ? "PayFast Sandbox currently accepts ZAR orders only." : error?.message.includes("inventory") ? "This order's inventory reservation has expired. Return to the Store to start again." : "This order is not available for PayFast payment." };
  (await cookies()).set("payfast_claim_handoff", `${reference.data}:${attempt.attempt_id}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
  redirect(`/checkout/${encodeURIComponent(reference.data)}/payfast?attempt=${encodeURIComponent(attempt.attempt_id)}`);
}

export async function completePayFastClaimHandoff(_: CheckoutActionState, formData: FormData): Promise<CheckoutActionState> {
  const reference = referenceSchema.safeParse(formData.get("order_reference"));
  const handoff = (await cookies()).get("payfast_claim_handoff")?.value ?? "";
  const [handoffReference, handoffAttempt] = handoff.split(":");
  if (!reference.success || handoffReference !== reference.data || !z.uuid().safeParse(handoffAttempt).success) return { error: "This payment handoff is no longer available. Return to your order status." };
  const secret = createStoreClaimSecret();
  const service = createServiceClient();
  const { error } = await service.rpc("issue_payfast_store_claim", { p_order_reference: reference.data, p_attempt_id: handoffAttempt, p_token_hash: secret.tokenHash });
  if (error) return { error: error.message.includes("already_claimed") ? "This membership has already been claimed." : error.message.includes("membership") ? "This order is not eligible for membership claim." : "The membership handoff is not ready yet. Refresh after payment verification." };
  const cookieStore = await cookies();
  cookieStore.delete("payfast_claim_handoff");
  cookieStore.set("store_claim_token", secret.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
  redirect("/claim");
}

export async function completePayFastClaimHandoffForm(formData: FormData): Promise<void> {
  await completePayFastClaimHandoff({}, formData);
}
