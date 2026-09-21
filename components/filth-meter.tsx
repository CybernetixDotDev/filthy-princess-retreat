"use client";
import { useState } from "react";
import type { InnerSanctumFilthMeter } from "@/lib/database.types";

export function FilthMeter({ meter, referralUrl }: { meter: InnerSanctumFilthMeter; referralUrl: string | null }) {
  const [copied, setCopied] = useState(false);
  const previous = meter.current_level_threshold ?? 0;
  const progress = meter.next_level_threshold ? Math.max(0, Math.min(100, ((Number(meter.filth_total) - previous) / (meter.next_level_threshold - previous)) * 100)) : 100;
  async function copy() { if (!referralUrl) return; await navigator.clipboard.writeText(referralUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
  return <section className="sanctum-filth-meter"><p className="sanctum-eyebrow">Your Filth Meter</p><div className="sanctum-filth-heading"><h2>{meter.current_level_title ?? "Before Level 1"}</h2><strong>{meter.filth_total} Filth</strong></div><div className="sanctum-filth-track" role="progressbar" aria-valuemin={previous} aria-valuemax={meter.next_level_threshold ?? Number(meter.filth_total)} aria-valuenow={Number(meter.filth_total)}><span style={{ width: `${progress}%` }} /></div><p>{meter.successful_referrals === 1 ? "One person followed you inside." : `${meter.successful_referrals} people followed you inside.`}</p>{meter.earned_milestones.length ? <ul>{meter.earned_milestones.map((milestone) => <li key={`${milestone.threshold}-${milestone.title}`}>{milestone.title}</li>)}</ul> : null}{referralUrl ? <div className="sanctum-referral-link"><p className="sanctum-eyebrow">Your invitation link</p><code>{referralUrl}</code><button type="button" onClick={copy}>{copied ? "Copied" : "Copy my link"}</button></div> : null}</section>;
}
