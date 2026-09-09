export type RetreatDates = { arrivalDate: string; occupiedEndDate: string; checkoutDate: string; nights: number };

export function dateOnlyToUtc(value: string) { const [y, m, d] = value.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }
export function utcToDateOnly(value: Date) { return value.toISOString().slice(0, 10); }
export function addDateOnlyDays(value: string, days: number) { const date = dateOnlyToUtc(value); date.setUTCDate(date.getUTCDate() + days); return utcToDateOnly(date); }

export function shiftDateOnlyMonth(month: string, offset: number) {
  const date = dateOnlyToUtc(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return utcToDateOnly(date).slice(0, 7);
}

export function dateOnlyMonthBounds(month: string) {
  const first = dateOnlyToUtc(`${month}-01`);
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  return { start: utcToDateOnly(first), end: utcToDateOnly(last) };
}

export function dateOnlyMonthGrid(month: string) {
  const bounds = dateOnlyMonthBounds(month);
  const first = dateOnlyToUtc(bounds.start);
  const last = dateOnlyToUtc(bounds.end);
  const start = addDateOnlyDays(bounds.start, -first.getUTCDay());
  const end = addDateOnlyDays(bounds.end, 6 - last.getUTCDay());
  const days: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addDateOnlyDays(cursor, 1)) days.push(cursor);
  return days;
}

export function calculateRetreatDates(arrivalDate: string, nights: number): RetreatDates {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(arrivalDate) || !Number.isInteger(nights) || nights <= 0) throw new Error("Arrival and a positive number of nights are required");
  return { arrivalDate, occupiedEndDate: addDateOnlyDays(arrivalDate, nights - 1), checkoutDate: addDateOnlyDays(arrivalDate, nights), nights };
}

export function retreatDatesFromInclusiveRange(startDate: string, endDate: string | null): RetreatDates {
  const occupiedEndDate = endDate ?? startDate;
  const nights = Math.round((dateOnlyToUtc(occupiedEndDate).getTime() - dateOnlyToUtc(startDate).getTime()) / 86400000) + 1;
  if (nights <= 0) throw new Error("End date must be on or after arrival date");
  return { arrivalDate: startDate, occupiedEndDate, checkoutDate: addDateOnlyDays(occupiedEndDate, 1), nights };
}

export function inclusiveEndFromCheckout(arrivalDate: string, checkoutDate: string) {
  const nights = Math.round((dateOnlyToUtc(checkoutDate).getTime() - dateOnlyToUtc(arrivalDate).getTime()) / 86400000);
  if (nights <= 0) throw new Error("Checkout must be after arrival");
  return calculateRetreatDates(arrivalDate, nights);
}
