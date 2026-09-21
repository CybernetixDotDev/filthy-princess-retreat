"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

export type CheckoutActionState = { error?: string; message?: string };
const referenceSchema = z.string().regex(/^FP-[A-F0-9]{8}-[A-F0-9]{8}-[A-F0-9]{8}$/);

export async function createAuthenticatedStoreOrder(_: CheckoutActionState, form: FormData): Promise<CheckoutActionState> {
  const parsed = z.object({ product: z.uuid(), request: z.uuid() }).safeParse({
    product: form.get("product"), request: form.get("request"),
  });
  if (!parsed.success) return { error: "Invalid checkout request. Return to the Store and try again." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/checkout/start?product=${parsed.data.product}`)}`);
  if (!user.email) return { error: "Your account needs an email address to continue." };

  // Scope the form's retry token to this authenticated account and product.
  // The public RPC's request-key lookup is global, so never forward a raw client key.
  const digest = createHash("sha256").update(JSON.stringify([
    "authenticated-store-entry", user.id, parsed.data.product.toLowerCase(), parsed.data.request.toLowerCase(),
  ])).digest("hex");
  const requestKey = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  const referralCode = (await cookies()).get("inner_sanctum_referral")?.value ?? null;
  const { data, error } = await supabase.rpc("create_public_store_order", {
    p_product_id: parsed.data.product, p_buyer_email: user.email,
    p_request_key: requestKey, p_referral_code: referralCode,
  });
  const order = data?.[0];
  if (error || !order) return { error: "That order could not be prepared. Please try again." };
  redirect(`/checkout/${encodeURIComponent(order.order_reference)}`);
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
