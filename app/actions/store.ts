"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { toStoreOrderRpcItems } from "@/lib/store-cart";

export type StoreOrderActionState = { error?: string };
const orderSchema = z.object({ productId: z.uuid(), buyerEmail: z.email().trim().max(320), requestKey: z.uuid() });
const cartOrderSchema = z.object({
  items: z.string().max(10000),
  buyerEmail: z.email().trim().max(320),
  requestKey: z.uuid(),
});

const cartItemsSchema = z.array(z.object({ productId: z.uuid(), quantity: z.number().int().min(1).max(100) })).min(1).max(50);

export async function createStoreOrder(_: StoreOrderActionState, formData: FormData): Promise<StoreOrderActionState> {
  const parsed = orderSchema.safeParse({ productId: formData.get("product_id"), buyerEmail: formData.get("buyer_email"), requestKey: formData.get("request_key") });
  if (!parsed.success) return { error: "Enter a valid email address to continue." };
  const supabase = await createClient();
  const referralCode = (await cookies()).get("inner_sanctum_referral")?.value ?? null;
  const { data, error } = await supabase.rpc("create_public_store_order", { p_product_id: parsed.data.productId, p_buyer_email: parsed.data.buyerEmail, p_request_key: parsed.data.requestKey, p_referral_code: referralCode });
  const order = data?.[0];
  if (error || !order) return { error: "That order could not be prepared. Please try again." };
  redirect(`/checkout/${encodeURIComponent(order.order_reference)}`);
}

export async function createStoreCartOrder(_: StoreOrderActionState, formData: FormData): Promise<StoreOrderActionState> {
  const parsed = cartOrderSchema.safeParse({
    items: formData.get("items"),
    buyerEmail: formData.get("buyer_email"),
    requestKey: formData.get("request_key"),
  });
  if (!parsed.success) return { error: "Review your cart and enter a valid email address." };
  let items: z.infer<typeof cartItemsSchema>;
  try {
    items = cartItemsSchema.parse(JSON.parse(parsed.data.items));
  } catch {
    return { error: "Your cart could not be checked out. Please refresh and try again." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const buyerEmail = user?.email ?? parsed.data.buyerEmail;
  const requestKey = user
    ? (() => {
      const digest = createHash("sha256").update(JSON.stringify(["store-cart", user.id, parsed.data.requestKey])).digest("hex");
      return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    })()
    : parsed.data.requestKey;
  const referralCode = (await cookies()).get("inner_sanctum_referral")?.value ?? null;
  const { data, error } = await supabase.rpc("create_public_store_order_multi", {
    p_items: toStoreOrderRpcItems(items),
    p_buyer_email: buyerEmail,
    p_request_key: requestKey,
    p_referral_code: referralCode,
    p_acquisition_method: "money",
  });
  const order = data?.[0];
  if (error || !order) return { error: error?.message.includes("store_inventory") ? "Some items are no longer available in that quantity." : "That order could not be prepared. Please refresh and try again." };
  redirect(`/checkout/${encodeURIComponent(order.order_reference)}`);
}
