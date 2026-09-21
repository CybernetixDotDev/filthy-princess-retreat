import { z } from "zod";
const copy = (max: number) => z.string().trim().min(1, "Complete all required text fields.").max(max);
export const teaserContentSchema = z.object({
  internal_name: copy(200), eyebrow: z.string().trim().max(100).transform(v => v || null),
  title: copy(200), body: copy(12000), visibility: z.enum(["private", "public"]),
  destination_type: z.enum(["store", "promo"]).default("store"),
  promo_destination: z.union([z.literal("contribute"), z.literal("")]).default("").transform(v => v || null),
  store_product_id: z.union([z.uuid(), z.literal("")]).transform(v => v || null),
  graffiti_lines: z.array(z.string().trim().max(200)).max(15).transform(lines => lines.filter(Boolean)),
});
export function parseTeaserForm(form: FormData) {
  const parsed = teaserContentSchema.safeParse({
    ...Object.fromEntries(["internal_name", "eyebrow", "title", "body", "visibility", "store_product_id", "promo_destination"].map(key => [key, form.get(key) ?? ""])),
    destination_type: form.get("destination_type") ?? "store",
    graffiti_lines: form.getAll("graffiti_lines"),
  });
  if (parsed.success) {
    // UI type switching cannot retain a hidden destination from the other mode.
    if (parsed.data.destination_type === "promo") {
      if (parsed.data.promo_destination !== "contribute") return teaserContentSchema.safeParse({ ...parsed.data, promo_destination: "invalid" });
      parsed.data.store_product_id = null;
    } else parsed.data.promo_destination = null;
  }
  return parsed;
}
export type TeaserProductOption = { id: string; name: string; status: string; price_amount: number; currency: string };
export type TeaserActionState = { error?: string; message?: string; warning?: string };
