import Link from "next/link";
import { respondToBenefit } from "@/app/actions/inner-sanctum-benefits";
import type { SignedBenefit } from "@/lib/inner-sanctum-benefit-data";
import { getMyInnerSanctumBenefits } from "@/lib/inner-sanctum-benefit-data";
import { RESPONDABLE_BENEFIT_TYPES, benefitLabel } from "@/lib/inner-sanctum-benefits";
import { hasInnerSanctumAccess } from "@/lib/inner-sanctum";

function Benefit({ benefit, past = false }: { benefit: SignedBenefit; past?: boolean }) {
  const canRespond = !past && !benefit.confirmed_booking_id && !benefit.response && RESPONDABLE_BENEFIT_TYPES.includes(benefit.type as (typeof RESPONDABLE_BENEFIT_TYPES)[number]);
  return <article className="sanctum-benefit-item">
    {benefit.signed_media_url && benefit.media_type === "video/mp4" ? <video controls preload="metadata" src={benefit.signed_media_url}>Your browser cannot play this video.</video> : null}
    {/* Signed private media deliberately bypasses the public Next image optimizer. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {benefit.signed_media_url && benefit.media_type?.startsWith("image/") ? <img src={benefit.signed_media_url} alt="" /> : null}
    <div>{benefit.confirmed_booking_id ? <p className="sanctum-eyebrow">You&apos;re coming</p> : benefit.eyebrow ? <p className="sanctum-eyebrow">{benefit.eyebrow}</p> : <p className="sanctum-eyebrow">{benefitLabel(benefit.type)}</p>}<h2>{benefit.confirmed_booking_id ? "You're coming. ♥" : benefit.title}</h2><div className="sanctum-prose">{benefit.confirmed_booking_id ? <><p>{benefit.title}</p><p>Your place has been confirmed.</p>{benefit.confirmed_booking_start_date ? <p>{benefit.confirmed_booking_start_date}{benefit.confirmed_booking_end_date ? ` to ${benefit.confirmed_booking_end_date}` : ""}</p> : null}<p>Cally will share further details before you arrive.</p></> : benefit.body.split("\n\n").map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
      {benefit.response && !benefit.confirmed_booking_id ? <p className="sanctum-response">You {benefit.response} this.</p> : null}
      {benefit.cta_href && benefit.cta_label && !benefit.confirmed_booking_id ? <Link className="sanctum-link" href={benefit.cta_href}>{benefit.cta_label}</Link> : null}
      {benefit.confirmed_booking_public_slug ? <Link className="sanctum-link" href={`/booking/${benefit.confirmed_booking_public_slug}/prepare`}>Get ready →</Link> : null}
      {canRespond ? <div className="sanctum-benefit-actions"><form action={respondToBenefit.bind(null, benefit.id, "accepted")}><button type="submit">Accept</button></form><form action={respondToBenefit.bind(null, benefit.id, "declined")}><button type="submit">Decline</button></form></div> : null}
    </div>
  </article>;
}

export default async function BenefitsPage() {
  if (!await hasInnerSanctumAccess()) return <section className="inner-sanctum-boundary"><p className="eyebrow">Inner Sanctum</p><h1>This door isn&apos;t open for you yet.</h1><p>Inner Sanctum membership is required to enter.</p></section>;
  const benefits = await getMyInnerSanctumBenefits();
  const current = benefits.filter((benefit) => benefit.status === "available" && !benefit.response);
  const past = benefits.filter((benefit) => !current.includes(benefit));
  return <div className="sanctum-benefits-page"><header><p className="sanctum-eyebrow">Beyond the screen</p><h1>Things waiting for you.</h1></header><section aria-labelledby="current-benefits"><p className="sanctum-eyebrow">Currently waiting</p><h2 className="sr-only" id="current-benefits">Currently waiting</h2>{current.length ? current.map((benefit) => <Benefit benefit={benefit} key={benefit.id} />) : <p className="sanctum-neutral-state">Nothing waiting right now.</p>}</section>
    {past.length ? <section className="sanctum-benefits-past" aria-labelledby="past-benefits"><p className="sanctum-eyebrow">Past</p><h2 className="sr-only" id="past-benefits">Past benefits</h2>{past.map((benefit) => <Benefit benefit={benefit} past key={benefit.id} />)}</section> : null}</div>;
}
