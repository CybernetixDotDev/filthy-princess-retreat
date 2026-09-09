"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { getPublicRetreatPrice, type PublicRetreatPrice } from "@/app/actions/pricing";
import { RetreatExplorer } from "@/components/retreat-explorer";
import type { RetreatFormat } from "@/lib/domain";
import type { PrivateRetreatFormat } from "@/lib/retreat-availability";

type Product = { id: string; name: string; positioning: string; allowed_formats: RetreatFormat[] };
const formatChoices = [
  { value: "solo" as const, title: "Come alone", lead: "Solo.", copy: "The experience revolves around you." },
  { value: "couples" as const, title: "Bring someone", lead: "Couples.", copy: "Come explore together." },
  { value: "private_group" as const, title: "Bring your people", lead: "Private Group.", copy: "Your people. Your retreat. Nobody else invited." },
];

function formatPublicUsd(value: string) {
  const amount = Number(value);
  const wholeDollar = Number.isInteger(amount);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: wholeDollar ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
}

export function RetreatWireframe({ products, initialMonth }: { products: Product[]; initialMonth: string }) {
  const [productId, setProductId] = useState("");
  const [format, setFormat] = useState<PrivateRetreatFormat | "">("");
  const [groupGuests, setGroupGuests] = useState(3);
  const [priceState, setPriceState] = useState<{ key: string; status: "ready" | "error"; price?: PublicRetreatPrice } | null>(null);
  const formatRef = useRef<HTMLElement>(null);
  const commercialRef = useRef<HTMLElement>(null);
  const privateProducts = products.filter((item) => item.allowed_formats.some((itemFormat) => ["solo", "couples", "private_group"].includes(itemFormat)));
  const guests = format === "couples" ? 2 : format === "private_group" ? groupGuests : format === "solo" ? 1 : 0;
  const selectedProduct = privateProducts.find((item) => item.id === productId);
  const selectionReady = Boolean(selectedProduct && format && guests);
  const priceKey = selectionReady ? `${productId}:${format}:${guests}` : "";
  const currentPriceState = priceState?.key === priceKey ? priceState : null;

  useEffect(() => {
    if (!selectionReady || !format) {
      return;
    }
    const requestKey = `${productId}:${format}:${guests}`;
    let current = true;
    void getPublicRetreatPrice({ productId, format, guestCount: guests }).then((result) => {
      if (!current) return;
      setPriceState(result.price ? { key: requestKey, status: "ready", price: result.price } : { key: requestKey, status: "error" });
    }).catch(() => {
      if (current) setPriceState({ key: requestKey, status: "error" });
    });
    return () => { current = false; };
  }, [format, guests, productId, selectionReady]);

  function chooseProduct(nextId: string) { setProductId(nextId); setFormat(""); setPriceState(null); }
  function chooseFormat(next: PrivateRetreatFormat) { setFormat(next); setPriceState(null); }

  return <main className="retreat-wireframe">
    <section className="wire-hero wire-hero-real"><Image className="wire-hero-background" src="/assets/silkSanctuary.png" alt="" fill sizes="100vw" priority /><div className="wire-hero-shade" aria-hidden="true" /><div className="wire-hero-inner"><div className="wire-hero-copy"><p className="eyebrow">A private retreat beyond ordinary life</p><h1>Apparently, this place exists.</h1><p className="lead">A private retreat somewhere beyond ordinary life.</p><p>Curiosity is encouraged.<br />Messy is delicious.<br />Nobody is asking you to behave.</p><p className="wire-question">What would you do if you were invited?</p><button className="button wire-editorial-cta" type="button" onClick={() => document.getElementById("wire-reveal")?.scrollIntoView({ behavior: "smooth" })}>Show me</button></div><div className="wire-logo-stage"><Image className="wire-logo" src="/assets/FilthyPrincessLogo.png" alt="Filthy Princess" width={520} height={330} /></div></div></section>
    <section id="wire-reveal" className="wire-section wire-reveal"><p className="eyebrow">The reveal</p><h2>Yes. It&apos;s real.</h2><div className="wire-two-column"><div><p className="lead">A private retreat, hosted by Cally. Deliberately small. Personal. Intimate.</p><p className="wire-line">Three nights.</p></div><div><p>Not a resort.<br />Not a conference.<br />Not a beige wellness weekend.</p><p className="wire-line">Come alone.<br />Come together.<br />Or bring people you trust.</p></div></div></section>
    <section className="wire-section wire-cally"><div className="wire-portrait-real"><Image src="/assets/callyPortrait2.png" alt="Cally" width={900} height={1100} /></div><div><p className="eyebrow">The person behind it</p><h2>And then there&apos;s Cally.</h2><p className="lead">Your hostess.<br />Your guide.<br />Occasional bad influence.</p><p>And probably the reason Filthy Princess feels unlike anywhere else you&apos;ve stayed.</p><p>She&apos;ll look after you.<br />What happens after that depends somewhat on why you came.</p><Link className="button secondary" href="/cally">Meet Cally</Link></div></section>
    <section className="wire-section" ref={formatRef}><p className="eyebrow">Experience selection</p><h2>Choose your trouble.</h2><div className="wire-choice-grid">{privateProducts.map((item, index) => { const selected = productId === item.id; const awakening = item.name.toLowerCase().includes("awakening"); return <button type="button" className={`wire-choice ${selected ? "selected" : ""}`} key={item.id} onClick={() => chooseProduct(item.id)} aria-pressed={selected}><span className="wire-choice-number">0{index + 1}</span><h3>{item.name}</h3><strong>{awakening ? "You are the centre of this one." : "This one is a little less innocent."}</strong><p>{awakening ? "Curiosity. Exploration. Permission. Self-discovery. Conversations. Parts of yourself you don't normally get to explore. Cally guides." : "Playful. Adventurous. Experiential. Mischievous. For when ordinary isn't quite scratching the itch. Cally hosts."}</p><span className="wire-choice-cta">{awakening ? "I want to explore" : "That sounds dangerous"}</span></button>; })}</div></section>
    <section className="wire-section" ref={commercialRef}><p className="eyebrow">Format selection</p><h2>How do you want to come?</h2><div className="wire-format-grid">{formatChoices.map((choice) => <button type="button" className={`wire-format ${format === choice.value ? "selected" : ""}`} key={choice.value} onClick={() => chooseFormat(choice.value)} aria-pressed={format === choice.value}><h3>{choice.title}</h3><strong>{choice.lead}</strong><p>{choice.copy}</p></button>)}</div>{format === "private_group" && <label className="wire-group-count">How many guests?<input type="number" min={1} max={50} value={groupGuests} onChange={(event) => { setGroupGuests(Math.max(1, Math.min(50, Number(event.target.value)))); setPriceState(null); }} /></label>}</section>
    <section className="wire-section wire-summary"><p className="eyebrow">Your retreat</p><h2>So...</h2>{selectionReady && selectedProduct ? <><p className="wire-summary-line"><strong>{selectedProduct.name}.</strong><br /><strong>{format === "solo" ? "Just you." : format === "couples" ? "The two of you." : `${guests} of you.`}</strong><br /><strong>Three nights.</strong></p><div className="wire-price-reveal" aria-live="polite"><span>Your private retreat</span>{priceState?.key !== priceKey ? <p className="wire-price-status">Finding your current price…</p> : priceState.status === "ready" && priceState.price ? <strong>{formatPublicUsd(priceState.price.totalUsd)}</strong> : <p className="wire-price-status">Price currently unavailable — Cally can confirm it with you.</p>}<small>{format === "solo" ? "one guest" : format === "couples" ? "for two guests" : `for ${guests} guests`} · three nights</small></div></> : <p className="lead">Choose an experience and who you&apos;re bringing. Then we&apos;ll show you the shape of your three-night retreat.</p>}</section>
    <section className="wire-section wire-escape-intro"><p className="eyebrow">The practical part</p><h2>Still curious?</h2><p className="lead">Good.</p><p>Let&apos;s see when you could disappear.</p><h2>Find your escape.</h2><p>Changed your mind? That&apos;s allowed. You can adjust your choices before selecting your date.</p></section>
    <section className="wire-commercial" id="wire-commercial"><RetreatExplorer presentation="retreat-sales" products={products} initialMonth={initialMonth} initialProductId={productId} initialFormat={format} initialNights={3} initialPrivateGroupGuests={groupGuests} retreatSalesPriceStatus={!selectionReady || !currentPriceState ? "loading" : currentPriceState.status} retreatSalesPriceLabel={currentPriceState?.price ? formatPublicUsd(currentPriceState.price.totalUsd) : undefined} onRetreatSalesProductChange={chooseProduct} onRetreatSalesFormatChange={chooseFormat} onRetreatSalesGuestCountChange={(value) => { setGroupGuests(Math.max(1, Math.min(50, value))); setPriceState(null); }} /></section>
    <section className="wire-section wire-experience"><p className="eyebrow">The shape of the stay</p><h2>What actually happens there?</h2><p className="lead">I&apos;m not giving you an itinerary.</p><p>That would rather spoil it.</p><div className="wire-list">{["Private accommodation", "Time with Cally", "A proper South African braai, prepared by Cally — with a few filthy surprises.", "Long conversations", "Space to explore", "Time to yourself", "A few surprises", "No compulsory group activities", "Definitely no motivational workbook"].map((item) => <span key={item}>{item}</span>)}</div><p className="wire-line">Some things are planned.<br /><br />Some things depend on you.<br /><br />And some things are much more fun when you don&apos;t know they&apos;re coming.</p></section>
    <section className="wire-section"><p className="eyebrow">Reassurance</p><h2>Before you ask...</h2><div className="wire-faq">{[["Is this a sex party?", "No."], ["Do I have to do anything I don't want to?", "Absolutely not."], ["Is it private?", "Very."], ["Can I come alone?", "Yes."], ["Can couples come?", "Absolutely."], ["Can I bring my own private group?", "Yes."], ["Where is it?", "The Garden Route, South Africa. I'll keep the exact location to myself until the right moment. Some things are better discovered than pinned to a map."]].map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div><button className="button secondary wire-return" type="button" onClick={() => commercialRef.current?.scrollIntoView({ behavior: "smooth" })}>Still thinking about it? Find your escape</button></section>
  </main>;
}
