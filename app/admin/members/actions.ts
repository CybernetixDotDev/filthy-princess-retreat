"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";

const transitionSchema = z.object({
  userId: z.uuid(),
  action: z.enum(["grant", "suspend", "restore", "cancel"]),
});

export async function transitionInnerSanctumMembership(formData: FormData) {
  const parsed = transitionSchema.parse({
    userId: formData.get("user_id"),
    action: formData.get("membership_action"),
  });
  const state = await requireAdmin();
  if (!state) throw new Error("Not authorized");

  const { error } = await state.supabase.rpc("admin_transition_inner_sanctum_membership", {
    p_user_id: parsed.userId,
    p_action: parsed.action,
    p_source: "admin",
    p_source_reference: null,
  });
  if (error) throw new Error("The Inner Sanctum membership could not be updated.");

  revalidatePath("/admin/members");
  revalidatePath("/inner-sanctum");
}
