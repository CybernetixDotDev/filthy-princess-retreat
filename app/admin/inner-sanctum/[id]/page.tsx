import { notFound } from "next/navigation";
import { updateInnerSanctumPost } from "@/app/admin/inner-sanctum/actions";
import { AdminInnerSanctumPostForm } from "@/components/admin-inner-sanctum-post-form";
import { requireAdmin } from "@/lib/auth";

export default async function EditInnerSanctumPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await requireAdmin();
  if (!state) return null;
  const { data: post } = await state.supabase.from("inner_sanctum_posts").select("*").eq("id", id).maybeSingle();
  if (!post) notFound();
  return <><div className="admin-title"><div><p className="eyebrow">Inner Sanctum post</p><h1>{post.title}</h1></div></div><section className="admin-panel"><AdminInnerSanctumPostForm action={updateInnerSanctumPost.bind(null, post.id)} post={post} /></section></>;
}
