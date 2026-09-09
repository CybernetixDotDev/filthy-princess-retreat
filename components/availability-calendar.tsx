"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createAvailability } from "@/app/actions/admin";
import { formatDate, formatLabels, type RetreatFormat } from "@/lib/domain";
import { availabilityRuleAppliesToSelection, bookingOccupiesDate, dateInInclusiveRange, isPrivateRetreatFormat, type OccupyingBooking } from "@/lib/retreat-availability";
import { dateOnlyMonthGrid, dateOnlyToUtc, shiftDateOnlyMonth, utcToDateOnly } from "@/lib/retreat-dates";
import { SubmitButton } from "./submit-button";

type Product = { id: string; name: string; allowed_formats: RetreatFormat[] };
type Availability = { id: string; retreat_product_id: string | null; retreat_format: RetreatFormat | null; start_date: string; end_date: string; state: "available" | "blocked"; capacity: number | null };
type Event = { id: string; title: string; retreat_product_id: string; retreat_format: RetreatFormat; start_date: string; end_date: string; capacity: number; available_places: number; status: "draft" | "published" | "full" | "cancelled" | "completed"; description: string | null };
type Booking = OccupyingBooking & { id: string; enquiry_id: string | null; retreat_product_id: string; retreat_type_name: string; retreat_format: RetreatFormat; guest_count: number; payment_status: string };
type Hold = { id: string; quote_id: string; enquiry_id: string; retreat_product_id: string; retreat_format: RetreatFormat; start_date: string; end_date: string | null; guest_count: number; retreat_event_id: string | null; status: "active" | "released" | "expired" | "converted"; expires_at: string | null };
type CalendarState = "none" | "available" | "partial" | "blocked" | "booked" | "held" | "event";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const formats = ["solo", "couples", "private_group", "join_a_group"] as const;

function formatMonth(month: string) {
  return new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" }).format(dateOnlyToUtc(`${month}-01`));
}

function monthLink(month: string) { return `/admin/availability?month=${month}`; }

function isEffectiveHold(hold: Hold) {
  return hold.status === "active" && (hold.expires_at === null || new Date(hold.expires_at).getTime() > Date.now()) && hold.retreat_event_id === null;
}

function stateForDay(day: string, rows: Availability[], products: Product[], bookings: Booking[], holds: Hold[], events: Event[]): CalendarState {
  if (bookings.some((booking) => bookingOccupiesDate(booking, day))) return "booked";
  if (events.some((event) => event.status === "published" && dateInInclusiveRange(day, event.start_date, event.end_date))) return "event";
  if (holds.some((hold) => isEffectiveHold(hold) && dateInInclusiveRange(day, hold.start_date, hold.end_date))) return "held";

  const combinations = products.flatMap((product) => product.allowed_formats.map((format) => ({ productId: product.id, format })));
  const states = combinations.map(({ productId, format }) => {
    const matching = rows.filter((row) => dateInInclusiveRange(day, row.start_date, row.end_date) && availabilityRuleAppliesToSelection(row.retreat_product_id, row.retreat_format, productId, format));
    if (matching.some((row) => row.state === "blocked")) return "blocked";
    if (matching.some((row) => row.state === "available" && (row.capacity === null || row.capacity > 0))) return "available";
    return "none";
  });
  if (!states.some((state) => state !== "none")) return "none";
  if (states.every((state) => state === "available")) return "available";
  if (!states.includes("available") && states.some((state) => state === "blocked")) return "blocked";
  return "partial";
}

function stateLabel(state: CalendarState) {
  return ({ none: "Not configured", available: "Available", partial: "Partially available", blocked: "Blocked", booked: "Booked", held: "Held", event: "Event" })[state];
}

