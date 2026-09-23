import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FilthMeter } from "@/components/filth-meter";
import { AffiliateLink } from "@/components/affiliate-controls";
import { getMyFilthPageState } from "@/lib/filth";
import { getAuthState } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your Filth", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

const dateFormat = new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "long" });
const numberFormat = new Intl.NumberFormat("en-ZA");

function referralUrl(code: string) {
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${origin}/?ref=${encodeURIComponent(code)}`;
}

export default async function FilthPage() {
  const { user } = await getAuthState();
  if (!user) redirect("/signin?next=/filth");
  const state = await getMyFilthPageState();
  let myReferralUrl: string | null = null;
  const affiliateReady = state.affiliate?.affiliate_status === "active" && state.affiliate.has_accepted_current_terms;
  if (affiliateReady) {
    const { data: identity } = await (await createClient()).rpc("get_or_create_my_referral_identity");
    if (identity?.status === "active") myReferralUrl = referralUrl(identity.code);
  }
  const completed = state.milestones.filter((milestone) => milestone.completed);
  const upcoming = state.milestones.filter((milestone) => !milestone.completed).slice(0, 3);

  return <div className="filth-page">
    <FilthMeter progression={state.progression} variant="large" />
    <p className="filth-context">Filth is earned by participating in this strange little world.</p>
    <section className="filth-section filth-activity" aria-labelledby="filth-activity-heading">
      <p className="filth-eyebrow">HOW YOU GOT THIS FILTH</p>
      <h2 id="filth-activity-heading">Little traces of things you&apos;ve done.</h2>
      {state.activity.length ? <ol>{state.activity.map((event) => <li key={event.id}><strong>{event.points > 0 ? "+" : ""}{numberFormat.format(event.points)}</strong><div><span>{event.reason}</span><time dateTime={event.created_at}>{dateFormat.format(new Date(event.created_at))}</time></div></li>)}</ol> : <p className="filth-quiet">Nothing has left a mark yet. There&apos;s time.</p>}
    </section>
    <section className="filth-section filth-actions" aria-labelledby="filth-actions-heading">
      <p className="filth-eyebrow">GET FILTHIER</p>
      <h2 id="filth-actions-heading">There&apos;s more than one way to leave your mark.</h2>
      <div className="filth-action-grid">
        <article><h3>Contribute something wonderful</h3><p>Ideas, creativity and things that make Filthy Princess better.</p><Link className="sanctum-link" href="/contribute">Contribute →</Link></article>
        <article><h3>Bring someone with you</h3><p>Share your invitation. When it leads somewhere meaningful, your Filth grows.</p>{myReferralUrl ? <AffiliateLink url={myReferralUrl} /> : <Link className="sanctum-link" href="/contribute">My referral link →</Link>}</article>
      </div>
    </section>
    <section className="filth-section filth-milestones" aria-labelledby="filth-milestones-heading">
      <p className="filth-eyebrow">LOOK WHAT YOU&apos;VE DONE</p>
      <h2 id="filth-milestones-heading">The little lines you&apos;ve crossed.</h2>
      {completed.length ? <div className="filth-milestone-list">{completed.slice(-5).map((milestone) => <article className="filth-milestone-complete" key={milestone.id}><span>{milestone.threshold} Filth</span><h3>{milestone.title}</h3><p>Reached {milestone.earned_at ? dateFormat.format(new Date(milestone.earned_at)) : "already"}.</p></article>)}</div> : <p className="filth-quiet">Your first mark is waiting.</p>}
      {upcoming.length ? <div className="filth-upcoming"><p className="filth-eyebrow">Still ahead</p>{upcoming.map((milestone) => <div key={milestone.id}><strong>{milestone.threshold} Filth</strong><span>{milestone.title}</span></div>)}</div> : null}
    </section>
    <section className="filth-section filth-utility" aria-labelledby="filth-utility-heading">
      <p className="filth-eyebrow">WHAT CAN YOU DO WITH IT?</p>
      {state.progression.can_spend_filth ? <><h2 id="filth-utility-heading">KEEP IT CLOSE.</h2><p>You have <strong>{numberFormat.format(state.progression.available_filth)} Filth available.</strong></p><p>The Princess is still deciding what some of it will get you.</p><Link className="sanctum-link" href="/store">Visit the Store →</Link></> : <><h2 id="filth-utility-heading">YOU&apos;VE BEEN BUSY.</h2><p>You&apos;ve earned <strong>{numberFormat.format(state.progression.lifetime_filth)} Filth</strong> already.</p><p>Keep earning it. It isn&apos;t going anywhere.</p><p>Inside the Inner Sanctum, your Filth becomes something you can actually use.</p><Link className="sanctum-link" href="/store">Unlock your Filth →</Link></>}
    </section>
  </div>;
}
