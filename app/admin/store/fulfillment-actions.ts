"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

export async function markStoreOrderFulfilled(formData: FormData) {
  const orderId = z.uuid().parse(formData.get("order_id"));
  const state = await requireAdmin();
  if (!state) throw new Error("Administrator access is required.");
  const { error } = await state.supabase.rpc("admin_mark_store_fulfilled", { p_order_id: orderId });
  if (error) throw new Error(error.message.includes("auto_fulfilled") ? "This order is fulfilled automatically." : "The order could not be marked fulfilled.");
  revalidatePath(`/admin/store/orders/${orderId}`);
  revalidatePath("/admin/store/orders");
}
