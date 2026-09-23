"use client";

import Image from "next/image";
import { useActionState, useEffect, useState } from "react";
import { getPublicRetreatPrice } from "@/app/actions/pricing";
import { submitPublicRetreatInterest, type PublicRetreatInterestState } from "@/app/actions/enquiries";
import type { RetreatFormat } from "@/lib/domain";
import { SubmitButton } from "@/components/submit-button";

type Product = { id: string; name: string; positioning: string; allowed_formats: RetreatFormat[] };
type PrivateFormat = "solo" | "couples" | "private_group";
type PriceState = { key: string; status: "loading" | "ready" | "error"; totalUsd?: string; nights?: number; guestCount?: number };

const formatLabels: Record<PrivateFormat, string> = { solo: "Solo", couples: "Couple", private_group: "Private Group" };
const privateFormats: PrivateFormat[] = ["solo", "couples", "private_group"];

function guestCountFor(format: PrivateFormat, groupGuests: number) { return format === "solo" ? 1 : format === "couples" ? 2 : groupGuests; }
function displayUsd(value: string) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(value)); }

function InterestForm({ product, format, guestCount, onBack }: { product: Product; format: PrivateFormat; guestCount: number; onBack: () => void }) {
  const [state, action] = useActionState<PublicRetreatInterestState, FormData>(submitPublicRetreatInterest, {});
  if (state.success) return <section className="retreat-creative-success" aria-live="polite"><p className="retreat-hand retreat-red">Cally knows.</p><h3>Your interest has been sent.</h3><p>Nothing has been booked or charged yet. I&apos;ll be in touch.</p></section>;
  return <form action={action} className="retreat-creative-form">
    <input type="hidden" name="product_id" value={product.id} /><input type="hidden" name="retreat_format" value={format} /><input type="hidden" name="guest_count" value={guestCount} />
    <label>Your name<input name="full_name" autoComplete="name" minLength={2} maxLength={200} required /></label>
    <label>Email<input name="email" type="email" autoComplete="email" maxLength={320} required /></label>
    <label className="retreat-form-wide">Anything you&apos;d like Cally to know? <span>(optional)</span><textarea name="message" rows={4} maxLength={2000} /></label>
    {state.error ? <p className="retreat-creative-error" role="alert">{state.error}</p> : null}
    <div className="retreat-form-actions"><SubmitButton className="retreat-creative-primary">Tell Cally I&apos;m interested</SubmitButton><button className="retreat-creative-text" type="button" onClick={onBack}>Change my choice</button></div>
  </form>;
}

