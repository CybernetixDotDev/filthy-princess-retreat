"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createStoreClaimSecret, storeClaimUrl } from "@/lib/store-claims";

export type AdminClaimActionState = { error?: string; message?: string; claimUrl?: string };
const orderSchema = z.object({ orderId: z.uuid() });

function actionError(message?: string) {
  if (message?.includes("already_available")) return "An available key already exists. Reissue it if the original link was lost.";
  if (message?.includes("already_claimed")) return "This order has already been claimed.";
  if (message?.includes("ineligible") || message?.includes("unsupported")) return "This order is not eligible for membership fulfillment.";
  return "The claim operation could not be completed.";
}

async function requirePaidMembershipOrder(state: Awaited<ReturnType<typeof requireAdmin>>, orderId: string) {
  if (!state) return "Administrator access is required.";
  const [{ data: order }, { data: items }] = await Promise.all([
    state.supabase.from("store_orders").select("status, payment_status, payment_method, currency, total_amount").eq("id", orderId).maybeSingle(),
    state.supabase.from("store_order_items").select("product_id, fulfillment_type, fulfillment_reference, quantity, product_type, currency, unit_price_amount, line_total_amount").eq("order_id", orderId),
  ]);
  const standardEligible = order?.status === "paid"
    && order.payment_status === "verified"
    && items?.length === 1
    && items[0].quantity === 1
    && items[0].fulfillment_type === "inner_sanctum_membership"
    && items[0].fulfillment_reference === "lifetime";
  const legacyEligible = orderId === "2a5564f3-502c-48db-bb45-a8a9a1de475e"
    && order?.status === "paid" && order.payment_status === "verified" && order.payment_method === "payfast"
    && order.currency === "ZAR" && Number(order.total_amount) === 5000
    && items?.length === 1 && items[0].product_id === "77e5cde7-9535-4bc2-b53c-f54212d578b3"
    && items[0].product_type === "membership" && items[0].quantity === 1 && items[0].currency === "ZAR"
    && Number(items[0].unit_price_amount) === 5000 && Number(items[0].line_total_amount) === 5000
    && items[0].fulfillment_type === "inner_sanctum_membership" && items[0].fulfillment_reference === null;
  return standardEligible || legacyEligible ? null : "Only paid, verified lifetime membership orders can issue a claim.";
}

export async function authorizeStoreFulfillment(_: AdminClaimActionState, formData: FormData): Promise<AdminClaimActionState> {
  const parsed = orderSchema.safeParse({ orderId: formData.get("order_id") });
  if (!parsed.success) return { error: "Invalid order." };
  const state = await requireAdmin();
  if (!state) return { error: "Administrator access is required." };
  const eligibilityError = await requirePaidMembershipOrder(state, parsed.data.orderId);
  if (eligibilityError) return { error: eligibilityError };
  const secret = createStoreClaimSecret();
  const { error } = await state.supabase.rpc("admin_authorize_store_fulfillment", {
    p_order_id: parsed.data.orderId,
    p_token_hash: secret.tokenHash,
    p_source_reference: `admin:${state.user.id}`,
  });
  if (error) return { error: actionError(error.message) };
  revalidatePath(`/admin/store/orders/${parsed.data.orderId}`);
  return { message: "Copy this link now. It cannot be retrieved again.", claimUrl: storeClaimUrl(secret.token) };
}

export async function reissueStoreClaim(_: AdminClaimActionState, formData: FormData): Promise<AdminClaimActionState> {
  const parsed = orderSchema.safeParse({ orderId: formData.get("order_id") });
  if (!parsed.success) return { error: "Invalid order." };
  const state = await requireAdmin();
  if (!state) return { error: "Administrator access is required." };
  const eligibilityError = await requirePaidMembershipOrder(state, parsed.data.orderId);
  if (eligibilityError) return { error: eligibilityError };
  const secret = createStoreClaimSecret();
  const { error } = await state.supabase.rpc("admin_reissue_store_claim", { p_order_id: parsed.data.orderId, p_token_hash: secret.tokenHash });
  if (error) return { error: actionError(error.message) };
  revalidatePath(`/admin/store/orders/${parsed.data.orderId}`);
  return { message: "Copy this link now. It cannot be retrieved again. The previous key is no longer usable.", claimUrl: storeClaimUrl(secret.token) };
}

export async function revokeStoreClaim(_: AdminClaimActionState, formData: FormData): Promise<AdminClaimActionState> {
  const parsed = orderSchema.safeParse({ orderId: formData.get("order_id") });
  if (!parsed.success) return { error: "Invalid order." };
  const state = await requireAdmin();
  if (!state) return { error: "Administrator access is required." };
  const eligibilityError = await requirePaidMembershipOrder(state, parsed.data.orderId);
  if (eligibilityError) return { error: eligibilityError };
  const { error } = await state.supabase.rpc("admin_revoke_store_claim", { p_order_id: parsed.data.orderId });
  if (error) return { error: actionError(error.message) };
  revalidatePath(`/admin/store/orders/${parsed.data.orderId}`);
  return { message: "The available key has been revoked." };
}
