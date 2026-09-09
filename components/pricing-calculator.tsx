"use client";

import { useState, useTransition } from "react";
import { calculateEventPrice, calculateRetreatPrice, convertUsdToCurrentEth } from "@/app/actions/pricing";
import { formatLabels, type RetreatFormat } from "@/lib/domain";
import { formatUsd, type CurrentEthConversion, type EventPriceResult, type RetreatPriceResult } from "@/lib/pricing";
import { isPrivateRetreatFormat, type PrivateRetreatFormat } from "@/lib/retreat-availability";

type Product = { id: string; name: string; allowed_formats: RetreatFormat[] };
type Event = { id: string; title: string };
type Result = { mode: "retreat"; price: RetreatPriceResult; eth: CurrentEthConversion } | { mode: "event"; price: EventPriceResult; eth: CurrentEthConversion };

function formatsFor(product: Product | undefined) { return product?.allowed_formats.filter(isPrivateRetreatFormat) ?? []; }

export function PricingCalculator({ products, events }: { products: Product[]; events: Event[] }) {
  const [mode, setMode] = useState<"retreat" | "event">("retreat");
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const product = products.find((item) => item.id === productId);
  const productFormats = formatsFor(product);
  const [format, setFormat] = useState<PrivateRetreatFormat>(productFormats[0] ?? "solo");
  const [groupGuests, setGroupGuests] = useState(1);
  const [nights, setNights] = useState(1);
  const [eventId, setEventId] = useState(events[0]?.id ?? "");
  const [eventGuests, setEventGuests] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const guests = format === "couples" ? 2 : format === "private_group" ? groupGuests : 1;

  function resetResult() { setResult(null); setError(""); }

  function changeMode(nextMode: "retreat" | "event") { setMode(nextMode); resetResult(); }

  function changeProduct(nextProductId: string) {
    const nextProduct = products.find((item) => item.id === nextProductId);
    setProductId(nextProductId);
    setFormat(formatsFor(nextProduct)[0] ?? "solo");
    resetResult();
  }

  function calculate() {
    resetResult();
    startTransition(async () => {
      if (mode === "retreat") {
        const response = await calculateRetreatPrice({ productId, format, guests, nights });
        if (!response.price) { setError(response.error ?? "Pricing could not be calculated."); return; }
        const eth = await convertUsdToCurrentEth({ usdTotal: response.price.totalUsd });
        setResult({ mode: "retreat", price: response.price, eth });
      } else {
        const response = await calculateEventPrice({ eventId, guests: eventGuests });
        if (!response.price) { setError(response.error ?? "Pricing could not be calculated."); return; }
        const eth = await convertUsdToCurrentEth({ usdTotal: response.price.totalUsd });
        setResult({ mode: "event", price: response.price, eth });
      }
    });
  }

  return <section className="admin-panel pricing-calculator">
    <div><p className="eyebrow">Standalone calculator</p><h2>Price Calculator</h2><p className="muted">USD is authoritative. ETH is a current informational conversion and is not saved.</p></div>
    <div className="pricing-mode" role="group" aria-label="Pricing mode"><button type="button" className={mode === "retreat" ? "active" : ""} aria-pressed={mode === "retreat"} onClick={() => changeMode("retreat")}>Retreat</button><button type="button" className={mode === "event" ? "active" : ""} aria-pressed={mode === "event"} onClick={() => changeMode("event")}>Special Event</button></div>

    {mode === "retreat" ? <div className="pricing-inputs">
      <label>Experience<select value={productId} onChange={(event) => changeProduct(event.target.value)}>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Package<select value={format} onChange={(event) => { setFormat(event.target.value as PrivateRetreatFormat); resetResult(); }}>{productFormats.map((item) => <option key={item} value={item}>{formatLabels[item]}</option>)}</select></label>
      {format === "private_group" ? <label>Guests<input type="number" min={1} max={50} value={groupGuests} onChange={(event) => { setGroupGuests(Number(event.target.value)); resetResult(); }} /></label> : <label>Guests<input value={guests} readOnly aria-describedby="fixed-guests" /><span id="fixed-guests" className="field-help">Fixed by package</span></label>}
      <label>Nights<select value={nights} onChange={(event) => { setNights(Number(event.target.value)); resetResult(); }}><option value={1}>1 night</option><option value={2}>2 nights</option><option value={3}>3 nights</option><option value={5}>5 nights</option></select></label>
    </div> : <div className="pricing-inputs">
      <label>Event<select value={eventId} onChange={(event) => { setEventId(event.target.value); resetResult(); }}>{events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label>Guests<input type="number" min={1} max={50} value={eventGuests} onChange={(event) => { setEventGuests(Number(event.target.value)); resetResult(); }} /></label>
    </div>}

    <button className="button" type="button" onClick={calculate} disabled={pending || (mode === "retreat" ? !productId : !eventId)}>{pending ? "Calculating…" : "Calculate Price"}</button>
    {error && <p className="form-error" role="alert">{error}</p>}
    {result && <div className="pricing-result" aria-live="polite">
      <dl>
        <div><dt>Configured rate</dt><dd>{formatUsd(result.mode === "retreat" ? result.price.rateUsdPerPersonPerNight : result.price.rateUsdPerPerson)} <small>{result.mode === "retreat" ? "/ person / night" : "/ person"}</small></dd></div>
        <div><dt>Guests</dt><dd>{result.price.guests}</dd></div>
        {result.mode === "retreat" && <div><dt>Nights</dt><dd>{result.price.nights}</dd></div>}
        <div className="pricing-total"><dt>USD Total</dt><dd>{formatUsd(result.price.totalUsd)}</dd></div>
      </dl>
      {result.eth.available ? <div className="eth-result"><span>Current ETH equivalent</span><strong>{result.eth.ethAmount} ETH</strong><small>1 ETH = {formatUsd(result.eth.ethPriceUsd)}</small></div> : <p className="muted">Current ETH conversion unavailable.</p>}
    </div>}
  </section>;
}
