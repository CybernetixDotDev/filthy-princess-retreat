"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { INNER_SANCTUM_TASK_STATUSES } from "@/lib/inner-sanctum-tasks";

const optionalText = (max: number) => z.string().trim().max(max).transform((value) => value || null);
const optionalDate = z.string().trim().transform((value, context) => { if (!value) return null; const date = new Date(value); if (Number.isNaN(date.getTime())) { context.addIssue({ code: "custom", message: "Use a valid date and time." }); return z.NEVER; } return date.toISOString(); });
const schema = z.object({ slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), eyebrow: optionalText(100), title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(12000), prompt: z.string().trim().min(1).max(2000), status: z.enum(INNER_SANCTUM_TASK_STATUSES), availableFrom: optionalDate, closesAt: optionalDate, sortOrder: z.coerce.number().int().min(-10000).max(10000) }).superRefine((value, context) => { if (value.availableFrom && value.closesAt && value.closesAt <= value.availableFrom) context.addIssue({ code: "custom", path: ["closes_at"], message: "Closing time must follow availability." }); });
function read(formData: FormData) { return schema.parse({ slug: formData.get("slug"), eyebrow: formData.get("eyebrow"), title: formData.get("title"), body: formData.get("body"), prompt: formData.get("prompt"), status: formData.get("status"), availableFrom: formData.get("available_from"), closesAt: formData.get("closes_at"), sortOrder: formData.get("sort_order") }); }
function values(value: z.infer<typeof schema>) { return { slug: value.slug, eyebrow: value.eyebrow, title: value.title, body: value.body, prompt: value.prompt, status: value.status, available_from: value.availableFrom, closes_at: value.closesAt, sort_order: value.sortOrder }; }
function refresh(id?: string) { revalidatePath("/admin/tasks"); revalidatePath("/inner-sanctum"); revalidatePath("/inner-sanctum/tasks"); if (id) revalidatePath(`/admin/tasks/${id}`); }

export async function createTask(formData: FormData) {
  const state = await requireAdmin(); if (!state?.user) throw new Error("Not authorized");
  const { data, error } = await state.supabase.from("inner_sanctum_tasks").insert({ ...values(read(formData)), created_by: state.user.id }).select("id").single();
  if (error || !data) throw new Error("The task could not be created."); refresh(data.id); redirect(`/admin/tasks/${data.id}`);
}
export async function updateTask(taskId: string, formData: FormData) {
  const id = z.uuid().parse(taskId); const state = await requireAdmin(); if (!state) throw new Error("Not authorized");
  const { error } = await state.supabase.from("inner_sanctum_tasks").update(values(read(formData))).eq("id", id);
  if (error) throw new Error("The task could not be updated."); refresh(id);
}
export async function acknowledgeTaskResponse(taskId: string, formData: FormData) {
  const responseId = z.uuid().parse(formData.get("response_id")); const state = await requireAdmin(); if (!state) throw new Error("Not authorized");
  const { error } = await state.supabase.rpc("admin_acknowledge_inner_sanctum_task_response", { p_response_id: responseId });
  if (error) throw new Error("The response could not be acknowledged."); refresh(taskId);
}
