export const INNER_SANCTUM_TASK_STATUSES = ["draft", "published", "archived"] as const;
export const INNER_SANCTUM_TASK_RESPONSE_MAX = 5000;

export function taskLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

export function isTaskOpen(task: { status: string; available_from: string | null; closes_at: string | null }, now = new Date()) {
  return task.status === "published"
    && (!task.available_from || new Date(task.available_from) <= now)
    && (!task.closes_at || new Date(task.closes_at) > now);
}
