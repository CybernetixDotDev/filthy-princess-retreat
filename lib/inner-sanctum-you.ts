import "server-only";
import { getMyInnerSanctumBenefits } from "@/lib/inner-sanctum-benefit-data";
import { getMyInnerSanctumCollection } from "@/lib/inner-sanctum-collection";
import { getMyInnerSanctumTasks } from "@/lib/inner-sanctum-task-data";
import { isTaskOpen } from "@/lib/inner-sanctum-tasks";
import { createClient } from "@/lib/supabase/server";

export async function getInnerSanctumYouState() {
  const supabase = await createClient();
  const [{ data: access, error }, collection, benefits, tasks, { data: filth, error: filthError }] = await Promise.all([
    supabase.rpc("get_my_inner_sanctum_access"),
    getMyInnerSanctumCollection({ limit: 3 }),
    getMyInnerSanctumBenefits({ signMedia: false }),
    getMyInnerSanctumTasks(),
    supabase.rpc("get_my_filth_meter"),
  ]);
  if (error || filthError || !access?.[0] || !filth?.[0]) throw new Error("Your membership could not be opened.");
  return {
    membership: access[0],
    collection,
    waitingBenefit: benefits.find((benefit) => benefit.status === "available" && !benefit.response) ?? null,
    unansweredTask: tasks.find((task) => isTaskOpen(task) && !task.response_text) ?? null,
    hasTaskHistory: tasks.some((task) => Boolean(task.response_text)),
    filth: filth[0],
  };
}
