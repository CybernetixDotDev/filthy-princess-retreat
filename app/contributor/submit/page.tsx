import Link from "next/link";
import { requireContributorAuth } from "@/lib/contributor-auth";
import { ContributionForm } from "@/components/contribution-form";
export default async function SubmitContributionPage() {
 await requireContributorAuth("/contributor/submit");
 return <div className="hub-submit"><Link className="hub-text-link" href="/contribute">Back to your Hub</Link><header className="hub-intro"><p className="eyebrow">Your contribution</p><h1>Leave a fingerprint.</h1><p>A design, a build, a fresh idea. Show Cally what you have in mind.</p></header><ContributionForm /></div>;
}
