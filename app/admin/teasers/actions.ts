"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { parseTeaserForm, type TeaserActionState } from "@/lib/teasers";
import { uploadTeaserImage, removeTeaserImage } from "@/lib/teaser-media-server";

export async function saveTeaser(id: string | null, _: TeaserActionState, form: FormData): Promise<TeaserActionState> {
  const state = await requireAdmin(); if (!state) return { error: "Admin access required." };
  if (id !== null && !z.uuid().safeParse(id).success) return { error: "Invalid teaser ID." };
  const parsed = parseTeaserForm(form);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the teaser fields." };
  const v = parsed.data;
  let currentProduct: string | null = null;
  if (id) {
    const { data, error } = await state.supabase.from("teasers").select("store_product_id").eq("id", id).single();
    if (error || !data) return { error: "Teaser could not be loaded." };
    currentProduct = data.store_product_id;
  }
  if (v.store_product_id && v.store_product_id !== currentProduct) {
    const { data, error } = await state.supabase.from("store_products").select("id").eq("id", v.store_product_id).eq("status", "active").maybeSingle();
    if (error || !data) return { error: "Select an active Store product or leave the destination empty." };
  }
  if (!id) {
    const { visibility, ...content } = v;
    const { data, error } = await state.supabase.from("teasers").insert(content).select("id").single();
    if (error || !data) return { error: "Teaser could not be created. Please try again." };
    let visibilityFailed = false;
    if (visibility === "public") {
      const result = await state.supabase.from("teasers").update({ visibility }).eq("id", data.id).select("id").maybeSingle();
      visibilityFailed = Boolean(result.error || !result.data);
    }
    revalidatePath("/admin/teasers");
    redirect(`/admin/teasers/${data.id}${visibilityFailed ? "?visibilityPending=1" : ""}`);
  }
  // Explicit content schema excludes lifecycle, audit fields, slug and image references.
  const { data, error } = await state.supabase.from("teasers").update(v).eq("id", id).select("id").maybeSingle();
  if (error || !data) return { error: "Teaser could not be saved. Please try again." };
  revalidatePath("/admin/teasers"); revalidatePath(`/admin/teasers/${id}`); revalidatePath(`/admin/teasers/${id}/preview`);
  return { message: "Teaser saved." };
}

export async function manageTeaserImage(id: string, slot: number, _: TeaserActionState, form: FormData): Promise<TeaserActionState> {
  const state = await requireAdmin(); if (!state) return { error: "Admin access required." };
  if (!z.uuid().safeParse(id).success || ![1, 2, 3].includes(slot)) return { error: "Invalid teaser image slot." };
  const intent = form.get("intent");
  if (intent !== "upload" && intent !== "remove") return { error: "Choose Upload or Remove." };
  const file = form.get("image");
  if (intent === "upload" && (!(file instanceof File) || !file.size)) return { error: "Choose a JPEG, PNG or WebP image." };
  const result = intent === "remove" ? await removeTeaserImage(id, slot) : await uploadTeaserImage(id, slot, file as File);
  revalidatePath("/admin/teasers"); revalidatePath(`/admin/teasers/${id}`); revalidatePath(`/admin/teasers/${id}/preview`);
  if (!result.ok) return { error: result.error, warning: result.cleanupWarning };
  return { message: intent === "remove" ? "Image removed." : "Image saved.", warning: result.cleanupWarning };
}
