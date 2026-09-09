import { createClient } from "@/lib/supabase/server";
import { RetreatWireframe } from "@/components/retreat-wireframe";

function todayInJohannesburg() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export default async function RetreatWireframePage() {
  const supabase = await createClient();
  const { data: products } = await supabase.from("retreat_products").select("id,name,positioning,allowed_formats").eq("is_published", true).order("sort_order");
  return <RetreatWireframe products={products ?? []} initialMonth={todayInJohannesburg().slice(0, 7)} />;
}
