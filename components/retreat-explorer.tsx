"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { getCalendarArrivalAvailability } from "@/app/actions/availability";
import { submitEnquiry, submitGeneralEnquiry, type EnquiryState, type GeneralEnquiryState } from "@/app/actions/enquiries";
import { formatDate, formatLabels, type RetreatFormat } from "@/lib/domain";
import { isPrivateRetreatFormat, type CalendarArrivalAvailability, type PrivateRetreatFormat } from "@/lib/retreat-availability";
import { calculateRetreatDates, dateOnlyMonthBounds, dateOnlyMonthGrid, dateOnlyToUtc, shiftDateOnlyMonth } from "@/lib/retreat-dates";
import { SubmitButton } from "./submit-button";

type Product = { id: string; name: string; positioning: string; allowed_formats: RetreatFormat[] };
type Presentation = "default" | "retreat-sales";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" }).format(dateOnlyToUtc(`${month}-01`));
}

function privateFormats(product: Product | undefined) {
  return product?.allowed_formats.filter(isPrivateRetreatFormat) ?? [];
}

function stayRangeLabel(arrival: string, checkout: string) {
  const arrivalDate = dateOnlyToUtc(arrival);
  const checkoutDate = dateOnlyToUtc(checkout);
  const differentYears = arrivalDate.getUTCFullYear() !== checkoutDate.getUTCFullYear();
  const formatter = new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "long", ...(differentYears ? { year: "numeric" } : {}), timeZone: "UTC" });
  return `${formatter.format(arrivalDate)} — ${formatter.format(checkoutDate)}`;
}

function partyLabel(format: PrivateRetreatFormat, guestCount: number) {
  if (format === "solo") return "Just you";
  if (format === "couples") return "The two of you";
  const words = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
  return `${words[guestCount] || guestCount} of you`;
}

function EnquiryForm({ product, format, guestCount, stay, onAvailabilityChanged, presentation = "default", onSuccess }: { product: Product; format: PrivateRetreatFormat; guestCount: number; stay: CalendarArrivalAvailability; onAvailabilityChanged: () => void; presentation?: Presentation; onSuccess?: () => void }) {
  const [state, action] = useActionState<EnquiryState, FormData>(submitEnquiry, {});
  const retreatSales = presentation === "retreat-sales";
  useEffect(() => { if (state.success && state.submitted) onSuccess?.(); }, [onSuccess, state.success, state.submitted]);
  if (state.success && state.submitted) return <section id={retreatSales ? "retreat-stay-enquiry" : undefined} className={`success-panel enquiry-success ${retreatSales ? "retreat-sales-enquiry-success" : ""}`} aria-live="polite">
    <p className="eyebrow">{retreatSales ? "Cally has your note" : "Enquiry received"}</p><h2>{retreatSales ? "I'll be in touch." : "Thank you. Cally will be in touch."}</h2>
    <p><strong>{product.name}</strong> · {formatLabels[state.submitted.format]} · {state.submitted.guestCount} guest{state.submitted.guestCount === 1 ? "" : "s"}</p>
    <p>Arrival {formatDate(state.submitted.arrival)} · {state.submitted.nights} night{state.submitted.nights === 1 ? "" : "s"} · Checkout {formatDate(state.submitted.checkout)}</p>
    <p>Your enquiry has been received and Cally will review your retreat request. These requested dates are not reserved until your booking is confirmed.</p>
  </section>;

  const canonicalDates = calculateRetreatDates(stay.arrival, stay.nights);
  return <section id={retreatSales ? "retreat-stay-enquiry" : undefined} className={`panel enquiry-panel ${retreatSales ? "retreat-sales-enquiry" : ""}`}>
    <p className="eyebrow">{retreatSales ? "The next step" : "Tell us about you"}</p><h2>{retreatSales ? "Tell Cally you're interested." : "Send your enquiry"}</h2><p className="muted enquiry-intro">{retreatSales ? "This is an enquiry, not a reservation. Your dates are only secured once the booking process is completed." : "Share the best way for Cally to contact you about this stay."}</p>
    <form action={action} className="form-grid">
      <input type="hidden" name="product_id" value={product.id} />
      <input type="hidden" name="retreat_format" value={format} />
      <input type="hidden" name="guest_count" value={guestCount} />
      <input type="hidden" name="arrival_date" value={stay.arrival} />
      <input type="hidden" name="nights" value={stay.nights} />
      <input type="hidden" name="checkout_date" value={stay.checkout} />
      <input type="hidden" name="occupied_end_date" value={canonicalDates.occupiedEndDate} />
      <label>Your Name<input name="full_name" autoComplete="name" minLength={2} maxLength={200} required /></label>
      <label>Email<input name="email" type="email" autoComplete="email" maxLength={320} required /></label>
      <label>WhatsApp / Phone<input name="phone" type="tel" autoComplete="tel" minLength={3} maxLength={100} required /></label>
      <label>Country<input name="country" autoComplete="country-name" minLength={2} maxLength={100} required /></label>
      <label className="full-span">Anything you&apos;d like Cally to know?<textarea name="message" rows={5} maxLength={2000} /></label>
      {!retreatSales && <p className="muted full-span enquiry-submit-note">Sending an enquiry does not reserve these dates.</p>}
      {state.error && <div className="full-span" role="alert"><p className="form-error">{state.error}</p>{state.availabilityChanged && <button className="text-button" type="button" onClick={onAvailabilityChanged}>Refresh availability and choose another date</button>}</div>}
      <div className="full-span"><SubmitButton>{retreatSales ? "Tell Cally I'm interested" : "Send Enquiry"}</SubmitButton></div>
    </form>
  </section>;
}

