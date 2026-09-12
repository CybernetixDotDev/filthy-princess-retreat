import { createInnerSanctumPost } from "@/app/admin/inner-sanctum/actions";
import { AdminInnerSanctumPostForm } from "@/components/admin-inner-sanctum-post-form";

export default function NewInnerSanctumPostPage() {
  return <><div className="admin-title"><div><p className="eyebrow">Inner Sanctum</p><h1>New post</h1></div></div><section className="admin-panel"><AdminInnerSanctumPostForm action={createInnerSanctumPost} /></section></>;
}
