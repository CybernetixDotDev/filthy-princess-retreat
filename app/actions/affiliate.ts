"use server";
import { PUBLISHED_AFFILIATE_TERMS_VERSION } from "@/lib/affiliate-terms";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireContributorAuth } from "@/lib/contributor-auth";
export type AffiliateActionState = { error?: string; message?: string };
export async function acceptAffiliateTerms(_: AffiliateActionState, form: FormData): Promise<AffiliateActionState> {
 const { supabase } = await requireContributorAuth("/contributor");
 const version = z.string().trim().min(1).max(100).safeParse(form.get("terms_version"));
 if (!version.success || form.get("accept_terms") !== "on") return { error: "Read and explicitly accept the current Affiliate Terms to continue." };
 if (version.data !== PUBLISHED_AFFILIATE_TERMS_VERSION) return { error: "The current Affiliate Terms are not published yet. Please refresh to check their availability." };
 const { error } = await supabase.rpc("accept_current_affiliate_terms", { p_terms_version: version.data, p_accept_terms: true });
 if (error) return { error: "Activation could not be completed. Refresh to check the current Terms and account status." };
 revalidatePath("/contributor"); revalidatePath("/contribute"); return { message: "Affiliate Terms accepted." };
}
