export const RETREAT_FORMATS = ["solo", "couples", "private_group", "join_a_group"] as const;
export const ENQUIRY_STATUSES = ["new", "contacted", "closed"] as const;
export const QUOTE_STATUSES = ["draft", "sent", "accepted", "expired", "cancelled"] as const;
export const PAYMENT_STATUSES = ["unpaid", "deposit_received", "paid", "refunded", "payment_submitted", "payment_verified"] as const;
export const BOOKING_STATUSES = ["confirmed", "completed", "cancelled"] as const;
export const BOOKING_SOURCES = ["enquiry", "manual"] as const;
export const HOLD_STATUSES = ["active", "released", "expired", "converted"] as const;

export type RetreatFormat = (typeof RETREAT_FORMATS)[number];
export type EnquiryStatus = (typeof ENQUIRY_STATUSES)[number];
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type BookingSource = (typeof BOOKING_SOURCES)[number];
export type HoldStatus = (typeof HOLD_STATUSES)[number];

export const formatLabels = {
  solo: "Solo",
  couples: "Couples",
  private_group: "Private Group",
  join_a_group: "Join a Group",
  null: "Any Format",
} as Record<RetreatFormat, string> & Record<"null", string>;

export function titleCaseStatus(value: string) {
  return value.split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
}

export function safeNextPath(value: string | null | undefined, fallback = "/admin") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("\r") || value.includes("\n")) return fallback;
  return value;
}