export function PublicRetreatPage({ products }: { products: Product[] }) {
  const [productId, setProductId] = useState("");
  const [format, setFormat] = useState<PrivateFormat | "">("");
  const [groupGuests, setGroupGuests] = useState(3);
  const [price, setPrice] = useState<PriceState | null>(null);
  const product = products.find((item) => item.id === productId);
  const formats = product?.allowed_formats.filter((item): item is PrivateFormat => privateFormats.includes(item as PrivateFormat)) ?? [];
  const guestCount = format ? guestCountFor(format, groupGuests) : 0;
  const priceKey = productId && format ? `${productId}:${format}:${guestCount}` : "";

  useEffect(() => {
    if (!productId || !format || !guestCount) return;
    let current = true;
    void getPublicRetreatPrice({ productId, format, guestCount }).then((result) => {
      if (!current) return;
      setPrice(result.price ? { key: priceKey, status: "ready", totalUsd: result.price.totalUsd, nights: result.price.nights, guestCount: result.price.guestCount } : { key: priceKey, status: "error" });
    }).catch(() => { if (current) setPrice({ key: priceKey, status: "error" }); });
    return () => { current = false; };
  }, [format, guestCount, priceKey, productId]);

  function chooseProduct(next: string) { setProductId(next); setFormat(""); setPrice(null); }
  function chooseFormat(next: PrivateFormat) { setFormat(next); setPrice(null); }
  const priceReady = Boolean(price?.key === priceKey && price.status === "ready" && product && format);

  return <div className="retreat-creative">
    <section className="retreat-creative-hero"><Image className="retreat-hero-image" src="/assets/MainBackground.png" alt="A forest path opening toward light in the Garden Route" fill priority sizes="100vw" /><div className="retreat-hero-shade" /><div className="retreat-hero-copy"><p className="retreat-creative-eyebrow">Garden Route · South Africa</p><h1>Filthy Princess<br /><em>Retreat</em></h1><p className="retreat-hero-subtitle">Three nights with Cally.</p><p className="retreat-hand retreat-hero-note">You probably shouldn&apos;t. ♡</p><a className="retreat-creative-primary" href="#nights">Run away with me →</a></div><p className="retreat-hand retreat-key-note">found something? →</p></section>

    <section className="retreat-creative-nights" id="nights"><p className="retreat-creative-eyebrow">Three nights with Cally</p><h2>This isn&apos;t a hotel package.<br />And I&apos;m not a hospitality company.</h2><p>It&apos;s three nights in the Garden Route with me.</p><p>We eat ridiculously well. We play. We disappear into the forest. I pamper you. We sit around fires. We talk about things we probably weren&apos;t planning to talk about.</p><p>And somewhere along the way, things tend to get a little filthy.</p><p className="retreat-hand retreat-note">there is absolutely no itinerary. ♡<br /><s>okay there is.</s><br />I just refuse to show it to you.</p><span className="retreat-doodle retreat-daisy" aria-hidden="true">✳</span></section>

    <section className="retreat-notebook"><div className="retreat-notebook-heading"><p className="retreat-creative-eyebrow">Your <span className="retreat-crossed">itinerary</span></p><h2>Things that might happen.</h2><p className="retreat-hand">I&apos;m not giving you a bloody timetable. ♡</p></div><div className="retreat-notebook-grid">
      <article className="retreat-note-card retreat-note-massage"><div className="retreat-polaroid"><Image src="/assets/massageRoom.png" alt="A private massage room" width={900} height={650} /></div><p className="retreat-creative-eyebrow">Massage</p><p className="retreat-hand">this bit is actually quite serious</p><h3>I give a fucking good massage →</h3></article>
      <article className="retreat-note-card retreat-note-braai"><p className="retreat-creative-eyebrow">Braai.</p><h3>A proper South African one.</h3><p className="retreat-hand">obviously I had to make it filthy.</p><span className="retreat-doodle retreat-flame" aria-hidden="true">~</span></article>
      <article className="retreat-note-card retreat-note-honey"><div className="retreat-polaroid"><Image src="/assets/CallyHoney3.jpeg" alt="Cally eating a strawberry with honey by the fire" width={900} height={650} /></div><p className="retreat-creative-eyebrow">Strawberries. Honey. Dessert.</p><h3>The distinction between these becomes surprisingly unimportant.</h3><p className="retreat-hand">yes. that&apos;s me.<br />behaving impeccably.</p></article>
      <article className="retreat-note-card retreat-note-outside"><p className="retreat-creative-eyebrow">We go outside.</p><h3>Forests. Beaches. Walks. Picnics.</h3><p>Somewhere beautiful in the Garden Route.</p><p className="retreat-hand">shoes increasingly optional.</p></article>
      <article className="retreat-note-card retreat-note-spoilt"><p className="retreat-creative-eyebrow">You get spoilt.</p><h3>Massage. Warm towels. Foot soaks. Facials.</h3><p>Little things I haven&apos;t told you about.</p><p className="retreat-hand">stop asking. they&apos;re surprises. ♡</p></article>
      <article className="retreat-note-card retreat-note-fire"><p className="retreat-creative-eyebrow">Then we light the fire.</p><h3>Braai smoke. Dessert. Whisky.</h3><p>Ridiculous conversations. And absolutely no promises about what happens after dark.</p><p className="retreat-hand">well... maybe one or two.</p></article>
    </div></section>

    <section className="retreat-fire-transition"><Image src="/assets/4bonnieHero.png" alt="Cally beside a bonfire" fill sizes="100vw" /><div><p>Eventually, it gets dark.<br />The fire gets lit.<br />The shoes come off.<br />The conversations get less polite.</p><p className="retreat-hand">you coming? →</p></div></section>

    <section className="retreat-cally-scroll-scene"><div className="retreat-cally-sticky-stage"><picture><source media="(max-width: 700px)" srcSet="/assets/11rainwashedCally.png" /><img src="/assets/fullAttentionCally4K.jpeg" alt="Cally sitting in a bright pink chair in a rainy garden" /></picture><div className="retreat-cally-stage-fade" /></div><div className="retreat-cally-scroll-track">
      <div className="retreat-cally-beat retreat-cally-beat-arrival"><p className="retreat-hand">Oh. You came.</p></div>
      <div className="retreat-cally-beat retreat-cally-beat-hunger"><p className="retreat-hand">come hungry.</p></div>
      <div className="retreat-cally-beat retreat-cally-beat-plans"><p className="retreat-hand">I have plans for you.</p></div>
      <div className="retreat-cally-beat retreat-cally-beat-strawberries"><p className="retreat-hand">some of them involve strawberries.</p></div>
      <div className="retreat-cally-beat retreat-cally-beat-showers"><p className="retreat-hand">some involve filthy showers.</p></div>
      <div className="retreat-cally-beat retreat-cally-beat-identity"><div className="retreat-cally-label"><strong>CALLY</strong><span>Founder · Host · <s>Princess</s></span><em>futanari princess ♡</em></div></div>
      <div className="retreat-cally-beat retreat-cally-beat-pampered"><p className="retreat-hand">good girls get pampered.</p></div>
      <div className="retreat-cally-beat retreat-cally-beat-bad"><p className="retreat-hand">bad girls do too. ♡</p></div>
      <div className="retreat-cally-beat retreat-cally-beat-looking"><p className="retreat-hand">still looking?</p></div>
      <div className="retreat-cally-beat retreat-cally-beat-good"><p className="retreat-hand">good.</p></div>
      <div className="retreat-cally-track-end" />
    </div></section>

    <section className="retreat-creative-commercial" id="choose"><div className="retreat-commercial-heading"><p className="retreat-creative-eyebrow">Choose your experience</p><h2>How filthy are we getting?</h2></div><div className="retreat-creative-products">{products.map((item) => <button type="button" key={item.id} className={productId === item.id ? "selected" : ""} aria-pressed={productId === item.id} onClick={() => chooseProduct(item.id)}><span>{item.name}</span><small>{item.name.toLowerCase().includes("awakening") ? "For the curious bits of you that haven\'t had enough room yet. Slower. Softer. Exploratory." : "You already know why you clicked this one. Playful. Indulgent. Mischievous."}</small><i className="retreat-hand">{item.name.toLowerCase().includes("awakening") ? "you don\'t need to know what you\'re looking for. that\'s rather the point. ♡" : "finally. someone who reads instructions properly."}</i></button>)}</div><div className="retreat-creative-configure"><p className="retreat-creative-eyebrow">How do you want to come?</p><div className="retreat-creative-formats">{formats.map((item) => <button type="button" key={item} className={format === item ? "selected" : ""} aria-pressed={format === item} onClick={() => chooseFormat(item)} disabled={!product}>{formatLabels[item]}<small>{item === "solo" ? "Just you?" : item === "couples" ? "Bringing trouble?" : "Bringing several kinds of trouble?"}</small></button>)}</div>{format === "private_group" ? <label className="retreat-creative-guests">Guests<input type="number" min={1} max={50} value={groupGuests} onChange={(event) => { setGroupGuests(Math.min(50, Math.max(1, Number(event.target.value) || 1))); setPrice(null); }} /></label> : null}</div></section>

    <section className="retreat-creative-price" aria-live="polite"><p className="retreat-creative-eyebrow">Three nights.</p>{!product || !format ? <h2>Let the number come later.</h2> : !price || price.key !== priceKey || price.status === "loading" ? <><h2>Finding your current price...</h2><p role="status">Checking the latest three-night estimate.</p></> : price.status === "error" ? <><h2>The number is shy.</h2><p role="alert">The current price could not be loaded. Please try your selection again.</p></> : <><h2>{displayUsd(price.totalUsd!)}</h2><p>Approximate total for {price.nights} nights and {price.guestCount} guest{price.guestCount === 1 ? "" : "s"}. Nothing is booked or charged yet.</p><p className="retreat-hand">still thinking about it, aren&apos;t you? ♡</p></>}</section>
    {priceReady ? <section className="retreat-creative-enquiry"><div><p className="retreat-creative-eyebrow">The next step</p><h2>Tell Cally you&apos;re interested.</h2><p>She will read your note and take it from here.</p></div><InterestForm product={product!} format={format as PrivateFormat} guestCount={guestCount} onBack={() => { setFormat(""); setPrice(null); }} /></section> : null}
    <section className="retreat-creative-after"><p className="retreat-creative-eyebrow">Not ready to run away with me?</p><h2>That&apos;s okay. You can stay close.</h2><p>There is more of Filthy Princess to discover while you decide.</p><div><a href="/inner-sanctum">Look inside the Inner Sanctum</a><a href="/signin?mode=signup">Join free</a></div></section>
  </div>;
}
