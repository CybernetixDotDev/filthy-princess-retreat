"use server";
import { revalidatePath } from "next/cache";
import { requireContributorAuth } from "@/lib/contributor-auth";
import { contributionSchema } from "@/lib/contributions";
export type ContributionActionState = { error?: string; submitted?: boolean };
export async function submitContribution(_: ContributionActionState, form: FormData): Promise<ContributionActionState> {
 const { supabase } = await requireContributorAuth("/contributor/submit");
 const parsed = contributionSchema.safeParse(Object.fromEntries(["category", "title", "description", "work_url", "additional_notes"].map(key => [key, form.get(key) ?? ""])));
 if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check your submission." };
 const v = parsed.data;
 const { error } = await supabase.rpc("submit_contribution", { p_category: v.category, p_title: v.title, p_description: v.description, p_work_url: v.work_url, p_additional_notes: v.additional_notes });
 if (error) return { error: "Your contribution could not be sent. Please try again." };
 revalidatePath("/contributor"); revalidatePath("/contribute"); revalidatePath("/admin/contributions");
 return { submitted: true };
}
