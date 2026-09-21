"use client";
import Link from "next/link";
import { useActionState } from "react";
import { submitContribution } from "@/app/actions/contributions";
import { contributionCategories, categoryLabels } from "@/lib/contributions";
import { SubmitButton } from "@/components/submit-button";
export function ContributionForm() {
 const [state, action] = useActionState(submitContribution, {});
 if (state.submitted) return <section className="hub-card" role="status"><h2>It’s with Cally.</h2><p>Your contribution has been submitted for review. Filth is awarded only when a contribution is accepted.</p><Link className="hub-button" href="/contributor">Back to your Hub</Link></section>;
 return <form action={action} className="hub-card hub-form">
  <label>What are you bringing me?<select name="category" required defaultValue=""><option value="" disabled>Choose a category</option>{contributionCategories.map(category => <option key={category} value={category}>{categoryLabels[category]}</option>)}</select></label>
  <label>Give it a name<input name="title" maxLength={200} required /></label>
  <label>Tell me about it<textarea name="description" rows={7} maxLength={12000} required /></label>
  <label>Show me <span>(optional URL)</span><input name="work_url" type="url" placeholder="https://" maxLength={2000} /></label>
  <label>Anything else? <span>(optional)</span><textarea name="additional_notes" rows={3} maxLength={3000} /></label>
  {state.error && <p role="alert" className="hub-error">{state.error}</p>}
  <SubmitButton className="hub-button">Send to Cally</SubmitButton>
 </form>;
}
