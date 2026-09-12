"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type RefObject } from "react";
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
  const [groupGuestInput, setGroupGuestInput] = useState("3");
  const [sanctumOpen, setSanctumOpen] = useState(false);
  const [enquirySubmitted, setEnquirySubmitted] = useState(false);
  const [priceState, setPriceState] = useState<{ key: string; status: "ready" | "error"; price?: PublicRetreatPrice } | null>(null);
  const formatRef = useRef<HTMLElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const commercialRef = useRef<HTMLElement>(null);
  const continuationRef = useRef<HTMLElement>(null);
  const groupGuestRef = useRef<HTMLInputElement>(null);
  const privateProducts = products.filter((item) => item.allowed_formats.some((itemFormat) => ["solo", "couples", "private_group"].includes(itemFormat)));
  const validGroupGuests = /^\d+$/.test(groupGuestInput) && Number(groupGuestInput) >= 1 && Number(groupGuestInput) <= 50;
  const groupGuests = validGroupGuests ? Number(groupGuestInput) : 0;
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

  useEffect(() => {
    if (!sanctumOpen) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setSanctumOpen(false); };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKeyDown); };
  }, [sanctumOpen]);

  function scrollToSection(target: RefObject<HTMLElement | null>) {
    window.requestAnimationFrame(() => target.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function updateProduct(nextId: string) {
    setProductId(nextId);
    setFormat("");
    setPriceState(null);
  }

  function updateFormat(next: PrivateRetreatFormat) {
    setFormat(next);
    setPriceState(null);
  }

  function chooseProduct(nextId: string) {
    updateProduct(nextId);
    scrollToSection(formatRef);
  }

  function chooseFormat(next: PrivateRetreatFormat) {
    updateFormat(next);
    if (next === "private_group") {
      setGroupGuestInput("");
      window.requestAnimationFrame(() => groupGuestRef.current?.focus({ preventScroll: true }));
      return;
    }
    scrollToSection(summaryRef);
  }

  function scrollToContinuation(submitted: boolean) {
    setEnquirySubmitted(submitted);
    scrollToSection(continuationRef);
  }

  return <main className="retreat-wireframe">
    <section className="wire-hero wire-hero-real"><Image className="wire-hero-background" src="/assets/silkSanctuary.png" alt="" fill sizes="100vw" priority /><div className="wire-hero-shade" aria-hidden="true" /><div className="wire-hero-inner"><div className="wire-hero-copy"><p className="eyebrow">A private retreat beyond ordinary life</p><h1>Apparently, this place exists.</h1><p className="lead">A private retreat somewhere beyond ordinary life.</p><p>Curiosity is encouraged.<br />Messy is delicious.<br />Nobody is asking you to behave.</p><p className="wire-question">What would you do if you were invited?</p><button className="button wire-editorial-cta" type="button" onClick={() => document.getElementById("wire-reveal")?.scrollIntoView({ behavior: "smooth" })}>Show me</button></div><div className="wire-logo-stage"><Image className="wire-logo" src="/assets/FilthyPrincessLogo.png" alt="Filthy Princess" width={520} height={330} /></div></div></section>
    <section id="wire-reveal" className="wire-section wire-reveal"><p className="eyebrow">The reveal</p><h2>Yes. It&apos;s real.</h2><div className="wire-two-column"><div><p className="lead">The thing Cally has been talking about. A private retreat, deliberately small. Personal. Intimate.</p><p className="wire-line">Three nights.</p></div><div><p>Not a resort.<br />Not a conference.<br />Not a beige wellness weekend.</p><p className="wire-line">Come alone.<br />Come together.<br />Or bring people you trust.</p></div></div></section>
    <section className="wire-section"><p className="eyebrow">Experience selection</p><div className="wire-choice-heading"><h2>Choose your trouble.</h2><Image src="/assets/lipstickKiss.png" alt="" width={1536} height={1024} sizes="(max-width: 540px) 150px, 220px" /></div><div className="wire-choice-grid">{privateProducts.map((item, index) => { const selected = productId === item.id; const awakening = item.name.toLowerCase().includes("awakening"); return <button type="button" className={`wire-choice ${selected ? "selected" : ""}`} key={item.id} onClick={() => chooseProduct(item.id)} aria-pressed={selected}><Image className="wire-choice-art" src={awakening ? "/assets/awakening.png" : "/assets/temptation.png"} alt="" fill sizes="(max-width: 800px) calc(100vw - 3rem), 50vw" /><span className="wire-choice-number">0{index + 1}</span><h3>{item.name}</h3><strong>{awakening ? "You are the centre of this one." : "This one is a little less innocent."}</strong><p>{awakening ? "Curiosity. Exploration. Permission. Self-discovery. Conversations. Parts of yourself you don't normally get to explore. Cally guides." : "Playful. Adventurous. Experiential. Mischievous. For when ordinary isn't quite scratching the itch. Cally hosts."}</p><span className="wire-choice-cta">{awakening ? "I want to explore" : "That sounds dangerous"}</span></button>; })}</div></section>
    <section className="wire-section wire-format-section" ref={formatRef}><p className="eyebrow">Format selection</p><h2>How do you want to come?</h2><div className="wire-format-grid">{formatChoices.map((choice) => <button type="button" className={`wire-format ${format === choice.value ? "selected" : ""}`} key={choice.value} onClick={() => chooseFormat(choice.value)} aria-pressed={format === choice.value}><h3>{choice.title}</h3><strong>{choice.lead}</strong><p>{choice.copy}</p></button>)}</div>{format === "private_group" && <label className="wire-group-count">How many guests?<input ref={groupGuestRef} type="number" inputMode="numeric" min={1} max={50} step={1} required value={groupGuestInput} onFocus={(event) => event.currentTarget.select()} onChange={(event) => { setGroupGuestInput(event.target.value); setPriceState(null); }} onKeyDown={(event) => { if (event.key !== "Enter") return; event.preventDefault(); if (validGroupGuests) scrollToSection(summaryRef); else event.currentTarget.reportValidity(); }} aria-invalid={groupGuestInput !== "" && !validGroupGuests} /></label>}</section>
    <section className="wire-section wire-summary" ref={summaryRef}><Image className="wire-summary-logo" src="/assets/FilthyPrincessLogo.png" alt="Filthy Princess" width={1536} height={1024} sizes="(max-width: 540px) min(80vw, 420px), 560px" /><p className="eyebrow">Your retreat</p><h2>So...</h2>{selectionReady && selectedProduct ? <p className="wire-summary-line"><strong>{selectedProduct.name}.</strong><br /><strong>{format === "solo" ? "Just you." : format === "couples" ? "The two of you." : `${guests} of you.`}</strong><br /><strong>Three nights.</strong></p> : <p className="lead">Choose an experience and who you&apos;re bringing. Then we&apos;ll show you the shape of your three-night retreat.</p>}</section>
    <section className="wire-section wire-escape-intro"><p className="eyebrow">The practical part</p><h2>Still curious?</h2><p className="lead">Good.</p><p>Let&apos;s see when you could disappear.</p><h2>Find your escape.</h2><p>Choose your date below</p></section>
    <section className="wire-commercial" id="wire-commercial" ref={commercialRef}><RetreatExplorer presentation="retreat-sales" products={products} initialMonth={initialMonth} initialProductId={productId} initialFormat={format} initialNights={3} initialPrivateGroupGuests={groupGuests || 1} retreatSalesPriceStatus={!selectionReady || !currentPriceState ? "loading" : currentPriceState.status} retreatSalesPriceLabel={currentPriceState?.price ? formatPublicUsd(currentPriceState.price.totalUsd) : undefined} onRetreatSalesProductChange={updateProduct} onRetreatSalesFormatChange={updateFormat} onRetreatSalesNotReady={() => scrollToContinuation(false)} onRetreatSalesEnquirySuccess={() => scrollToContinuation(true)} onRetreatSalesTakePeek={() => setSanctumOpen(true)} /></section>
    <section className="wire-section retreat-epilogue" ref={continuationRef}>{enquirySubmitted ? <div><p className="eyebrow">While you wait</p><h2>Oh. So you are interested.</h2><p>Thank you for showing an interest in me.</p><p>Cally will be in touch.</p><p>In the meantime, you don&apos;t have to disappear.</p><p>Come and have a look inside the Inner Sanctum.</p><p>Stories, games, photographs, little discoveries and pieces of my world while you wait.</p><p className="retreat-epilogue-emphasis">You can stay close in the meantime.</p><a className="retreat-epilogue-link" href="/store">Show me the Inner Sanctum →</a></div> : <div><p className="eyebrow">After the retreat</p><h2>Not ready to run away with me?</h2><p>That&apos;s okay.</p><p>You&apos;ve already come this far.</p><p>Besides.</p><p>You&apos;ve seen rather a lot of me already.</p><p>It would be a shame to become strangers now.</p><button className="retreat-epilogue-link" type="button" onClick={() => setSanctumOpen(true)}>Stay a little longer →</button></div>}</section>
    <section className="wire-section"><p className="eyebrow">Reassurance</p><h2>Before you ask...</h2><div className="wire-faq">{[["Is this a sex party?", "No."], ["Do I have to do anything I don't want to?", "Absolutely not."], ["Is it private?", "Very."], ["Can I come alone?", "Yes."], ["Can couples come?", "Absolutely."], ["Can I bring my own private group?", "Yes."], ["Where is it?", "The Garden Route, South Africa. I'll keep the exact location to myself until the right moment. Some things are better discovered than pinned to a map."]].map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div><button className="button secondary wire-return" type="button" onClick={() => commercialRef.current?.scrollIntoView({ behavior: "smooth" })}>Still thinking about it? Find your escape</button></section>
    {sanctumOpen && <div className="sanctum-reveal-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSanctumOpen(false); }}><section className="sanctum-reveal-modal" role="dialog" aria-modal="true" aria-labelledby="sanctum-reveal-title" tabIndex={-1}><button className="sanctum-reveal-close" type="button" aria-label="Close Inner Sanctum reveal" onClick={() => setSanctumOpen(false)}>×</button><p className="eyebrow">The Inner Sanctum</p><h2 id="sanctum-reveal-title">Some doors lead a little deeper.</h2><div className="sanctum-reveal-copy"><p>This is where Filthy Princess keeps going.</p><p>The stories get stranger.<br />The games get more personal.<br />There are photographs I don&apos;t leave lying around outside.<br />Little interactions, discoveries, gifts and pieces of me.</p><p>And sometimes, if you&apos;re paying attention,<br />an invitation to something real.</p><p>It changes as I do.</p><p>You don&apos;t have to run away with me.</p><p className="sanctum-reveal-close-line">You can just stay close.</p></div><a className="sanctum-reveal-cta" href="/store">Show me the Inner Sanctum →</a></section></div>}
  </main>;
}
