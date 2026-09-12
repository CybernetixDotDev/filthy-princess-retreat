import { SubmitButton } from "@/components/submit-button";
import type { InnerSanctumCollectibleRow } from "@/lib/database.types";
import { COLLECTIBLE_STATUSES, collectibleLabel } from "@/lib/inner-sanctum-collections";

export function AdminCollectibleForm({ action, collectible }: { action: (formData: FormData) => void | Promise<void>; collectible?: InnerSanctumCollectibleRow }) {
  return <form action={action} className="form-grid">
    <label>Slug<input name="slug" defaultValue={collectible?.slug ?? ""} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" maxLength={100} required /></label>
    <label>Status<select name="status" defaultValue={collectible?.status ?? "draft"}>{COLLECTIBLE_STATUSES.map((status) => <option key={status} value={status}>{collectibleLabel(status)}</option>)}</select></label>
    <label>Sort order<input name="sort_order" type="number" min="-10000" max="10000" defaultValue={collectible?.sort_order ?? 0} required /></label>
    <label className="full-span">Title<input name="title" defaultValue={collectible?.title ?? ""} maxLength={200} required /></label>
    <label className="full-span">Description<textarea name="description" defaultValue={collectible?.description ?? ""} rows={6} maxLength={4000} required /></label>
    <label className="full-span">Private media<input name="media" type="file" accept="image/jpeg,image/png,image/webp,video/mp4" /><small>JPEG, PNG, WebP, or MP4. Maximum 20 MB.{collectible?.media_path ? ` Current: ${collectible.media_path}` : ""}</small></label>
    <div className="full-span"><SubmitButton>{collectible ? "Save collectible" : "Create collectible"}</SubmitButton></div>
  </form>;
}
