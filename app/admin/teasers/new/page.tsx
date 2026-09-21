import { requireAdmin } from "@/lib/auth";
import { TeaserForm } from "@/components/teaser-form";
import Link from "next/link";
export default async function NewTeaserPage() {
  const state = await requireAdmin(); if (!state) return null;
  const { data, error } = await state.supabase.from("store_products").select("id,name,status,price_amount,currency").eq("status", "active").order("name");
  if (error) throw new Error("Store products could not be loaded.");
  return <><div className="admin-title"><h1>New Teaser</h1><Link href="/admin/teasers">Back to Teasers</Link></div><TeaserForm products={data ?? []} /></>;
}
