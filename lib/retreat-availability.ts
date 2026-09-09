import type { BookingStatus, RetreatFormat } from "./domain";
import { calculateRetreatDates } from "./retreat-dates";

export const PUBLIC_MINIMUM_LEAD_DAYS = 14;

export type AvailabilityState = "available" | "blocked" | "booked" | "event" | "held" | "not_configured" | "lead_time" | "invalid_request";

export type StayAvailabilityInput = {
  productId: string;
  format: RetreatFormat;
  arrival: string;
  nights: number;
  guestCount?: number;
};

export type StayAvailabilityResult = {
  available: boolean;
  state: AvailabilityState;
  arrival: string;
  nights: number;
  checkout: string;
  occupiedStart: string;
  occupiedEnd: string;
};

export type CalendarArrivalAvailability = StayAvailabilityResult;

export function unavailableStayResult(input: StayAvailabilityInput, state: AvailabilityState): StayAvailabilityResult {
  const dates = calculateRetreatDates(input.arrival, input.nights);
  return { available: false, state, arrival: dates.arrivalDate, nights: dates.nights, checkout: dates.checkoutDate, occupiedStart: dates.arrivalDate, occupiedEnd: dates.occupiedEndDate };
}

export const PRIVATE_RETREAT_FORMATS = ["solo", "couples", "private_group"] as const;
export type PrivateRetreatFormat = (typeof PRIVATE_RETREAT_FORMATS)[number];

export function availabilityRuleAppliesToSelection(
  ruleProductId: string | null,
  ruleFormat: RetreatFormat | null,
  productId: string,
  format: RetreatFormat,
) {
  return (ruleProductId === null || ruleProductId === productId) && (ruleFormat === null || ruleFormat === format);
}

export type OccupyingBooking = {
  start_date: string;
  end_date: string | null;
  booking_status: BookingStatus;
  retreat_event_id: string | null;
};

export function isPrivateRetreatFormat(format: RetreatFormat | string): format is PrivateRetreatFormat {
  return (PRIVATE_RETREAT_FORMATS as readonly string[]).includes(format);
}

export function isOccupyingBookingStatus(status: BookingStatus | string) {
  return status === "confirmed" || status === "completed";
}

export function dateInInclusiveRange(date: string, startDate: string, endDate: string | null) {
  return startDate <= date && (endDate ?? startDate) >= date;
}

export function rangesOverlap(startA: string, endA: string | null, startB: string, endB: string | null) {
  return startA <= (endB ?? startB) && (endA ?? startA) >= startB;
}

export function bookingOccupiesDate(booking: OccupyingBooking, date: string) {
  return booking.retreat_event_id === null && isOccupyingBookingStatus(booking.booking_status) && dateInInclusiveRange(date, booking.start_date, booking.end_date);
}

export function bookingOverlapsRange(booking: OccupyingBooking, startDate: string, endDate: string) {
  return booking.retreat_event_id === null && isOccupyingBookingStatus(booking.booking_status) && rangesOverlap(booking.start_date, booking.end_date, startDate, endDate);
}
