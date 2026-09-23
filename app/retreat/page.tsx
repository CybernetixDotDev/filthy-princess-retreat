import type { Metadata } from "next";
import { FilthyShell } from "@/components/filthy-shell";
import { PublicRetreatPage } from "@/components/public-retreat-page";
import { createClient } from "@/lib/supabase/server";
import type { RetreatFormat } from "@/lib/domain";

export const metadata: Metadata = { title: "Retreat", description: "Three extraordinary nights with Filthy Princess." };
export const dynamic = "force-dynamic";

type RetreatProduct = { id: string; name: string; positioning: string; allowed_formats: RetreatFormat[] };

export default async function RetreatPage() {
  const supabase = await createClient();
  const { data: products, error } = await supabase.from("retreat_products").select("id,name,positioning,allowed_formats").eq("is_published", true).order("sort_order");
  if (error) throw new Error("The Retreat could not be opened.");
  return <FilthyShell><div className="retreat-page-v1 retreat-page-full-bleed"><PublicRetreatPage products={(products ?? []) as RetreatProduct[]} /></div></FilthyShell>;
}