function GeneralEnquiryForm({ onChooseStay, presentation = "default", onRetreatSalesTakePeek }: { onChooseStay: () => void; presentation?: Presentation; onRetreatSalesTakePeek?: () => void }) {
  const [state, action] = useActionState<GeneralEnquiryState, FormData>(submitGeneralEnquiry, {});
  const retreatSales = presentation === "retreat-sales";

  if (state.success) return <section id={retreatSales ? "retreat-sales-general-enquiry" : undefined} className={`success-panel enquiry-success ${retreatSales ? "retreat-sales-enquiry-success retreat-sales-general-success" : ""}`} aria-live="polite">
    <p className="eyebrow">{retreatSales ? "Got you" : "Enquiry received"}</p><h2>{retreatSales ? "I'll send you a little more about the retreat." : "Thank you. Cally will be in touch."}</h2>
    <p>{retreatSales ? "Cally has your note and will be in touch. Nothing has been booked or reserved." : "Your enquiry has been received. Cally will be in touch with more information."}</p>
    {retreatSales && <div className="retreat-sales-inner-continuation"><p>While you&apos;re waiting for Cally...</p><p>Why not come a little further inside?</p><p>There&apos;s more of me in the Inner Sanctum.</p><button className="retreat-sales-not-ready" type="button" onClick={onRetreatSalesTakePeek}>Take a peek →</button></div>}
  </section>;

  return <section id={retreatSales ? "retreat-sales-general-enquiry" : undefined} className={`panel enquiry-panel general-enquiry-panel ${retreatSales ? "retreat-sales-enquiry retreat-sales-general-enquiry" : ""}`}>
    {!retreatSales && <button className="text-button general-enquiry-back" type="button" onClick={onChooseStay}>Choose a retreat instead</button>}
    <p className="eyebrow">{retreatSales ? "Tell me where to find you" : "General Enquiry"}</p><h2>{retreatSales ? "I'll tell you more." : "Let's help you find your retreat"}</h2>
    <p className="muted enquiry-intro">{retreatSales ? "No dates or retreat decisions required. Just leave the best way to reach you." : "Not ready to choose your retreat yet? Tell us how to reach you and Cally will send you more information."}</p>
    <form action={action} className="form-grid">
      <label>Your Name<input name="full_name" autoComplete="name" minLength={2} maxLength={200} required /></label>
      <label>Email<input name="email" type="email" autoComplete="email" maxLength={320} required /></label>
      <label>WhatsApp / Phone<input name="phone" type="tel" autoComplete="tel" minLength={3} maxLength={100} required /></label>
      <label>Country<input name="country" autoComplete="country-name" minLength={2} maxLength={100} required /></label>
      <label className="full-span">Anything you&apos;d like Cally to know?<textarea name="message" rows={5} maxLength={2000} /></label>
      {state.error && <p className="form-error full-span" role="alert">{state.error}</p>}
      <div className="full-span"><SubmitButton>{retreatSales ? "Tell me more" : "Send Enquiry"}</SubmitButton></div>
    </form>
  </section>;
}

