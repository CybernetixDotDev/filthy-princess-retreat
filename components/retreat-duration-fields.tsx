"use client";

import { useMemo, useState } from "react";
import { calculateRetreatDates, inclusiveEndFromCheckout, retreatDatesFromInclusiveRange } from "@/lib/retreat-dates";

export function RetreatDurationFields({ arrivalDefault = "", occupiedEndDefault = "" }: { arrivalDefault?: string; occupiedEndDefault?: string }) {
  const initialCheckout = arrivalDefault && occupiedEndDefault ? retreatDatesFromInclusiveRange(arrivalDefault, occupiedEndDefault).checkoutDate : "";
  const initialNights = arrivalDefault && occupiedEndDefault ? retreatDatesFromInclusiveRange(arrivalDefault, occupiedEndDefault).nights : 1;
  const preset = [1, 2, 3, 5].includes(initialNights) ? String(initialNights) : "custom";
  const [arrival, setArrival] = useState(arrivalDefault); const [mode, setMode] = useState(preset); const [checkout, setCheckout] = useState(initialCheckout);
  const derived = useMemo(() => { if (!arrival) return null; try { return mode === "custom" ? (checkout ? inclusiveEndFromCheckout(arrival, checkout) : null) : calculateRetreatDates(arrival, Number(mode)); } catch { return null; } }, [arrival, checkout, mode]);
  return <div className="duration-fields"><label>Arrival Date<input type="date" name="start_date" value={arrival} onChange={(e) => setArrival(e.target.value)} required /></label><label>Nights<select name="duration_nights" value={mode} onChange={(e) => setMode(e.target.value)}><option value="1">1 Night</option><option value="2">2 Nights</option><option value="3">3 Nights</option><option value="5">5 Nights</option><option value="custom">Custom</option></select></label>{mode === "custom" && <label>Checkout Date<input type="date" min={arrival ? calculateRetreatDates(arrival, 1).checkoutDate : undefined} value={checkout} onChange={(e) => setCheckout(e.target.value)} required /></label>}<input type="hidden" name="checkout_date" value={checkout} /><input type="hidden" name="end_date" value={derived?.occupiedEndDate ?? occupiedEndDefault} />{derived && <p className="muted full-span">Checkout: {new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${derived.checkoutDate}T00:00:00Z`))}</p>}</div>;
}
