"use client";

import { useEffect, useMemo, useState } from "react";
import { getAdminCalendarArrivalAvailability } from "@/app/actions/admin";
import { formatDate } from "@/lib/domain";
import type { CalendarArrivalAvailability, PrivateRetreatFormat } from "@/lib/retreat-availability";
import { dateOnlyMonthBounds, dateOnlyMonthGrid, dateOnlyToUtc, shiftDateOnlyMonth } from "@/lib/retreat-dates";
import { SubmitButton } from "./submit-button";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function currentMonth() { return new Date().toISOString().slice(0, 7); }
function monthLabel(month: string) { return new Intl.DateTimeFormat("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" }).format(dateOnlyToUtc(`${month}-01`)); }

export function AdminRetreatDatePicker({ enquiryId, productId, format, guestCount, hasAgreedDate, onSave }: {
  enquiryId: string;
  productId: string;
  format: PrivateRetreatFormat;
  guestCount: number;
  hasAgreedDate: boolean;
  onSave: (formData: FormData) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(currentMonth);
  const [dates, setDates] = useState<CalendarArrivalAvailability[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [loadedMonth, setLoadedMonth] = useState("");
  const [error, setError] = useState("");
  const days = useMemo(() => dateOnlyMonthGrid(month), [month]);
  const availabilityByDate = useMemo(() => new Map(dates.map((date) => [date.arrival, date])), [dates]);
  const selected = availabilityByDate.get(selectedDate);
  const suggestedDate = dates.find((date) => date.available)?.arrival;
  const loading = open && loadedMonth !== month;

  useEffect(() => {
    if (!open) return;
    let active = true;
    const bounds = dateOnlyMonthBounds(month);
    void getAdminCalendarArrivalAvailability({ productId, format, guestCount, nights: 3, rangeStart: bounds.start, rangeEnd: bounds.end })
      .then((result) => {
        if (!active) return;
        setDates(result.dates);
        setError(result.error ?? "");
        setLoadedMonth(month);
        if (!result.error && !result.dates.some((date) => date.available) && month < "2100-01") setMonth((value) => shiftDateOnlyMonth(value, 1));
      })
      .catch(() => { if (active) { setDates([]); setError("Availability could not be loaded."); setLoadedMonth(month); } });
    return () => { active = false; };
  }, [format, guestCount, month, open, productId]);

  return <section className="admin-panel">
    <h2>Retreat date</h2>
    {!open ? <><p>{hasAgreedDate ? "Choose another available arrival to change this retreat date." : "No date has been agreed yet."}</p><button className="button" type="button" onClick={() => setOpen(true)}>{hasAgreedDate ? "Change date" : "Set retreat date"}</button></> : <form action={onSave} className="stack-form">
      <input type="hidden" name="enquiry_id" value={enquiryId} />
      <input type="hidden" name="arrival_date" value={selectedDate} />
      <div className="calendar-toolbar"><button className="button small secondary" type="button" onClick={() => setMonth((value) => shiftDateOnlyMonth(value, -1))}>Previous</button><div><h3>{monthLabel(month)}</h3><p className="muted">Available arrivals accommodate all 3 nights.</p></div><button className="button small secondary" type="button" onClick={() => setMonth((value) => shiftDateOnlyMonth(value, 1))}>Next</button></div>
      <div className="public-calendar-grid" role="grid" aria-label={monthLabel(month)}>{weekdays.map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}{days.map((day) => {
        const result = availabilityByDate.get(day);
        const available = !loading && day.slice(0, 7) === month && result?.available === true;
        const selectedDay = selectedDate === day;
        const suggested = day === suggestedDate && !selectedDay;
        return <button type="button" role="gridcell" key={day} disabled={!available} className={`public-calendar-day ${available ? "available" : "unavailable"} ${selectedDay ? "selected" : ""} ${suggested ? "suggested" : ""}`} onClick={() => setSelectedDate(day)} aria-label={`${formatDate(day)}: ${selectedDay ? "Selected" : suggested ? "Suggested available arrival" : available ? "Available" : "Unavailable"}`} aria-selected={selectedDay}><strong>{dateOnlyToUtc(day).getUTCDate()}</strong><span className="calendar-status-text">{selectedDay ? "Selected" : suggested ? "Suggested" : available ? "Available" : "Unavailable"}</span></button>;
      })}</div>
      {loading && <p className="muted" role="status">Loading availability...</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {selected && <p><strong>Agreed retreat:</strong> {formatDate(selected.arrival)} to {formatDate(selected.checkout)} · 3 nights</p>}
      <div>{selected && !loading && <SubmitButton>Hold selected stay</SubmitButton>}</div>
    </form>}
  </section>;
}