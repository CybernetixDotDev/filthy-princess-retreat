import { notFound } from "next/navigation";
import { updateBenefit } from "@/app/admin/benefits/actions";
import { AdminBenefitForm } from "@/components/admin-benefit-form";
import { requireAdmin } from "@/lib/auth";
import { benefitLabel } from "@/lib/inner-sanctum-benefits";

export default async function EditBenefitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const state = await requireAdmin(); if (!state) return null;
  const [{ data: benefit }, { data: members, error }] = await Promise.all([state.supabase.from("inner_sanctum_benefits").select("*").eq("id", id).maybeSingle(), state.supabase.rpc("admin_list_inner_sanctum_members")]);
  if (!benefit) notFound(); if (error) throw new Error("Members could not be loaded.");
  return <><div className="admin-title"><div><p className="eyebrow">Benefit</p><h1>{benefit.title}</h1></div></div><section className="admin-panel"><p><strong>Member response:</strong> {benefit.response ? benefitLabel(benefit.response) : "No response"}{benefit.responded_at ? ` · ${new Date(benefit.responded_at).toLocaleString("en-ZA")}` : ""}</p><AdminBenefitForm action={updateBenefit.bind(null, benefit.id)} benefit={benefit} members={members ?? []} /></section></>;
}
