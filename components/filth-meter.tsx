"use client";
import { useState } from "react";
import Link from "next/link";
import type { FilthProgression, InnerSanctumFilthMeter } from "@/lib/database.types";

type FilthMeterProps = {
  progression: FilthProgression;
  referralUrl?: string | null;
  referralCount?: number;
  earnedMilestones?: InnerSanctumFilthMeter["earned_milestones"];
  variant?: "compact" | "large";
  showDetailLink?: boolean;
};

const numberFormat = new Intl.NumberFormat("en-ZA");

export function FilthMeter({ progression, referralUrl, referralCount, earnedMilestones = [], variant = "large", showDetailLink = false }: FilthMeterProps) {
  const [copied, setCopied] = useState(false);
  async function copy() { if (!referralUrl) return; await navigator.clipboard.writeText(referralUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
  const currentLevel = progression.current_level_title ? `${progression.current_level_title} · Level ${progression.current_level ?? ""}` : "Before Level 1";
  const nextMessage = progression.next_level_title && progression.filth_to_next_level !== null
    ? `${numberFormat.format(progression.filth_to_next_level)} more until you're ${progression.next_level_title}.`
    : "There is always somewhere filthier to go.";
  return <section className={`sanctum-filth-meter sanctum-filth-meter-${variant}`}>
    <p className="sanctum-eyebrow">YOUR FILTH</p>
    <div className="sanctum-filth-heading"><div><strong>{numberFormat.format(progression.lifetime_filth)}</strong><span>{currentLevel}</span></div></div>
    <div className="sanctum-filth-track" role="progressbar" aria-label="Filth progression" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progression.progress_percentage}><span style={{ width: `${progression.progress_percentage}%` }} /></div>
    <p className="sanctum-filth-next">{nextMessage}</p>
    <div className="sanctum-filth-utility"><strong>{numberFormat.format(progression.available_filth)} {progression.can_spend_filth ? "available to spend" : "available"}</strong>{progression.can_spend_filth ? <><p>There&apos;s more waiting inside.</p><Link className="sanctum-link" href="/store">See what you can do with it →</Link></> : <><p>You&apos;ve earned it. Inner Sanctum members can spend it.</p><Link className="sanctum-link" href="/store">Unlock your Filth →</Link></>}</div>
    {showDetailLink ? <Link className="sanctum-filth-detail-link" href="/filth">See my Filth →</Link> : null}
    {referralCount !== undefined ? <p>{referralCount === 1 ? "One person followed you inside." : `${referralCount} people followed you inside.`}</p> : null}
    {earnedMilestones.length ? <ul>{earnedMilestones.map((milestone) => <li key={`${milestone.threshold}-${milestone.title}`}>{milestone.title}</li>)}</ul> : null}
    {referralUrl ? <div className="sanctum-referral-link"><p className="sanctum-eyebrow">Your invitation link</p><code>{referralUrl}</code><button type="button" onClick={copy}>{copied ? "Copied" : "Copy my link"}</button></div> : null}
  </section>;
}
