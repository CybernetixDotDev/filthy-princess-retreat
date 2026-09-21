"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
export type ReviewState = { error?: string; message?: string };
export async function reviewContribution(_: ReviewState, form: FormData): Promise<ReviewState> {
 const state = await requireAdmin(); if (!state) return { error: "Not authorized." };
 const parsed = z.object({ id: z.uuid(), decision: z.enum(["reviewing", "accepted", "declined"]), note: z.string().trim().max(3000) }).safeParse({ id: form.get("id"), decision: form.get("decision"), note: form.get("admin_note") ?? "" });
 if (!parsed.success) return { error: "Check the review details." };
 const { id, decision, note } = parsed.data;
 let result;
 if (decision === "accepted") {
  const award = z.coerce.number().int().positive().max(2147483647).safeParse(form.get("filth_award"));
  if (!award.success) return { error: "Choose a positive whole-number Filth award." };
  result = await state.supabase.rpc("admin_accept_contribution", { p_contribution_id: id, p_filth_award: award.data, p_paid_opportunity: form.get("paid_opportunity") === "on", p_admin_note: note || null });
 } else if (decision === "declined") result = await state.supabase.rpc("admin_decline_contribution", { p_contribution_id: id, p_admin_note: note || null });
 else result = await state.supabase.rpc("admin_mark_contribution_reviewing", { p_contribution_id: id });
 if (result.error) return { error: "The review could not be saved. Refresh to check whether another review has already completed." };
 revalidatePath("/admin/contributions"); revalidatePath(`/admin/contributions/${id}`); revalidatePath("/contributor");
 return { message: decision === "accepted" ? "Accepted. Filth awarded." : decision === "declined" ? "Contribution declined." : "Marked as reviewing." };
}
