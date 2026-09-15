"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { COLLECTIBLE_STATUSES, INNER_SANCTUM_MEDIA_BUCKET, INNER_SANCTUM_MEDIA_MAX_BYTES, INNER_SANCTUM_MEDIA_TYPES, safeMediaFilename } from "@/lib/inner-sanctum-collections";

const collectibleSchema = z.object({
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  status: z.enum(COLLECTIBLE_STATUSES),
  sortOrder: z.coerce.number().int().min(-10000).max(10000),
});

function readCollectible(formData: FormData) {
  return collectibleSchema.parse({ slug: formData.get("slug"), title: formData.get("title"), description: formData.get("description"), status: formData.get("status"), sortOrder: formData.get("sort_order") });
}

function readMedia(formData: FormData) {
  const media = formData.get("media");
  if (!(media instanceof File) || media.size === 0) return null;
  if (media.size > INNER_SANCTUM_MEDIA_MAX_BYTES) throw new Error("Media must be 20 MB or smaller.");
  if (!INNER_SANCTUM_MEDIA_TYPES.includes(media.type as (typeof INNER_SANCTUM_MEDIA_TYPES)[number])) throw new Error("Use a JPEG, PNG, WebP, or MP4 file.");
  return media;
}

async function uploadMedia(state: NonNullable<Awaited<ReturnType<typeof requireAdmin>>>, collectibleId: string, media: File) {
  const path = `${collectibleId}/${randomUUID()}-${safeMediaFilename(media.name)}`;
  const { error } = await state.supabase.storage.from(INNER_SANCTUM_MEDIA_BUCKET).upload(path, media, { contentType: media.type, upsert: false });
  if (error) throw new Error("The private media could not be uploaded.");
  return { media_path: path, media_type: media.type };
}

function refresh(id?: string) {
  revalidatePath("/admin/collections");
  revalidatePath("/inner-sanctum/collection");
  if (id) revalidatePath(`/admin/collections/${id}`);
}

export async function createCollectible(formData: FormData) {
  const state = await requireAdmin();
  if (!state) throw new Error("Not authorized");
  const value = readCollectible(formData);
  const { data, error } = await state.supabase.from("inner_sanctum_collectibles").insert({ slug: value.slug, title: value.title, description: value.description, status: value.status, sort_order: value.sortOrder, media_path: null, media_type: null }).select("id").single();
  if (error || !data) throw new Error("The collectible could not be created.");
  const media = readMedia(formData);
  if (media) {
    const uploaded = await uploadMedia(state, data.id, media);
    const { error: updateError } = await state.supabase.from("inner_sanctum_collectibles").update(uploaded).eq("id", data.id);
    if (updateError) throw new Error("The collectible was created, but its media could not be attached.");
  }
  refresh(data.id);
  redirect(`/admin/collections/${data.id}`);
}

export async function updateCollectible(collectibleId: string, formData: FormData) {
  const id = z.uuid().parse(collectibleId);
  const state = await requireAdmin();
  if (!state) throw new Error("Not authorized");
  const value = readCollectible(formData);
  const media = readMedia(formData);
  const uploaded = media ? await uploadMedia(state, id, media) : {};
  const { error } = await state.supabase.from("inner_sanctum_collectibles").update({ slug: value.slug, title: value.title, description: value.description, status: value.status, sort_order: value.sortOrder, ...uploaded }).eq("id", id);
  if (error) throw new Error("The collectible could not be updated.");
  refresh(id);
}

export async function grantCollectible(collectibleId: string, formData: FormData) {
  const id = z.uuid().parse(collectibleId);
  const userId = z.uuid().parse(formData.get("user_id"));
  const state = await requireAdmin();
  if (!state) throw new Error("Not authorized");
  const { error } = await state.supabase.rpc("admin_grant_inner_sanctum_collectible", { p_user_id: userId, p_collectible_id: id });
  if (error) {
    console.error("Admin collectible grant failed", { code: error.code, message: error.message, details: error.details, hint: error.hint, collectibleId: id, userId });
    if (error.message === "active_collectible_required") throw new Error("Activate this collectible before granting it.");
    throw new Error("The collectible could not be granted.");
  }
  refresh(id);
}
