import Link from "next/link";
import { FilthMeter } from "@/components/filth-meter";
import { hasInnerSanctumAccess } from "@/lib/inner-sanctum";
import { getInnerSanctumYouState } from "@/lib/inner-sanctum-you";

function memberSince(value: string) {
  return new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

export default async function InnerSanctumYouPage() {
  if (!await hasInnerSanctumAccess()) return <section className="inner-sanctum-boundary" aria-labelledby="you-boundary-title"><p className="eyebrow">Inner Sanctum</p><h1 id="you-boundary-title">This door isn&apos;t open for you yet.</h1><p>Inner Sanctum membership is required to enter.</p></section>;
  const state = await getInnerSanctumYouState();
  const origin = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const referralUrl = state.filth.referral_code ? `${origin}/?ref=${encodeURIComponent(state.filth.referral_code)}` : null;
  return <div className="sanctum-you"><header className="sanctum-you-intro"><p className="sanctum-eyebrow">Your corner</p><h1>You&apos;re still here.</h1><p>Good.</p></header>
    <section className="sanctum-you-membership"><p className="sanctum-eyebrow">You&apos;re inside</p><h2>Lifetime Inner Sanctum membership.</h2><p>Member since {memberSince(state.membership.started_at)}</p></section>
    <FilthMeter progression={state.progression} referralUrl={referralUrl} referralCount={state.filth.successful_referrals} earnedMilestones={state.filth.earned_milestones} />
    <section className="sanctum-you-section"><p className="sanctum-eyebrow">Things you&apos;ve kept</p><div className="sanctum-you-collection">{state.collection.map((item) => <article key={item.id}>{item.signed_media_url && item.media_type === "video/mp4" ? <video src={item.signed_media_url} muted preload="metadata" /> : null}{item.signed_media_url && item.media_type?.startsWith("image/") ? <img /* eslint-disable-line @next/next/no-img-element */ src={item.signed_media_url} alt="" /> : null}<h3>{item.title}</h3></article>)}</div>{!state.collection.length ? <p className="sanctum-neutral-state">Nothing here yet.</p> : null}<Link className="sanctum-link" href="/inner-sanctum/collection">Open my collection</Link></section>
    <section className="sanctum-you-section"><p className="sanctum-eyebrow">What&apos;s waiting</p>{state.waitingBenefit ? <><h2>{state.waitingBenefit.title}</h2><p className="sanctum-you-note">Something is waiting for you.</p></> : <h2>Nothing waiting right now.</h2>}<Link className="sanctum-link" href="/inner-sanctum/benefits">See what&apos;s waiting</Link></section>
    <section className="sanctum-you-section"><p className="sanctum-eyebrow">What I&apos;ve asked of you</p>{state.unansweredTask ? <><h2>{state.unansweredTask.title}</h2><Link className="sanctum-link" href={`/inner-sanctum/tasks/${state.unansweredTask.slug}`}>Tell me</Link></> : state.hasTaskHistory ? <><h2>You&apos;ve answered me before.</h2><Link className="sanctum-link" href="/inner-sanctum/tasks">See my responses</Link></> : <><h2>Nothing I need from you right now.</h2><Link className="sanctum-link" href="/inner-sanctum/tasks">See my tasks</Link></>}</section>
    <nav className="sanctum-you-access" aria-label="Member access"><p className="sanctum-eyebrow">Member access</p><div><Link href="/inner-sanctum/collection">View collection</Link><Link href="/inner-sanctum/benefits">View benefits</Link><Link href="/inner-sanctum/tasks">View tasks</Link></div></nav>
  </div>;
}
