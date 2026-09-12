import Link from "next/link";
import { archiveInnerSanctumPost } from "@/app/admin/inner-sanctum/actions";
import { requireAdmin } from "@/lib/auth";
import { sanctumLabel } from "@/lib/inner-sanctum-posts";

function when(value: string | null) {
  return value ? new Date(value).toLocaleString("en-ZA") : "—";
}

export default async function AdminInnerSanctumPage() {
  const state = await requireAdmin();
  if (!state) return null;
  const { data: posts, error } = await state.supabase.from("inner_sanctum_posts").select("*").order("sort_order").order("published_at", { ascending: false, nullsFirst: false });
  if (error) throw new Error("Inner Sanctum posts could not be loaded.");
  return <>
    <div className="admin-title"><div><p className="eyebrow">Inner Sanctum</p><h1>Publishing</h1></div><Link className="button" href="/admin/inner-sanctum/new">New post</Link></div>
    <section className="admin-panel"><div className="table-wrap"><table><thead><tr><th>Type</th><th>Title</th><th>Status</th><th>Published</th><th>Expires</th><th>Order</th><th>Actions</th></tr></thead><tbody>
      {posts?.map((post) => <tr key={post.id}><td>{sanctumLabel(post.type)}</td><td><strong>{post.title}</strong></td><td><span className={`status ${post.status}`}>{sanctumLabel(post.status)}</span></td><td>{when(post.published_at)}</td><td>{when(post.expires_at)}</td><td>{post.sort_order}</td><td><div className="admin-row-actions"><Link className="button secondary small" href={`/admin/inner-sanctum/${post.id}`}>Edit</Link>{post.status !== "archived" ? <form action={archiveInnerSanctumPost}><input type="hidden" name="post_id" value={post.id} /><button className="button secondary small" type="submit">Archive</button></form> : null}</div></td></tr>)}
      {!posts?.length ? <tr><td colSpan={7}>No Inner Sanctum posts yet.</td></tr> : null}
    </tbody></table></div></section>
  </>;
}
