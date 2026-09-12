"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type StoreOrderActionState = { error?: string };
const orderSchema = z.object({ productId: z.uuid(), buyerEmail: z.email().trim().max(320), requestKey: z.uuid() });

export async function createStoreOrder(_: StoreOrderActionState, formData: FormData): Promise<StoreOrderActionState> {
  const parsed = orderSchema.safeParse({ productId: formData.get("product_id"), buyerEmail: formData.get("buyer_email"), requestKey: formData.get("request_key") });
  if (!parsed.success) return { error: "Enter a valid email address to continue." };
  const supabase = await createClient();
  const referralCode = (await cookies()).get("inner_sanctum_referral")?.value ?? null;
  const { data, error } = await supabase.rpc("create_public_store_order", { p_product_id: parsed.data.productId, p_buyer_email: parsed.data.buyerEmail, p_request_key: parsed.data.requestKey, p_referral_code: referralCode });
  const order = data?.[0];
  if (error || !order) return { error: "That order could not be prepared. Please try again." };
  redirect(`/store/order/${encodeURIComponent(order.order_reference)}`);
}
