"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { teaserReadiness } from "@/lib/teaser-publication";
import type { TeaserActionState } from "@/lib/teasers";

export async function changeTeaserPublication(id: string, _: TeaserActionState, form: FormData): Promise<TeaserActionState> {
  const state = await requireAdmin(); if (!state) return { error: "Admin access required." };
  const status = form.get("status");
  if (!z.uuid().safeParse(id).success || (status !== "draft" && status !== "published")) return { error: "Invalid publication request." };
  const { data: teaser, error } = await state.supabase.from("teasers").select("*").eq("id", id).single();
  if (error || !teaser) return { error: "Teaser could not be loaded." };
  if (status === "published") {
    const result = teaser.store_product_id ? await state.supabase.from("store_products").select("id,status").eq("id", teaser.store_product_id).maybeSingle() : { data: null, error: null };
    if (result.error) return { error: "Store destination could not be checked." };
    const readiness = teaserReadiness(teaser, result.data);
    if (!readiness.ready) return { error: `Not ready to publish: ${readiness.checks.filter(check => !check.ok).map(check => check.label).join(", ")}. Save any edits before publishing.` };
  }
  // Reject concurrent saved edits rather than publishing a record we did not validate.
  // Cell 1's trigger alone manages first published_at; slug/content are never written here.
  const result = await state.supabase.from("teasers").update({ status }).eq("id", id).eq("updated_at", teaser.updated_at).select("id").maybeSingle();
  if (result.error || !result.data) return { error: "Publication state could not be saved. Reload the editor and try again." };
  revalidatePath("/admin/teasers"); revalidatePath(`/admin/teasers/${id}`); revalidatePath(`/admin/teasers/${id}/preview`);
  return { message: status === "published" ? "Teaser published. Its canonical Promo URL is shown below; the public renderer is not available yet." : "Returned to draft. The teaser is no longer eligible for public lookup." };
}
