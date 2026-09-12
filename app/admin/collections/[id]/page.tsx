import { notFound } from "next/navigation";
import { grantCollectible, updateCollectible } from "@/app/admin/collections/actions";
import { AdminCollectibleForm } from "@/components/admin-collectible-form";
import { SubmitButton } from "@/components/submit-button";
import { requireAdmin } from "@/lib/auth";

export default async function EditCollectiblePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await requireAdmin();
  if (!state) return null;
  const [{ data: collectible }, { data: members, error: membersError }, { data: grants }] = await Promise.all([
    state.supabase.from("inner_sanctum_collectibles").select("*").eq("id", id).maybeSingle(),
    state.supabase.rpc("admin_list_inner_sanctum_members"),
    state.supabase.from("inner_sanctum_member_collectibles").select("user_id,granted_at").eq("collectible_id", id),
  ]);
  if (!collectible) notFound();
  if (membersError) throw new Error("Members could not be loaded.");
  const owned = new Set((grants ?? []).map((grant) => grant.user_id));
  return <><div className="admin-title"><div><p className="eyebrow">Collectible</p><h1>{collectible.title}</h1></div></div>
    <section className="admin-panel"><AdminCollectibleForm action={updateCollectible.bind(null, collectible.id)} collectible={collectible} /></section>
    <section className="admin-panel"><h2>Grant to a member</h2><form action={grantCollectible.bind(null, collectible.id)} className="form-grid"><label className="full-span">Member<select name="user_id" required defaultValue=""><option value="" disabled>Select a member</option>{members?.map((member) => <option key={member.user_id} value={member.user_id}>{member.email ?? member.user_id}{owned.has(member.user_id) ? " — already owned" : ""}</option>)}</select></label><div className="full-span"><SubmitButton>Grant collectible</SubmitButton></div></form></section>
  </>;
}
