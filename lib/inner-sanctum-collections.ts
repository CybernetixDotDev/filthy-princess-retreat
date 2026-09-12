export const INNER_SANCTUM_MEDIA_BUCKET = "inner-sanctum-media";
export const INNER_SANCTUM_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "video/mp4"] as const;
export const INNER_SANCTUM_MEDIA_MAX_BYTES = 20 * 1024 * 1024;
export const COLLECTIBLE_STATUSES = ["draft", "active", "archived"] as const;

export function collectibleLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

export function safeMediaFilename(name: string) {
  const cleaned = name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "media";
}
