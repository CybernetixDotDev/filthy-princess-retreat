"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { INNER_SANCTUM_POST_STATUSES, INNER_SANCTUM_POST_TYPES, isSafeSanctumCta } from "@/lib/inner-sanctum-posts";

const optionalText = (maximum: number) => z.string().trim().max(maximum).transform((value) => value || null);
const optionalDate = z.string().trim().transform((value, context) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    context.addIssue({ code: "custom", message: "Use a valid date and time." });
    return z.NEVER;
  }
  return date.toISOString();
});

const postSchema = z.object({
  type: z.enum(INNER_SANCTUM_POST_TYPES),
  eyebrow: optionalText(100),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(12000),
  imagePath: optionalText(500).refine((value) => !value || /^\/assets\/[A-Za-z0-9._/-]+\.(png|jpg|jpeg|webp)$/.test(value), "Use a valid /assets image path."),
  ctaLabel: optionalText(100),
  ctaHref: optionalText(500).refine((value) => !value || isSafeSanctumCta(value), "CTA must be a safe internal path."),
  status: z.enum(INNER_SANCTUM_POST_STATUSES),
  publishedAt: optionalDate,
  expiresAt: optionalDate,
  sortOrder: z.coerce.number().int().min(-10000).max(10000),
}).superRefine((value, context) => {
  if (Boolean(value.ctaLabel) !== Boolean(value.ctaHref)) context.addIssue({ code: "custom", path: ["ctaHref"], message: "CTA label and path must be supplied together." });
  if (value.expiresAt && value.publishedAt && value.expiresAt <= value.publishedAt) context.addIssue({ code: "custom", path: ["expiresAt"], message: "Expiry must be after publication." });
});

function readPost(formData: FormData) {
  return postSchema.parse({
    type: formData.get("type"), eyebrow: formData.get("eyebrow"), title: formData.get("title"), body: formData.get("body"),
    imagePath: formData.get("image_path"), ctaLabel: formData.get("cta_label"), ctaHref: formData.get("cta_href"), status: formData.get("status"),
    publishedAt: formData.get("published_at"), expiresAt: formData.get("expires_at"), sortOrder: formData.get("sort_order"),
  });
}

function databaseValues(post: z.infer<typeof postSchema>) {
  return { type: post.type, eyebrow: post.eyebrow, title: post.title, body: post.body, image_path: post.imagePath, cta_label: post.ctaLabel, cta_href: post.ctaHref, status: post.status, published_at: post.publishedAt, expires_at: post.expiresAt, sort_order: post.sortOrder };
}

function refreshSanctum(postId?: string) {
  revalidatePath("/inner-sanctum");
  revalidatePath("/admin/inner-sanctum");
  if (postId) revalidatePath(`/admin/inner-sanctum/${postId}`);
}

export async function createInnerSanctumPost(formData: FormData) {
  const state = await requireAdmin();
  if (!state?.user) throw new Error("Not authorized");
  const { data, error } = await state.supabase.from("inner_sanctum_posts").insert({ ...databaseValues(readPost(formData)), created_by: state.user.id }).select("id").single();
  if (error || !data) throw new Error("The Inner Sanctum post could not be created.");
  refreshSanctum(data.id);
  redirect(`/admin/inner-sanctum/${data.id}`);
}

export async function updateInnerSanctumPost(postId: string, formData: FormData) {
  const id = z.uuid().parse(postId);
  const state = await requireAdmin();
  if (!state) throw new Error("Not authorized");
  const { error } = await state.supabase.from("inner_sanctum_posts").update(databaseValues(readPost(formData))).eq("id", id);
  if (error) throw new Error("The Inner Sanctum post could not be updated.");
  refreshSanctum(id);
}

export async function archiveInnerSanctumPost(formData: FormData) {
  const id = z.uuid().parse(formData.get("post_id"));
  const state = await requireAdmin();
  if (!state) throw new Error("Not authorized");
  const { error } = await state.supabase.from("inner_sanctum_posts").update({ status: "archived" }).eq("id", id);
  if (error) throw new Error("The Inner Sanctum post could not be archived.");
  refreshSanctum(id);
}
