"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { getCalendarArrivalAvailability } from "@/app/actions/availability";
import { submitEnquiry, submitGeneralEnquiry, type EnquiryState, type GeneralEnquiryState } from "@/app/actions/enquiries";
import { formatDate, formatLabels, type RetreatFormat } from "@/lib/domain";
import { isPrivateRetreatFormat, type CalendarArrivalAvailability, type PrivateRetreatFormat } from "@/lib/retreat-availability";
import { calculateRetreatDates, dateOnlyMonthBounds, dateOnlyMonthGrid, dateOnlyToUtc, shiftDateOnlyMonth } from "@/lib/retreat-dates";
import { SubmitButton } from "./submit-button";

type Product = { id: string; name: string; positioning: string; allowed_formats: RetreatFormat[] };

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthLabel(month: string) {
  return new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" }).format(dateOnlyToUtc(`${month}-01`));
}

function privateFormats(product: Product | undefined) {
  return product?.allowed_formats.filter(isPrivateRetreatFormat) ?? [];
}

function EnquiryForm({ product, format, guestCount, stay, onAvailabilityChanged }: { product: Product; format: PrivateRetreatFormat; guestCount: number; stay: CalendarArrivalAvailability; onAvailabilityChanged: () => void }) {
  const [state, action] = useActionState<EnquiryState, FormData>(submitEnquiry, {});
  if (state.success && state.submitted) return <section className="success-panel enquiry-success" aria-live="polite">
    <p className="eyebrow">Enquiry received</p><h2>Thank you. Cally will be in touch.</h2>
    <p><strong>{product.name}</strong> · {formatLabels[state.submitted.format]} · {state.submitted.guestCount} guest{state.submitted.guestCount === 1 ? "" : "s"}</p>
    <p>Arrival {formatDate(state.submitted.arrival)} · {state.submitted.nights} night{state.submitted.nights === 1 ? "" : "s"} · Checkout {formatDate(state.submitted.checkout)}</p>
    <p>Your enquiry has been received and Cally will review your retreat request. These requested dates are not reserved until your booking is confirmed.</p>
  </section>;

  const canonicalDates = calculateRetreatDates(stay.arrival, stay.nights);
  return <section className="panel enquiry-panel">
    <p className="eyebrow">Tell us about you</p><h2>Send your enquiry</h2><p className="muted enquiry-intro">Share the best way for Cally to contact you about this stay.</p>
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
      <p className="muted full-span enquiry-submit-note">Sending an enquiry does not reserve these dates.</p>
      {state.error && <div className="full-span" role="alert"><p className="form-error">{state.error}</p>{state.availabilityChanged && <button className="text-button" type="button" onClick={onAvailabilityChanged}>Refresh availability and choose another date</button>}</div>}
      <div className="full-span"><SubmitButton>Send Enquiry</SubmitButton></div>
    </form>
  </section>;
}

function GeneralEnquiryForm({ onChooseStay }: { onChooseStay: () => void }) {
  const [state, action] = useActionState<GeneralEnquiryState, FormData>(submitGeneralEnquiry, {});

  if (state.success) return <section className="success-panel enquiry-success" aria-live="polite">
    <p className="eyebrow">Enquiry received</p><h2>Thank you. Cally will be in touch.</h2>
    <p>Your enquiry has been received. Cally will be in touch with more information.</p>
  </section>;

  return <section className="panel enquiry-panel general-enquiry-panel">
    <button className="text-button general-enquiry-back" type="button" onClick={onChooseStay}>Choose a retreat instead</button>
    <p className="eyebrow">General Enquiry</p><h2>Let&apos;s help you find your retreat</h2>
    <p className="muted enquiry-intro">Not ready to choose your retreat yet? Tell us how to reach you and Cally will send you more information.</p>
    <form action={action} className="form-grid">
      <label>Your Name<input name="full_name" autoComplete="name" minLength={2} maxLength={200} required /></label>
      <label>Email<input name="email" type="email" autoComplete="email" maxLength={320} required /></label>
      <label>WhatsApp / Phone<input name="phone" type="tel" autoComplete="tel" minLength={3} maxLength={100} required /></label>
      <label>Country<input name="country" autoComplete="country-name" minLength={2} maxLength={100} required /></label>
      <label className="full-span">Anything you&apos;d like Cally to know?<textarea name="message" rows={5} maxLength={2000} /></label>
      {state.error && <p className="form-error full-span" role="alert">{state.error}</p>}
      <div className="full-span"><SubmitButton>Send Enquiry</SubmitButton></div>
    </form>
  </section>;
}

