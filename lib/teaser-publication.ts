import type { TeaserRow } from "./database.types.ts";
import { teaserContentSchema } from "./teasers.ts";
export function teaserReadiness(teaser: TeaserRow, product: { id: string; status: string } | null) {
  const checks = [
    { label: "Campaign and hero", ok: teaserContentSchema.pick({ internal_name: true, eyebrow: true, title: true, body: true }).safeParse({ ...teaser, eyebrow: teaser.eyebrow ?? "" }).success },
    { label: "Graffiti", ok: teaser.graffiti_lines.length <= 15 && teaser.graffiti_lines.every(line => typeof line === "string" && line === line.trim() && line.length > 0 && line.length <= 200) },
    { label: "Visibility", ok: teaser.visibility === "private" || teaser.visibility === "public" },
    { label: "Store destination selected", ok: Boolean(teaser.store_product_id && product?.id === teaser.store_product_id) },
    { label: "Product active", ok: product?.id === teaser.store_product_id && product?.status === "active" },
  ];
  return { ready: checks.every(check => check.ok), checks };
}
