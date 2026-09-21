import Link from "next/link";
import { AFFILIATE_TERMS_PATH, PUBLISHED_AFFILIATE_TERMS_VERSION } from "@/lib/affiliate-terms";
import { requireContributorAuth } from "@/lib/contributor-auth";
import { categoryLabels, contributionDate, earningsHistorySchema, milestoneSchema, referralActivitySchema } from "@/lib/contributions";
import { formatStoreMoney } from "@/lib/store";
import { AffiliateActivation, AffiliateLink } from "@/components/affiliate-controls";

export default async function ContributorPage() {
 const { supabase } = await requireContributorAuth("/contribute");
 const [progressResult, submissionsResult, affiliateResult, impactResult, earningsResult] = await Promise.all([
  supabase.rpc("get_my_contribution_progress"), supabase.rpc("get_my_contributions"), supabase.rpc("get_my_affiliate_state"), supabase.rpc("get_my_affiliate_impact"), supabase.rpc("get_my_affiliate_earnings"),
 ]);
 if ([progressResult, submissionsResult, affiliateResult, impactResult, earningsResult].some(result => result.error)) throw new Error("Your Contribution Hub could not be loaded. Please try again.");
 const progress = progressResult.data?.[0], affiliate = affiliateResult.data?.[0], impact = impactResult.data?.[0], earnings = earningsResult.data?.[0];
 if (!progress || !affiliate || !impact || !earnings) throw new Error("Contribution Hub data is unavailable.");
 const submissions = submissionsResult.data ?? [];
 const milestones = milestoneSchema.parse(progress.earned_milestones);
 const activity = referralActivitySchema.parse(impact.recent_activity);
 const history = earningsHistorySchema.parse(earnings.commission_history);
 const ready = affiliate.affiliate_status === "active" && affiliate.has_accepted_current_terms;
 let referralUrl: string | null = null, referralMessage: string | null = null;
 if (ready) {
  const { data: identity, error } = await supabase.rpc("get_or_create_my_referral_identity");
  if (error || !identity) referralMessage = "Your referral link is unavailable right now. Please try again later.";
  else if (identity.status !== "active") referralMessage = "Your referral link is currently disabled.";
  else referralUrl = `https://filthyprincesss.com/?ref=${encodeURIComponent(identity.code)}`;
 }
 const termsUrl = affiliate.current_terms_version === PUBLISHED_AFFILIATE_TERMS_VERSION ? AFFILIATE_TERMS_PATH : null;
 return <>
  <header className="hub-intro"><p className="eyebrow">Contributor</p><h1>Leave your fingerprints<br />on Filthy Princess.</h1><p>There’s more than one way to help build this world.</p></header>
  <div className="hub-stats"><section className="hub-card"><p className="eyebrow">Filth</p><strong className="hub-number">{Number(progress.filth_total).toLocaleString()}</strong>{progress.current_level_title && <p>Level {progress.current_level_number} · {progress.current_level_title}</p>}{progress.current_level_threshold !== null && <p className="hub-muted">Current threshold: {progress.current_level_threshold} Filth{progress.next_level_threshold !== null ? ` · Next: ${progress.next_level_threshold}` : ""}</p>}</section><section className="hub-card"><p className="eyebrow">Your contribution</p><strong className="hub-number">{progress.accepted_contributions}</strong><p>accepted contributions · {progress.filth_from_contributions} Filth earned</p><Link className="hub-text-link" href="/contributor/submit">Contribute something →</Link></section></div>
  {!!milestones.length && <section className="hub-card"><h2>What you’ve earned</h2><ul className="hub-history">{milestones.map((milestone, index) => <li key={`${milestone.title}-${index}`}><strong>{milestone.title}</strong><span>{contributionDate(milestone.earned_at)} · {milestone.threshold} Filth milestone</span></li>)}</ul></section>}
  <section className="hub-card hub-invitation"><div><p className="eyebrow">How will you leave your fingerprints?</p><h2>Design. Build. Create.<br />Share an idea.</h2><p>Accepted contributions earn Filth. Exceptional contributions may lead to opportunities, invitations or paid work.</p></div><Link className="hub-button" href="/contributor/submit">Contribute something</Link></section>
  <div className="hub-grid"><section className="hub-card"><p className="eyebrow">Affiliate</p><h2>{ready ? "Bring someone inside." : affiliate.affiliate_status === "suspended" ? "Affiliate activity is paused." : affiliate.affiliate_status === "closed" ? "Your Affiliate account is closed." : "Become an Affiliate."}</h2>
   {ready ? <><p>Bring people into Filthy Princess. Qualifying referrals earn commission and Filth.</p>{referralUrl && <AffiliateLink url={referralUrl} />}{referralMessage && <p>{referralMessage}</p>}</> : affiliate.affiliate_status === "suspended" || affiliate.affiliate_status === "closed" ? <p>Your earned Filth and commission history remain here. Contact Cally about your account.</p> : <><p>Earn commission when qualifying referrals become customers. Successful referrals earn Filth too. Contribution submissions never require Affiliate activation.</p><AffiliateActivation version={affiliate.current_terms_version} termsUrl={termsUrl} /></>}
  </section><section className="hub-card"><p className="eyebrow">Your impact</p><h2>{impact.successful_referrals} successful referrals</h2><p>{impact.filth_from_referrals} Filth from referrals</p>{activity.length ? <ul className="hub-history">{activity.map((item,index) => <li key={`${item.date}-${index}`}><strong>Someone you referred became a customer.</strong><span>{contributionDate(item.date)} · +{item.filth_awarded} Filth</span></li>)}</ul> : <p className="hub-muted">No successful referrals yet. When someone you refer becomes a qualifying customer, their impact will appear here.</p>}</section></div>
  <section className="hub-card"><p className="eyebrow">Earnings · USD</p><div className="hub-earnings"><div><h2>{formatStoreMoney(Number(earnings.pending_total), "USD")}</h2><span>Pending</span></div><div><h2>{formatStoreMoney(Number(earnings.available_total), "USD")}</h2><span>Available</span></div></div><p className="hub-muted">Available means the holding period has been completed through the commission maturity process. It does not mean paid.</p><details><summary>View earnings history ({history.length})</summary>{history.length ? <ul className="hub-history">{history.map(item => <li key={item.id}><strong>{formatStoreMoney(item.commission_amount,"USD")} · <span className="hub-status">{item.status}</span></strong><span>Created {contributionDate(item.created_at)} · Eligible from {contributionDate(item.available_at)}{item.matured_at ? ` · Matured ${contributionDate(item.matured_at)}` : ""}</span></li>)}</ul> : <p>No commission entitlements yet.</p>}</details></section>
  <section className="hub-card"><p className="eyebrow">Your contributions</p><h2>What you’ve put into the world.</h2>{submissions.length ? <ul className="hub-history">{submissions.map(item => <li key={item.id}><div className="hub-row"><h3>{item.title}</h3><span className="hub-badge">{item.status}</span></div><span>{categoryLabels[item.category]} · {contributionDate(item.submitted_at)}</span>{item.status === "accepted" && <strong>+{item.filth_awarded} Filth</strong>}{item.status === "accepted" && item.paid_opportunity && <p>Cally would like to talk to you about this one.</p>}<details><summary>View submission</summary><p className="hub-preserve">{item.description}</p>{item.work_url && <a className="hub-text-link" href={item.work_url} target="_blank" rel="noopener noreferrer">View your work ↗</a>}{item.additional_notes && <p className="hub-preserve">{item.additional_notes}</p>}{item.reviewed_at && <p>Last reviewed {contributionDate(item.reviewed_at)}</p>}</details></li>)}</ul> : <p>Nothing submitted yet. An idea is enough to start.</p>}</section>
 </>;
}
