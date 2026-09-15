import { SubmitButton } from "@/components/submit-button";
import type { InnerSanctumAdminMember, InnerSanctumBenefitRow } from "@/lib/database.types";
import { BENEFIT_STATUSES, BENEFIT_TYPES, benefitLabel } from "@/lib/inner-sanctum-benefits";

function localDate(value?: string | null) { if (!value) return ""; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
export function AdminBenefitForm({ action, benefit, members, events = [] }: { action: (formData: FormData) => void | Promise<void>; benefit?: InnerSanctumBenefitRow; members: InnerSanctumAdminMember[]; events?: Array<{ id: string; title: string; start_date: string; end_date: string }> }) {
  return <form action={action} className="form-grid">
    <label className="full-span">Member<select name="user_id" required defaultValue={benefit?.user_id ?? ""}><option value="" disabled>Select a member</option>{members.map((member) => <option key={member.user_id} value={member.user_id}>{member.email ?? member.user_id}</option>)}</select></label>
    <label>Type<select name="type" defaultValue={benefit?.type ?? "invitation"}>{BENEFIT_TYPES.map((type) => <option key={type} value={type}>{benefitLabel(type)}</option>)}</select></label>
    <label className="full-span">Retreat event (optional)<select name="retreat_event_id" defaultValue={benefit?.retreat_event_id ?? ""}><option value="">Not linked</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title} ({event.start_date} to {event.end_date})</option>)}</select><small>Only invitation, event, and retreat benefits may be linked.</small></label>
    <label>Status<select name="status" defaultValue={benefit?.status ?? "draft"}>{BENEFIT_STATUSES.map((status) => <option key={status} value={status}>{benefitLabel(status)}</option>)}</select></label>
    <label className="full-span">Eyebrow<input name="eyebrow" maxLength={100} defaultValue={benefit?.eyebrow ?? ""} /></label>
    <label className="full-span">Title<input name="title" maxLength={200} required defaultValue={benefit?.title ?? ""} /></label>
    <label className="full-span">Body<textarea name="body" rows={8} maxLength={12000} required defaultValue={benefit?.body ?? ""} /></label>
    <label>CTA label<input name="cta_label" maxLength={100} defaultValue={benefit?.cta_label ?? ""} /></label><label>CTA internal path<input name="cta_href" maxLength={500} placeholder="/inner-sanctum/..." defaultValue={benefit?.cta_href ?? ""} /></label>
    <label>Available from<input name="available_from" type="datetime-local" defaultValue={localDate(benefit?.available_from)} /></label><label>Expires at<input name="expires_at" type="datetime-local" defaultValue={localDate(benefit?.expires_at)} /></label>
    <label className="full-span">Private media<input name="media" type="file" accept="image/jpeg,image/png,image/webp,video/mp4" /><small>JPEG, PNG, WebP, or MP4. Maximum 20 MB.{benefit?.media_path ? ` Current: ${benefit.media_path}` : ""}</small></label>
    <div className="full-span"><SubmitButton>{benefit ? "Save benefit" : "Create benefit"}</SubmitButton></div>
  </form>;
}
