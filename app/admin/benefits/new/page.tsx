import { createBenefit } from "@/app/admin/benefits/actions";
import { AdminBenefitForm } from "@/components/admin-benefit-form";
import { requireAdmin } from "@/lib/auth";

export default async function NewBenefitPage() {
  const state = await requireAdmin(); if (!state) return null;
  const { data: members, error } = await state.supabase.rpc("admin_list_inner_sanctum_members");
  if (error) throw new Error("Members could not be loaded.");
  return <><div className="admin-title"><div><p className="eyebrow">Benefits</p><h1>New benefit</h1></div></div><section className="admin-panel"><AdminBenefitForm action={createBenefit} members={members ?? []} /></section></>;
}
