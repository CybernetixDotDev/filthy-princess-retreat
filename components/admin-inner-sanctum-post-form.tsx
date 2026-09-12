import { SubmitButton } from "@/components/submit-button";
import type { InnerSanctumPostRow } from "@/lib/database.types";
import { INNER_SANCTUM_POST_STATUSES, INNER_SANCTUM_POST_TYPES, sanctumLabel } from "@/lib/inner-sanctum-posts";

function dateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function AdminInnerSanctumPostForm({ action, post }: { action: (formData: FormData) => void | Promise<void>; post?: InnerSanctumPostRow }) {
  return <form action={action} className="form-grid sanctum-post-form">
    <label>Type<select name="type" defaultValue={post?.type ?? "message"}>{INNER_SANCTUM_POST_TYPES.map((type) => <option value={type} key={type}>{sanctumLabel(type)}</option>)}</select></label>
    <label>Status<select name="status" defaultValue={post?.status ?? "draft"}>{INNER_SANCTUM_POST_STATUSES.map((status) => <option value={status} key={status}>{sanctumLabel(status)}</option>)}</select></label>
    <label>Sort order<input name="sort_order" type="number" min="-10000" max="10000" defaultValue={post?.sort_order ?? 0} required /></label>
    <label className="full-span">Eyebrow<input name="eyebrow" defaultValue={post?.eyebrow ?? ""} maxLength={100} /></label>
    <label className="full-span">Title<input name="title" defaultValue={post?.title ?? ""} maxLength={200} required /></label>
    <label className="full-span">Body<textarea name="body" defaultValue={post?.body ?? ""} rows={12} maxLength={12000} required /></label>
    <label className="full-span">Image path<input name="image_path" defaultValue={post?.image_path ?? ""} placeholder="/assets/example.png" /></label>
    <label>CTA label<input name="cta_label" defaultValue={post?.cta_label ?? ""} maxLength={100} /></label>
    <label>CTA internal path<input name="cta_href" defaultValue={post?.cta_href ?? ""} placeholder="/inner-sanctum/..." maxLength={500} /></label>
    <label>Publish at<input name="published_at" type="datetime-local" defaultValue={dateTimeLocal(post?.published_at)} /></label>
    <label>Expires at<input name="expires_at" type="datetime-local" defaultValue={dateTimeLocal(post?.expires_at)} /></label>
    <div className="full-span"><SubmitButton>{post ? "Save post" : "Create post"}</SubmitButton></div>
  </form>;
}
