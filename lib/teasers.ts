import { z } from "zod";
const copy = (max: number) => z.string().trim().min(1, "Complete all required text fields.").max(max);
export const teaserContentSchema = z.object({
  internal_name: copy(200), eyebrow: z.string().trim().max(100).transform(v => v || null),
  title: copy(200), body: copy(12000), visibility: z.enum(["private", "public"]),
  store_product_id: z.union([z.uuid(), z.literal("")]).transform(v => v || null),
  graffiti_lines: z.array(z.string().trim().max(200)).max(15).transform(lines => lines.filter(Boolean)),
});
export function parseTeaserForm(form: FormData) {
  return teaserContentSchema.safeParse({
    ...Object.fromEntries(["internal_name", "eyebrow", "title", "body", "visibility", "store_product_id"].map(key => [key, form.get(key) ?? ""])),
    graffiti_lines: form.getAll("graffiti_lines"),
  });
}
export type TeaserProductOption = { id: string; name: string; status: string; price_amount: number; currency: string };
export type TeaserActionState = { error?: string; message?: string; warning?: string };