export function RetreatExplorer({ products, initialMonth }: { products: Product[]; initialMonth: string }) {
  const [mode, setMode] = useState<"stay" | "general">("stay");
  const [productId, setProductId] = useState("");
  const product = products.find((item) => item.id === productId);
  const formats = privateFormats(product);
  const [format, setFormat] = useState<PrivateRetreatFormat | "">("");
  const [nights, setNights] = useState(1);
  const [privateGroupGuests, setPrivateGroupGuests] = useState(1);
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
  const selected = selectedDate ? availabilityByDate.get(selectedDate) : undefined;
  const queryKey = `${productId}:${format}:${guestCount}:${nights}:${month}:${refreshVersion}`;
  const ready = mode === "stay" && Boolean(productId && format);
  const loading = ready && loadedKey !== queryKey;

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
    setProductId(nextProductId);
    setFormat("");
    setSelectedDate("");
    setError("");
  }

  function chooseFormat(nextFormat: PrivateRetreatFormat) {
    setFormat(nextFormat);
    setPrivateGroupGuests(1);
    setSelectedDate("");
    setError("");
  }

  function changeNights(nextNights: number) {
    setNights(nextNights);
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

  if (mode === "general") return <div className="retreat-flow"><GeneralEnquiryForm onChooseStay={() => setMode("stay")} /></div>;

  return <div className="retreat-flow">
    <div className="step-grid">
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
        {format === "private_group" && <label>Guests<input type="number" min={1} max={50} value={privateGroupGuests} onChange={(event) => { setPrivateGroupGuests(Number(event.target.value)); setSelectedDate(""); setError(""); }} /></label>}
      </section>
    </div>

    <section className="panel availability-panel">
      <div className="availability-heading">
        <div><span className="step-number">3</span><h2>When would you like to come?</h2><p className="muted">Choose the number of nights, then select any available arrival date. Dates inside the 14-day notice period are unavailable.</p></div>
        <label>Nights<select value={nights} onChange={(event) => changeNights(Number(event.target.value))}><option value={1}>1 night</option><option value={2}>2 nights</option><option value={3}>3 nights</option><option value={5}>5 nights</option></select></label>
      </div>

      {!ready && <div className="calendar-prompt"><p>Choose a retreat and private format to view availability.</p></div>}
      {ready && <div className="public-calendar" aria-busy={loading}>
        <div className="calendar-toolbar">
          <button className="button small secondary" type="button" onClick={() => navigateMonth(-1)} disabled={month <= initialMonth}>Previous</button>
          <div><h3>{monthLabel(month)}</h3><p className="muted">Each date reflects availability for the complete {nights}-night stay.</p></div>
          <button className="button small secondary" type="button" onClick={() => navigateMonth(1)}>Next</button>
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

    {selected && product && format && <section ref={selectedStayRef} className="panel selected-stay" aria-live="polite" tabIndex={-1}>
      <p className="eyebrow">Your retreat request</p><h2>Selected Stay</h2>
      <p className="selected-stay-context"><strong>{product.name}</strong><span>{formatLabels[format]}</span></p>
      <dl className="stay-summary"><div><dt>Arrival</dt><dd>{formatDate(selected.arrival)}</dd></div><div><dt>Nights</dt><dd>{selected.nights}</dd></div><div><dt>Checkout</dt><dd>{formatDate(selected.checkout)}</dd></div><div><dt>Guests</dt><dd>{guestCount}</dd></div></dl>
    </section>}
    {selected && product && format && <EnquiryForm key={`${product.id}:${format}:${guestCount}:${selected.arrival}:${selected.nights}`} product={product} format={format} guestCount={guestCount} stay={selected} onAvailabilityChanged={refreshAfterAvailabilityChange} />}
  </div>;
}
