"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { BENEFIT_STATUSES, BENEFIT_TYPES, isSafeBenefitCta } from "@/lib/inner-sanctum-benefits";
import { INNER_SANCTUM_MEDIA_BUCKET, INNER_SANCTUM_MEDIA_MAX_BYTES, INNER_SANCTUM_MEDIA_TYPES, safeMediaFilename } from "@/lib/inner-sanctum-collections";

const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || null);
const optionalDate = z.string().trim().transform((value, context) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) { context.addIssue({ code: "custom", message: "Use a valid date and time." }); return z.NEVER; }
  return date.toISOString();
});
const schema = z.object({
  userId: z.uuid(), type: z.enum(BENEFIT_TYPES), eyebrow: optionalText(100), title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(12000),
  ctaLabel: optionalText(100), ctaHref: optionalText(500).refine((value) => !value || isSafeBenefitCta(value), "CTA must be a safe internal path."),
  status: z.enum(BENEFIT_STATUSES), availableFrom: optionalDate, expiresAt: optionalDate,
}).superRefine((value, context) => {
  if (Boolean(value.ctaLabel) !== Boolean(value.ctaHref)) context.addIssue({ code: "custom", path: ["cta_href"], message: "CTA label and path must be supplied together." });
  if (value.availableFrom && value.expiresAt && value.expiresAt <= value.availableFrom) context.addIssue({ code: "custom", path: ["expires_at"], message: "Expiry must be after availability." });
});

function read(formData: FormData) {
  return schema.parse({ userId: formData.get("user_id"), type: formData.get("type"), eyebrow: formData.get("eyebrow"), title: formData.get("title"), body: formData.get("body"), ctaLabel: formData.get("cta_label"), ctaHref: formData.get("cta_href"), status: formData.get("status"), availableFrom: formData.get("available_from"), expiresAt: formData.get("expires_at") });
}
function media(formData: FormData) {
  const file = formData.get("media");
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > INNER_SANCTUM_MEDIA_MAX_BYTES) throw new Error("Media must be 20 MB or smaller.");
  if (!INNER_SANCTUM_MEDIA_TYPES.includes(file.type as (typeof INNER_SANCTUM_MEDIA_TYPES)[number])) throw new Error("Use a JPEG, PNG, WebP, or MP4 file.");
  return file;
}
async function upload(state: NonNullable<Awaited<ReturnType<typeof requireAdmin>>>, id: string, file: File) {
  const path = `${id}/${randomUUID()}-${safeMediaFilename(file.name)}`;
  const { error } = await state.supabase.storage.from(INNER_SANCTUM_MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error("The private media could not be uploaded.");
  return { media_path: path, media_type: file.type };
}
function values(value: z.infer<typeof schema>) {
  return { user_id: value.userId, type: value.type, eyebrow: value.eyebrow, title: value.title, body: value.body, cta_label: value.ctaLabel, cta_href: value.ctaHref, status: value.status, available_from: value.availableFrom, expires_at: value.expiresAt };
}
function refresh(id?: string) { revalidatePath("/admin/benefits"); revalidatePath("/inner-sanctum"); revalidatePath("/inner-sanctum/benefits"); if (id) revalidatePath(`/admin/benefits/${id}`); }

export async function createBenefit(formData: FormData) {
  const state = await requireAdmin(); if (!state?.user) throw new Error("Not authorized");
  const value = read(formData);
  const { data, error } = await state.supabase.from("inner_sanctum_benefits").insert({ ...values(value), created_by: state.user.id, media_path: null, media_type: null }).select("id").single();
  if (error || !data) throw new Error("The benefit could not be created.");
  const file = media(formData);
  if (file) { const attached = await upload(state, data.id, file); const { error: attachError } = await state.supabase.from("inner_sanctum_benefits").update(attached).eq("id", data.id); if (attachError) throw new Error("The benefit was created, but its media could not be attached."); }
  refresh(data.id); redirect(`/admin/benefits/${data.id}`);
}

export async function updateBenefit(benefitId: string, formData: FormData) {
  const id = z.uuid().parse(benefitId); const state = await requireAdmin(); if (!state) throw new Error("Not authorized");
  const value = read(formData); const file = media(formData); const attached = file ? await upload(state, id, file) : {};
  const { error } = await state.supabase.from("inner_sanctum_benefits").update({ ...values(value), ...attached }).eq("id", id);
  if (error) throw new Error("The benefit could not be updated."); refresh(id);
}
