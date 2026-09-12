"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { INNER_SANCTUM_TASK_RESPONSE_MAX } from "@/lib/inner-sanctum-tasks";
import { createClient } from "@/lib/supabase/server";

export async function submitTaskResponse(taskId: string, slug: string, formData: FormData) {
  const id = z.uuid().parse(taskId);
  const response = z.string().trim().min(1).max(INNER_SANCTUM_TASK_RESPONSE_MAX).parse(formData.get("response_text"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_inner_sanctum_task_response", { p_task_id: id, p_response_text: response });
  if (error) throw new Error("Your response could not be sent.");
  revalidatePath("/inner-sanctum");
  revalidatePath("/inner-sanctum/tasks");
  revalidatePath(`/inner-sanctum/tasks/${slug}`);
}
