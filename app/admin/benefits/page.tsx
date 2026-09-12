import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { benefitLabel } from "@/lib/inner-sanctum-benefits";

export default async function AdminBenefitsPage() {
  const state = await requireAdmin(); if (!state) return null;
  const { data, error } = await state.supabase.from("inner_sanctum_benefits").select("*").order("created_at", { ascending: false });
  if (error) throw new Error("Benefits could not be loaded.");
  return <><div className="admin-title"><div><p className="eyebrow">Inner Sanctum</p><h1>Benefits</h1></div><Link className="button" href="/admin/benefits/new">New benefit</Link></div><section className="admin-panel"><div className="table-wrap"><table><thead><tr><th>Member</th><th>Type</th><th>Title</th><th>Status</th><th>Response</th><th>Action</th></tr></thead><tbody>
    {data?.map((benefit) => <tr key={benefit.id}><td>{benefit.user_id}</td><td>{benefitLabel(benefit.type)}</td><td><strong>{benefit.title}</strong></td><td><span className={`status ${benefit.status}`}>{benefitLabel(benefit.status)}</span></td><td>{benefit.response ? benefitLabel(benefit.response) : "—"}</td><td><Link className="button secondary small" href={`/admin/benefits/${benefit.id}`}>Edit</Link></td></tr>)}
    {!data?.length ? <tr><td colSpan={6}>No member benefits yet.</td></tr> : null}
  </tbody></table></div></section></>;
}
