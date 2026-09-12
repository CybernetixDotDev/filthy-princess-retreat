import type { InnerSanctumPostStatus, InnerSanctumPostType } from "./database.types";

export const INNER_SANCTUM_POST_TYPES = ["message", "feature", "drop", "task", "benefit"] as const satisfies readonly InnerSanctumPostType[];
export const INNER_SANCTUM_POST_STATUSES = ["draft", "published", "archived"] as const satisfies readonly InnerSanctumPostStatus[];

export function isSafeSanctumCta(value: string) {
  return value.startsWith("/")
    && !value.startsWith("//")
    && !value.includes("\\")
    && !value.includes("\r")
    && !value.includes("\n");
}

export function sanctumLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
