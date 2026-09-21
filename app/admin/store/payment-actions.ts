"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

export async function reviewStorePayment(_: { error?: string; message?: string }, form: FormData): Promise<{ error?: string; message?: string }> {
  const parsed = z.object({ id: z.uuid(), decision: z.enum(["verify", "reject"]), note: z.string().trim().max(2000) }).safeParse({ id: form.get("order_id"), decision: form.get("decision"), note: form.get("note") ?? "" });
  if (!parsed.success) return { error: "Check the review details." };
  const state = await requireAdmin();
  if (!state) return { error: "Administrator access is required." };
  const { data, error } = await state.supabase.rpc(parsed.data.decision === "verify" ? "admin_verify_store_payment" : "admin_reject_store_payment", { p_order_id: parsed.data.id, p_note: parsed.data.note || null });
  if (error) return { error: error.message.includes("self_referral") ? "Self-referral is not eligible. Verification was not recorded; investigate this order." : "Review could not be completed. Refresh and check the order before retrying." };
  revalidatePath(`/admin/store/orders/${parsed.data.id}`);
  revalidatePath("/admin/store/orders");
  if (data) revalidatePath(`/checkout/${data.order_reference}`);
  return { message: parsed.data.decision === "verify" ? "Payment verified and applicable fulfilment completed." : "Payment rejected." };
}
