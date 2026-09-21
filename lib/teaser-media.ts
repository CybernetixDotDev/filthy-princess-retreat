export const TEASER_MEDIA_BUCKET = "teaser-media";
export const TEASER_MEDIA_MAX_BYTES = 20 * 1024 * 1024;
export const TEASER_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type TeaserImageSlot = 1 | 2 | 3;
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
const pathPattern = new RegExp(`^${uuid}/${uuid}-polaroid-[123]\\.(jpg|jpeg|png|webp)$`);

export function validateTeaserImageTarget(id: string, slot: number): asserts slot is TeaserImageSlot {
  if (!new RegExp(`^${uuid}$`).test(id)) throw new Error("Invalid teaser ID.");
  if (slot !== 1 && slot !== 2 && slot !== 3) throw new Error("Image slot must be 1, 2 or 3.");
}

export function isTeaserMediaPath(path: string) {
  return pathPattern.test(path);
}

export async function validateTeaserImage(file: File): Promise<"jpg" | "png" | "webp"> {
  if (!file || file.size <= 0) throw new Error("Choose a non-empty image.");
  if (file.size > TEASER_MEDIA_MAX_BYTES) throw new Error("Images must be 20 MiB or smaller.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  const types: Record<string, readonly string[]> = { "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"] };
  if (!types[file.type]?.includes(extension ?? "")) throw new Error("Choose a JPEG, PNG or WebP image with a matching extension.");
  // Small signature check, not image decoding or transformation.
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const matches = (signature: number[], offset = 0) => signature.every((byte, i) => bytes[offset + i] === byte);
  const valid = file.type === "image/jpeg" ? matches([255, 216, 255])
    : file.type === "image/png" ? matches([137, 80, 78, 71, 13, 10, 26, 10])
    : matches([82, 73, 70, 70]) && matches([87, 69, 66, 80], 8);
  if (!valid) throw new Error("Image content does not match its declared type.");
  return file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
}

export function teaserMediaPublicUrl(path: string | null, supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  if (path === null) return null;
  if (!isTeaserMediaPath(path)) throw new Error("Invalid teaser image path.");
  if (!supabaseUrl) throw new Error("Supabase URL is not configured.");
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${TEASER_MEDIA_BUCKET}/${path}`;
}