export function RetreatExplorer({ products, initialMonth, initialProductId = "", initialFormat = "", initialNights = 1, initialPrivateGroupGuests = 1, presentation = "default", retreatSalesPriceLabel, retreatSalesPriceStatus = "loading", onRetreatSalesProductChange, onRetreatSalesFormatChange, onRetreatSalesNotReady, onRetreatSalesEnquirySuccess, onRetreatSalesTakePeek }: { products: Product[]; initialMonth: string; initialProductId?: string; initialFormat?: PrivateRetreatFormat | ""; initialNights?: number; initialPrivateGroupGuests?: number; presentation?: Presentation; retreatSalesPriceLabel?: string; retreatSalesPriceStatus?: "loading" | "ready" | "error"; onRetreatSalesProductChange?: (productId: string) => void; onRetreatSalesFormatChange?: (format: PrivateRetreatFormat) => void; onRetreatSalesGuestCountChange?: (guestCount: number) => void; onRetreatSalesNotReady?: () => void; onRetreatSalesEnquirySuccess?: () => void; onRetreatSalesTakePeek?: () => void }) {
  const [mode, setMode] = useState<"stay" | "general">("stay");
  const [localProductId, setLocalProductId] = useState(initialProductId);
  const [localFormat, setLocalFormat] = useState<PrivateRetreatFormat | "">(initialFormat);
  const [localNights, setLocalNights] = useState(initialNights);
  const [localPrivateGroupGuests, setLocalPrivateGroupGuests] = useState(initialPrivateGroupGuests);
  const [changingRetreat, setChangingRetreat] = useState(false);
  const [draftProductId, setDraftProductId] = useState(initialProductId);
  const [draftFormat, setDraftFormat] = useState<PrivateRetreatFormat | "">(initialFormat);
  const [generalEnquiryOpen, setGeneralEnquiryOpen] = useState(false);
  const retreatSales = presentation === "retreat-sales";
  const productId = retreatSales ? initialProductId : localProductId;
  const format = retreatSales ? initialFormat : localFormat;
  const nights = retreatSales ? 3 : localNights;
  const privateGroupGuests = retreatSales ? initialPrivateGroupGuests : localPrivateGroupGuests;
  const product = products.find((item) => item.id === productId);
  const formats = privateFormats(product);
  const draftProduct = products.find((item) => item.id === draftProductId);
  const draftFormats = privateFormats(draftProduct);
  const [month, setMonth] = useState(initialMonth);
  const [dates, setDates] = useState<CalendarArrivalAvailability[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const selectedStayRef = useRef<HTMLElement>(null);

  const guestCount = format === "couples" ? 2 : format === "private_group" ? privateGroupGuests : 1;
  const calendarDays = useMemo(() => dateOnlyMonthGrid(month), [month]);
  const availabilityByDate = useMemo(() => new Map(dates.map((date) => [date.arrival, date])), [dates]);
  const queryKey = `${productId}:${format}:${guestCount}:${nights}:${month}:${refreshVersion}`;
  const ready = mode === "stay" && Boolean(productId && format);
  const loading = ready && loadedKey !== queryKey;
  const selectedResult = selectedDate ? availabilityByDate.get(selectedDate) : undefined;
  const selected = !loading && selectedResult?.available ? selectedResult : undefined;
  const retainedStay = selectedDate ? calculateRetreatDates(selectedDate, nights) : undefined;
  const retainedDateUnavailable = Boolean(selectedDate && ready && !loading && (!selectedResult || !selectedResult.available));

  useEffect(() => {
    if (mode !== "stay" || !productId || !format) return;
    let current = true;
    const bounds = dateOnlyMonthBounds(month);
    void getCalendarArrivalAvailability({ productId, format, nights, guestCount, rangeStart: bounds.start, rangeEnd: bounds.end })
      .then((result) => {
        if (!current) return;
        setDates(result.dates);
        setError(result.error ? "Availability could not be loaded. Please try again." : "");
        setLoadedKey(queryKey);
      })
      .catch(() => {
        if (!current) return;
        setDates([]);
        setError("Availability could not be loaded. Please try again.");
        setLoadedKey(queryKey);
      });
    return () => { current = false; };
  }, [format, guestCount, mode, month, nights, productId, queryKey]);

  useEffect(() => {
    if (!selectedDate) return;
    const frame = window.requestAnimationFrame(() => {
      selectedStayRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      selectedStayRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selectedDate]);

  function chooseProduct(nextProductId: string) {
    if (retreatSales) onRetreatSalesProductChange?.(nextProductId);
    else { setLocalProductId(nextProductId); setLocalFormat(""); }
    setSelectedDate("");
    setError("");
  }

  function chooseFormat(nextFormat: PrivateRetreatFormat) {
    if (retreatSales) onRetreatSalesFormatChange?.(nextFormat);
    else { setLocalFormat(nextFormat); setLocalPrivateGroupGuests(1); }
    setSelectedDate("");
    setError("");
  }

  function changeNights(nextNights: number) {
    setLocalNights(nextNights);
    setSelectedDate("");
    setError("");
  }

  function navigateMonth(offset: number) {
    setMonth(shiftDateOnlyMonth(month, offset));
    setSelectedDate("");
    setError("");
  }

  function refreshAfterAvailabilityChange() {
    setSelectedDate("");
    setError("");
    setRefreshVersion((value) => value + 1);
  }

  function openRetreatEditor() {
    setDraftProductId(productId);
    setDraftFormat(format);
    setChangingRetreat(true);
  }

  function chooseDraftProduct(nextProductId: string) {
    const nextFormats = privateFormats(products.find((item) => item.id === nextProductId));
    setDraftProductId(nextProductId);
    if (draftFormat && !nextFormats.includes(draftFormat)) setDraftFormat("");
  }

  function updateRetreat() {
    if (!draftProductId || !draftFormat) return;
    onRetreatSalesProductChange?.(draftProductId);
    onRetreatSalesFormatChange?.(draftFormat);
    setChangingRetreat(false);
    setError("");
  }

  if (mode === "general") return <div className="retreat-flow"><GeneralEnquiryForm onChooseStay={() => setMode("stay")} /></div>;

  return <div className={`retreat-flow ${retreatSales ? "retreat-sales-flow" : ""}`}>
    {!retreatSales && <div className="step-grid">
      <section className="panel">
        <span className="step-number">1</span><h2>Choose retreat</h2>
        <div className="choice-list">{products.map((item) => <button type="button" key={item.id} className={`choice ${productId === item.id ? "selected" : ""}`} onClick={() => chooseProduct(item.id)} aria-pressed={productId === item.id}><strong>{item.name}</strong><span>{item.positioning}</span></button>)}</div>
        <button className="button secondary general-enquiry-cta" type="button" onClick={() => setMode("general")}>Send me more information</button>
      </section>

      <section className="panel">
        <span className="step-number">2</span><h2>Choose private format</h2>
        {!product && <p className="muted">Choose a retreat to see its private formats.</p>}
        {product && formats.length === 0 && <p className="muted">No private formats are currently available for this retreat.</p>}
        <div className="format-grid">{formats.map((item) => <button type="button" key={item} className={`choice compact ${format === item ? "selected" : ""}`} onClick={() => chooseFormat(item)} aria-pressed={format === item}>{formatLabels[item]}</button>)}</div>
        {format === "solo" && <p className="selection-note">1 guest</p>}
        {format === "couples" && <p className="selection-note">2 guests</p>}
        {format === "private_group" && <label>Guests<input type="number" min={1} max={50} value={privateGroupGuests} onChange={(event) => { setLocalPrivateGroupGuests(Number(event.target.value)); setSelectedDate(""); setError(""); }} /></label>}
      </section>
    </div>}

    <section className={`panel availability-panel ${retreatSales ? "retreat-sales-availability" : ""}`}>
      {!retreatSales && <div className="availability-heading">
        <div><span className="step-number">3</span><h2>When would you like to come?</h2><p className="muted">Choose the number of nights, then select any available arrival date. Dates inside the 14-day notice period are unavailable.</p></div>
        <label>Nights<select value={nights} onChange={(event) => changeNights(Number(event.target.value))}><option value={1}>1 night</option><option value={2}>2 nights</option><option value={3}>3 nights</option><option value={5}>5 nights</option></select></label>
      </div>}

      {retreatSales && <aside className="retreat-sales-soft-conversion">
        <div><p className="eyebrow">Not ready to choose a date?</p><h3>That&apos;s okay.</h3><p>If you&apos;re curious but not ready to disappear just yet, tell me where to find you.</p></div>
        <button className="retreat-sales-soft-cta" type="button" onClick={() => setGeneralEnquiryOpen((value) => !value)} aria-expanded={generalEnquiryOpen} aria-controls="retreat-sales-general-enquiry">{generalEnquiryOpen ? "Close" : "I'm not sure yet — send me more information"}</button>
      </aside>}
      {retreatSales && generalEnquiryOpen && <GeneralEnquiryForm presentation="retreat-sales" onChooseStay={() => setGeneralEnquiryOpen(false)} onRetreatSalesTakePeek={onRetreatSalesTakePeek} />}

      {!ready && <div className="calendar-prompt"><p>Choose a retreat and private format to view availability.</p></div>}
      {ready && <div className="public-calendar" aria-busy={loading}>
        <div className="calendar-toolbar">
          <button className="button small secondary" type="button" onClick={() => navigateMonth(-1)} disabled={month <= initialMonth}>{retreatSales ? "← Previous" : "Previous"}</button>
          <div><h3>{monthLabel(month)}</h3><p className="muted">Each date reflects availability for the complete {nights}-night stay.</p></div>
          <button className="button small secondary" type="button" onClick={() => navigateMonth(1)}>{retreatSales ? "Next →" : "Next"}</button>
        </div>
        <div className="public-calendar-legend" aria-label="Calendar legend"><span><i className="calendar-dot state-available" />Available</span><span><i className="calendar-dot state-none" />Unavailable</span><span><i className="calendar-selected-mark" />Selected</span></div>
        <div className="public-calendar-grid" role="grid" aria-label={monthLabel(month)}>
          {weekdays.map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}
          {calendarDays.map((day) => {
            const result = availabilityByDate.get(day);
            const inMonth = day.slice(0, 7) === month;
            const available = !loading && inMonth && result?.available === true;
            const isSelected = selectedDate === day;
            const status = isSelected ? "Selected" : available ? "Available" : "Unavailable";
            const symbol = isSelected ? "●" : available ? "✓" : "—";
            return <button type="button" role="gridcell" key={day} disabled={!available} className={`public-calendar-day ${!inMonth ? "outside-month" : ""} ${available ? "available" : "unavailable"} ${isSelected ? "selected" : ""}`} onClick={() => setSelectedDate(day)} aria-label={`${formatDate(day)}: ${status}`} aria-selected={isSelected}>
              <strong>{dateOnlyToUtc(day).getUTCDate()}</strong><span className="calendar-status-text">{status}</span><span className="calendar-status-symbol" aria-hidden="true">{symbol}</span>
            </button>;
          })}
        </div>
        {loading && <p className="calendar-feedback muted" role="status">Loading availability…</p>}
        {!loading && error && <p className="calendar-feedback form-error" role="alert">{error}</p>}
        {!loading && !error && dates.length > 0 && !dates.some((date) => date.available) && <p className="calendar-feedback muted">No arrival dates in this month can currently support this complete stay.</p>}
      </div>}
    </section>

    {(retreatSales ? selectedDate && retainedStay : selected) && product && format && (retreatSales ? <section ref={selectedStayRef} className="retreat-sales-selected-stay" aria-live="polite" tabIndex={-1}>
      <p className="eyebrow">This could be yours</p><h2>{product.name}</h2>
      <p className="retreat-sales-selected-party">{formatLabels[format]} <span>·</span> {partyLabel(format, guestCount)} <span>·</span> Three nights</p>
      <p className="retreat-sales-selected-dates">{stayRangeLabel(retainedStay!.arrivalDate, retainedStay!.checkoutDate)}</p>
      {retreatSalesPriceStatus === "ready" && retreatSalesPriceLabel ? <p className="retreat-sales-selected-price">{retreatSalesPriceLabel}</p> : retreatSalesPriceStatus === "error" ? <p className="retreat-sales-selected-price-note">Price currently unavailable — Cally can confirm it with you.</p> : <p className="retreat-sales-selected-price-note" role="status">Finding your current price…</p>}
      <div className="retreat-sales-summary-actions">
        {selected && <button className="button retreat-sales-enquiry-cta" type="button" onClick={() => document.getElementById("retreat-stay-enquiry")?.scrollIntoView({ behavior: "smooth", block: "start" })}>Start my enquiry</button>}
        {selected && <button className="retreat-sales-not-ready" type="button" onClick={onRetreatSalesNotReady}>Not ready yet</button>}
        <button className="retreat-sales-change" type="button" onClick={openRetreatEditor} aria-expanded={changingRetreat}>Change</button>
      </div>
      {changingRetreat && <div className="retreat-sales-editor">
        <fieldset><legend>Experience</legend><div className="retreat-sales-options">{products.map((item) => <button type="button" key={item.id} className={draftProductId === item.id ? "selected" : ""} aria-pressed={draftProductId === item.id} onClick={() => chooseDraftProduct(item.id)}>{item.name}</button>)}</div></fieldset>
        <fieldset><legend>Coming</legend><div className="retreat-sales-options retreat-sales-format-options">{draftFormats.map((item) => <button type="button" key={item} className={draftFormat === item ? "selected" : ""} aria-pressed={draftFormat === item} onClick={() => setDraftFormat(item)}>{formatLabels[item]}</button>)}</div></fieldset>
        <button className="retreat-sales-done" type="button" onClick={updateRetreat} disabled={!draftProductId || !draftFormat}>Update</button>
      </div>}
      {loading && <p className="retreat-sales-date-status" role="status">Checking this date for your updated retreat…</p>}
      {retainedDateUnavailable && <p className="retreat-sales-date-status form-error" role="alert">This retreat is not available for your selected date. Please choose another available date.</p>}
    </section> : <section ref={selectedStayRef} className="panel selected-stay" aria-live="polite" tabIndex={-1}>
      <p className="eyebrow">Your retreat request</p><h2>Selected Stay</h2>
      <p className="selected-stay-context"><strong>{product.name}</strong><span>{formatLabels[format]}</span></p>
      <dl className="stay-summary"><div><dt>Arrival</dt><dd>{formatDate(selected!.arrival)}</dd></div><div><dt>Nights</dt><dd>{selected!.nights}</dd></div><div><dt>Checkout</dt><dd>{formatDate(selected!.checkout)}</dd></div><div><dt>Guests</dt><dd>{guestCount}</dd></div></dl>
    </section>)}
    {selected && product && format && <EnquiryForm key={`${product.id}:${format}:${guestCount}:${selected.arrival}:${selected.nights}`} product={product} format={format} guestCount={guestCount} stay={selected} onAvailabilityChanged={refreshAfterAvailabilityChange} presentation={presentation} onSuccess={retreatSales ? onRetreatSalesEnquirySuccess : undefined} />}
  </div>;
}
