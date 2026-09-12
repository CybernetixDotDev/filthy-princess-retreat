import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getMyInnerSanctumTasks() {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_inner_sanctum_tasks");
  if (error) throw new Error("The tasks could not be opened.");
  return data ?? [];
}

export async function getMyInnerSanctumTask(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_inner_sanctum_task", { p_slug: slug });
  if (error) throw new Error("The task could not be opened.");
  return data?.[0] ?? null;
}
