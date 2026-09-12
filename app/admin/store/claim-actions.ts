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

export async function authorizeStoreFulfillment(_: AdminClaimActionState, formData: FormData): Promise<AdminClaimActionState> {
  const parsed = orderSchema.safeParse({ orderId: formData.get("order_id") });
  if (!parsed.success) return { error: "Invalid order." };
  const state = await requireAdmin();
  if (!state) return { error: "Administrator access is required." };
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
  const { error } = await state.supabase.rpc("admin_revoke_store_claim", { p_order_id: parsed.data.orderId });
  if (error) return { error: actionError(error.message) };
  revalidatePath(`/admin/store/orders/${parsed.data.orderId}`);
  return { message: "The available key has been revoked." };
}
