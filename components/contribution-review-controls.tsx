"use client";
import { useActionState } from "react";
import { reviewContribution } from "@/app/admin/contributions/actions";
import { SubmitButton } from "@/components/submit-button";
function ReviewForm({ id, decision }: { id: string; decision: "reviewing" | "accepted" | "declined" }) {
 const [state, action] = useActionState(reviewContribution, {});
 return <form action={action} className="stack-form"><input type="hidden" name="id" value={id} /><input type="hidden" name="decision" value={decision} />
 {decision === "accepted" && <><h3>Accept contribution</h3><p>Acceptance records the award and creates one permanent Filth event.</p><label>Filth award<input name="filth_award" type="number" min={1} max={2147483647} step={1} required /></label><label><input type="checkbox" name="paid_opportunity" /> Discuss a possible paid opportunity (no payment entitlement)</label></>}
 {decision === "declined" && <h3>Decline contribution</h3>}
 {decision !== "reviewing" && <label>Private admin note<textarea name="admin_note" maxLength={3000} rows={3} /></label>}
 {state.error && <p className="form-error" role="alert">{state.error}</p>}{state.message && <p role="status">{state.message}</p>}
 <SubmitButton>{decision === "accepted" ? "Accept + Award Filth" : decision === "declined" ? "Decline contribution" : "Mark reviewing"}</SubmitButton></form>;
}
export function ContributionReviewControls({ id, status }: { id: string; status: "submitted" | "reviewing" }) { return <div className="contribution-review-grid">{status === "submitted" && <section className="admin-panel"><ReviewForm id={id} decision="reviewing" /></section>}<section className="admin-panel"><ReviewForm id={id} decision="accepted" /></section><section className="admin-panel"><ReviewForm id={id} decision="declined" /></section></div>; }
