"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { STORE_CLAIM_TOKEN_PATTERN } from "@/lib/store-claims";

export type StoreClaimActionState = {
  state?: "success" | "already_member" | "invalid" | "revoked" | "claimed";
  error?: string;
};

const claimSchema = z.object({ token: z.string().regex(STORE_CLAIM_TOKEN_PATTERN) });

export async function redeemStoreClaim(
  _: StoreClaimActionState,
  formData: FormData,
): Promise<StoreClaimActionState> {
  const parsed = claimSchema.safeParse({ token: formData.get("token") });
  if (!parsed.success) return { state: "invalid" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("redeem_store_claim", { p_token: parsed.data.token });
  const result = data?.[0];
  if (error || !result) return { error: "This key could not be claimed. Please try again." };

  const allowed = new Set(["success", "already_member", "invalid", "revoked", "claimed"]);
  if (!allowed.has(result.redemption_state)) return { error: "This key could not be claimed." };
  if (result.redemption_state === "success") revalidatePath("/inner-sanctum");
  return { state: result.redemption_state as StoreClaimActionState["state"] };
}