export function AvailabilityCalendar({ month, products, availability, events, bookings, holds = [] }: { month: string; products: Product[]; availability: Availability[]; events: Event[]; bookings: Booking[]; holds?: Hold[] }) {
  const [productFilter, setProductFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState<RetreatFormat | "all">("all");
  const [selectedDate, setSelectedDate] = useState(`${month}-01`);
  const visibleProducts = useMemo(() => products.filter((product) => productFilter === "all" || product.id === productFilter).map((product) => ({ ...product, allowed_formats: formatFilter === "all" ? product.allowed_formats : product.allowed_formats.filter((format) => format === formatFilter) })), [formatFilter, productFilter, products]);
  const filteredAvailability = useMemo(() => availability.filter((row) => (productFilter === "all" || row.retreat_product_id === null || row.retreat_product_id === productFilter) && (formatFilter === "all" || row.retreat_format === null || row.retreat_format === formatFilter)), [availability, formatFilter, productFilter]);
  const filteredEvents = useMemo(() => events.filter((event) => event.status === "published" && (productFilter === "all" || event.retreat_product_id === productFilter) && (formatFilter === "all" || event.retreat_format === formatFilter)), [events, formatFilter, productFilter]);
  const filteredBookings = useMemo(() => formatFilter === "join_a_group" ? [] : bookings.filter((booking) => isPrivateRetreatFormat(booking.retreat_format)), [bookings, formatFilter]);
  const filteredHolds = useMemo(() => formatFilter === "join_a_group" ? [] : holds.filter(isEffectiveHold), [formatFilter, holds]);
  const days = useMemo(() => dateOnlyMonthGrid(month), [month]);
  const selectedRows = filteredAvailability.filter((row) => dateInInclusiveRange(selectedDate, row.start_date, row.end_date));
  const selectedEvents = filteredEvents.filter((event) => dateInInclusiveRange(selectedDate, event.start_date, event.end_date));
  const selectedBookings = filteredBookings.filter((booking) => bookingOccupiesDate(booking, selectedDate));
  const selectedHolds = filteredHolds.filter((hold) => dateInInclusiveRange(selectedDate, hold.start_date, hold.end_date));
  const selectedState = stateForDay(selectedDate, filteredAvailability, visibleProducts, filteredBookings, filteredHolds, filteredEvents);
  const occupied = selectedState === "booked" || selectedState === "event" || selectedState === "held";
  const todayMonth = utcToDateOnly(new Date()).slice(0, 7);

  return <section className="availability-calendar-panel">
    <div className="availability-filters">
      <label>Retreat<select value={productFilter} onChange={(event) => setProductFilter(event.target.value)}><option value="all">All retreats</option>{products.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}</select></label>
      <label>Format<select value={formatFilter} onChange={(event) => setFormatFilter(event.target.value as RetreatFormat | "all")}><option value="all">All formats</option>{formats.map((format) => <option value={format} key={format}>{formatLabels[format]}</option>)}</select></label>
    </div>
    <div className="calendar-layout">
      <div>
        <div className="calendar-toolbar"><Link className="button small secondary" href={monthLink(shiftDateOnlyMonth(month, -1))} aria-label="Previous month">Previous</Link><div><h2>{formatMonth(month)}</h2><p className="muted">Select a date to inspect its availability and occupancy.</p></div><div className="calendar-toolbar-actions">{month !== todayMonth && <Link className="button small secondary" href={monthLink(todayMonth)}>Today</Link>}<Link className="button small secondary" href={monthLink(shiftDateOnlyMonth(month, 1))} aria-label="Next month">Next</Link></div></div>
        <div className="calendar-legend" aria-label="Availability legend"><span><i className="calendar-dot state-none" />Not configured</span><span><i className="calendar-dot state-available" />Available</span><span><i className="calendar-dot state-partial" />Partial</span><span><i className="calendar-dot state-blocked" />Blocked</span><span><i className="calendar-dot state-booked" />Booked</span><span><i className="calendar-dot state-event" />Event</span><span><i className="calendar-dot state-held" />Held</span></div>
        <div className="calendar-grid" role="grid" aria-label={formatMonth(month)}>{weekdays.map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}{days.map((day) => { const state = stateForDay(day, filteredAvailability, visibleProducts, filteredBookings, filteredHolds, filteredEvents); const outsideMonth = day.slice(0, 7) !== month; return <button type="button" role="gridcell" key={day} className={`calendar-day ${outsideMonth ? "outside-month" : ""} ${selectedDate === day ? "selected" : ""}`} onClick={() => setSelectedDate(day)} aria-label={`${formatDate(day)}: ${stateLabel(state)}`} aria-selected={selectedDate === day}><strong>{dateOnlyToUtc(day).getUTCDate()}</strong><i className={`calendar-dot state-${state}`} /><span className="calendar-day-state">{stateLabel(state)}</span></button>; })}</div>
      </div>
      <aside className="calendar-detail" aria-live="polite"><p className="eyebrow">Selected day</p><h3>{formatDate(selectedDate)}</h3><p className="calendar-state-label">{stateLabel(selectedState)}</p>
        {selectedBookings.map((booking) => <div className="calendar-booking" key={booking.id}><div><strong>Private booking</strong><span>{booking.retreat_type_name} · {formatLabels[booking.retreat_format]}</span><span>{formatDate(booking.start_date)} – {formatDate(booking.end_date ?? booking.start_date)} · {booking.guest_count} guest{booking.guest_count === 1 ? "" : "s"}</span><span>Status: {booking.booking_status}</span></div></div>)}
        {selectedEvents.length > 0 && <div className="calendar-records"><h4>Published events</h4>{selectedEvents.map((event) => <div className="calendar-record" key={event.id}><strong>{event.title}</strong><span>{formatDate(event.start_date)} – {formatDate(event.end_date)}</span><span>Capacity {event.capacity} · {event.available_places} places remaining</span></div>)}</div>}
        {selectedHolds.length > 0 && <div className="calendar-records"><h4>Effective holds</h4>{selectedHolds.map((hold) => <div className="calendar-record" key={hold.id}><strong>{hold.expires_at === null ? "Payment Verified" : "Reserved stay"}</strong><span>{formatDate(hold.start_date)} – {formatDate(hold.end_date ?? hold.start_date)}</span><span>{hold.expires_at === null ? "Protected pending booking" : `Expires ${new Date(hold.expires_at).toLocaleString("en-ZA")}`}</span></div>)}</div>}
        {selectedRows.length ? <div className="calendar-records"><h4>Availability configuration</h4>{selectedRows.map((row) => <div className="calendar-record" key={row.id}><strong>{row.retreat_product_id ? products.find((product) => product.id === row.retreat_product_id)?.name ?? "Retreat" : "Any Retreat"}</strong><span>{row.retreat_format ? formatLabels[row.retreat_format] : "Any Format"} · {row.state === "available" ? "Available" : "Blocked"}</span><span>{formatDate(row.start_date)} – {formatDate(row.end_date)} · {row.capacity ? `Capacity ${row.capacity}` : "No capacity limit"}</span></div>)}</div> : <p className="muted">No availability is configured for this date.</p>}
        {occupied ? <p className="muted calendar-occupancy-note">Occupancy is read-only here. Availability rules do not alter bookings, events, or holds.</p> : <details className="calendar-create"><summary>Add availability for this date</summary><form action={createAvailability} className="stack-form"><input type="hidden" name="start_date" value={selectedDate} /><input type="hidden" name="end_date" value={selectedDate} /><label>Retreat<select name="product_id"><option value="">Any Retreat</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label>Format<select name="retreat_format"><option value="">Any Format</option>{formats.map((format) => <option value={format} key={format}>{formatLabels[format]}</option>)}</select></label><label>State<select name="state"><option value="available">Available</option><option value="blocked">Blocked</option></select></label><label>Capacity (optional)<input type="number" name="capacity" min="1" /></label><SubmitButton>Add availability</SubmitButton></form></details>}
      </aside>
    </div>
  </section>;
}
