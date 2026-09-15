"use server";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { BOOKING_STATUSES, ENQUIRY_STATUSES, PAYMENT_STATUSES, RETREAT_FORMATS } from "@/lib/domain";
import { requireAdmin } from "@/lib/auth";
import { isPrivateRetreatFormat, type AvailabilityState, type CalendarArrivalAvailability } from "@/lib/retreat-availability";
import { calculateRetreatDates, inclusiveEndFromCheckout, retreatDatesFromInclusiveRange } from "@/lib/retreat-dates";
import { calculateRetreatUsd, normalizeUsd } from "@/lib/pricing";

const adminArrivalSchema = z.object({
  productId: z.uuid(),
  format: z.enum(RETREAT_FORMATS).refine(isPrivateRetreatFormat),
  guestCount: z.number().int().min(1).max(50),
  nights: z.literal(3),
  rangeStart: z.iso.date(),
  rangeEnd: z.iso.date(),
});

const setEnquiryDateSchema = z.object({ enquiryId: z.uuid(), arrival: z.iso.date() });

export async function getAdminCalendarArrivalAvailability(input: z.input<typeof adminArrivalSchema>): Promise<{ dates: CalendarArrivalAvailability[]; error?: string }> {
  const parsed = adminArrivalSchema.safeParse(input);
  if (!parsed.success || parsed.data.rangeEnd < parsed.data.rangeStart) return { dates: [], error: "Choose a valid calendar range." };
  const supabase = await adminClient();
  const { data, error } = await supabase.rpc("get_admin_arrival_availability", {
    p_product_id: parsed.data.productId,
    p_format: parsed.data.format,
    p_nights: parsed.data.nights,
    p_guest_count: parsed.data.guestCount,
    p_range_start: parsed.data.rangeStart,
    p_range_end: parsed.data.rangeEnd,
  });
  if (error) return { dates: [], error: "Availability could not be checked." };
  return { dates: (data ?? []).map((row) => ({ available: row.available, state: row.state as AvailabilityState, arrival: row.arrival_date, nights: row.nights, checkout: row.checkout_date, occupiedStart: row.occupied_start, occupiedEnd: row.occupied_end })) };
}

export async function setAdminEnquiryRetreatDate(formData: FormData) {
  const parsed = setEnquiryDateSchema.parse({ enquiryId: formData.get("enquiry_id"), arrival: formData.get("arrival_date") });
  const supabase = await adminClient();
  const { error } = await supabase.rpc("set_admin_enquiry_retreat_date", { p_enquiry_id: parsed.enquiryId, p_arrival: parsed.arrival });
  if (error) throw new Error(error.message.includes("no longer available") ? "The selected stay is no longer available." : error.message);
  revalidatePath(`/admin/enquiries/${parsed.enquiryId}`);
  revalidatePath("/admin/availability");
}

export async function releaseAdminEnquiryHold(formData: FormData) {
  const enquiryId = z.uuid().parse(formData.get("enquiry_id"));
  const supabase = await adminClient();
  const { error } = await supabase.rpc("release_admin_enquiry_hold", { p_enquiry_id: enquiryId });
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/enquiries/${enquiryId}`);
  revalidatePath("/admin/availability");
}

async function adminClient() {
  const state = await requireAdmin();
  if (!state) throw new Error("Not authorized");
  return state.supabase;
}

export async function updateEnquiry(formData: FormData) {
  const id = z.uuid().parse(formData.get("id"));
  const status = z.enum(ENQUIRY_STATUSES).parse(formData.get("status"));
  const adminNotes = z.string().max(10000).parse(String(formData.get("admin_notes") ?? ""));
  const supabase = await adminClient();
  const { error } = await supabase.from("retreat_enquiries").update({ status, admin_notes: adminNotes || null }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath(`/admin/enquiries/${id}`); revalidatePath("/admin");
}

export async function createAvailability(formData: FormData) {
  const parsed = z.object({ productId: z.union([z.uuid(), z.literal("")]), format: z.union([z.enum(RETREAT_FORMATS), z.literal("")]), start: z.iso.date(), end: z.iso.date(), state: z.enum(["available", "blocked"]), capacity: z.union([z.literal(""), z.coerce.number().int().min(1).max(32767)]) }).parse({
    productId: formData.get("product_id"), format: formData.get("retreat_format"), start: formData.get("start_date"), end: formData.get("end_date"), state: formData.get("state"), capacity: String(formData.get("capacity") ?? ""),
  });
  if (parsed.end < parsed.start) throw new Error("End date must be on or after start date");
  const supabase = await adminClient();
  const { error } = await supabase.from("retreat_availability").insert({ retreat_product_id: parsed.productId || null, retreat_format: parsed.format || null, start_date: parsed.start, end_date: parsed.end, state: parsed.state, capacity: parsed.capacity || null });
  if (error) throw new Error(error.message); revalidatePath("/admin/availability"); revalidatePath("/retreat");
}

export async function toggleAvailability(formData: FormData) {
  const id = z.uuid().parse(formData.get("id")); const current = z.enum(["available", "blocked"]).parse(formData.get("current"));
  const supabase = await adminClient(); const { error } = await supabase.from("retreat_availability").update({ state: current === "available" ? "blocked" : "available" }).eq("id", id);
  if (error) throw new Error(error.message); revalidatePath("/admin/availability"); revalidatePath("/retreat");
}

export async function createEvent(formData: FormData) {
  const parsed = z.object({ title: z.string().trim().min(2).max(200), productId: z.uuid(), start: z.iso.date(), end: z.iso.date(), capacity: z.coerce.number().int().positive().max(32767), places: z.coerce.number().int().nonnegative().max(32767), status: z.enum(["draft", "published"]), description: z.string().trim().max(1000), invitationOnly: z.boolean(), interestEnabled: z.boolean() }).parse({ title: formData.get("title"), productId: formData.get("product_id"), start: formData.get("start_date"), end: formData.get("end_date"), capacity: formData.get("capacity"), places: formData.get("available_places"), status: formData.get("status"), description: String(formData.get("description") ?? ""), invitationOnly: formData.get("invitation_only") === "on", interestEnabled: formData.get("interest_enabled") === "on" });
  if (parsed.end < parsed.start) throw new Error("Check the event dates");
  if (parsed.places === 0) parsed.places = parsed.capacity;
  if (parsed.places > parsed.capacity) throw new Error("Check the event capacity");
  const supabase = await adminClient(); const { error } = await supabase.rpc("create_retreat_event", { p_title: parsed.title, p_product_id: parsed.productId, p_start_date: parsed.start, p_end_date: parsed.end, p_capacity: parsed.capacity, p_status: parsed.status, p_description: parsed.description || null, p_invitation_only: parsed.invitationOnly, p_interest_enabled: parsed.interestEnabled });
  if (error) throw new Error(error.message); revalidatePath("/admin/events"); revalidatePath("/retreat");
}

export async function updateEvent(formData: FormData) {
  const id = z.uuid().parse(formData.get("id")); const status = z.enum(["draft", "published", "full", "cancelled", "completed"]).parse(formData.get("status")); const places = z.coerce.number().int().nonnegative().parse(formData.get("available_places")); const invitationOnly = formData.get("invitation_only") === "on"; const interestEnabled = formData.get("interest_enabled") === "on";
  void places;
  const supabase = await adminClient(); const { data: event } = await supabase.from("retreat_events").select("title,start_date,end_date,capacity,description").eq("id", id).single(); if (!event) throw new Error("Event not found"); const { error } = await supabase.rpc("update_retreat_event", { p_event_id: id, p_title: event.title, p_start_date: event.start_date, p_end_date: event.end_date, p_capacity: event.capacity, p_status: status, p_description: event.description || "", p_invitation_only: invitationOnly, p_interest_enabled: interestEnabled });
  if (error) throw new Error(error.message); revalidatePath("/admin/events"); revalidatePath("/retreat");
}

export async function createQuote(formData: FormData) {
  const enquiryId = z.uuid().parse(formData.get("enquiry_id"));
  const supabase = await adminClient();
  const { data: enquiry, error: enquiryError } = await supabase.from("retreat_enquiries").select("*").eq("id", enquiryId).single();
  if (enquiryError) throw new Error(enquiryError.message);
  if (enquiry.enquiry_type !== "stay" || !enquiry.retreat_product_id || !enquiry.retreat_format || !enquiry.guest_count || !enquiry.requested_start_date) {
    throw new Error("Only complete stay enquiries can generate a quote.");
  }
  if (!isPrivateRetreatFormat(enquiry.retreat_format)) {
    throw new Error("Only private stay formats can generate a quote.");
  }
  const existing = await supabase.from("retreat_quotes").select("id, public_slug").eq("enquiry_id", enquiryId).maybeSingle();
  if (existing.data) throw new Error("A quote for this enquiry already exists.");

  const { data: pricingRow, error: pricingError } = await supabase.from("retreat_pricing").select("price_usd_per_person_per_night").eq("retreat_product_id", enquiry.retreat_product_id).eq("retreat_format", enquiry.retreat_format).maybeSingle();
  if (pricingError) throw new Error(pricingError.message);
  if (!pricingRow?.price_usd_per_person_per_night) throw new Error("No rate is configured for this retreat and package.");

  const rate = normalizeUsd(pricingRow.price_usd_per_person_per_night);
  const dateRange = retreatDatesFromInclusiveRange(enquiry.requested_start_date, enquiry.requested_end_date);
  const price = calculateRetreatUsd({ productId: enquiry.retreat_product_id, format: enquiry.retreat_format, guests: Number(enquiry.guest_count), nights: dateRange.nights }, rate);

  const publicSlug = randomUUID();
  const reference = `FPR-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;

  const { error } = await supabase.from("retreat_quotes").insert({
    reference,
    enquiry_id: enquiry.id,
    retreat_product_id: enquiry.retreat_product_id,
    retreat_type_name: enquiry.retreat_type_name ?? "Retreat",
    retreat_format: enquiry.retreat_format,
    start_date: enquiry.requested_start_date,
    end_date: enquiry.requested_end_date,
    duration_days: dateRange.nights,
    guest_count: Number(enquiry.guest_count),
    total_price: Number(price.totalUsd),
    rate_usd_per_person_per_night: Number(rate),
    deposit_required: 0,
    currency: "USD",
    notes: null,
    status: "sent",
    payment_status: "unpaid",
    public_slug: publicSlug,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/admin/enquiries/${enquiry.id}`);
  revalidatePath("/admin");
}

export async function markPaymentReceived(formData: FormData) {
  const quoteId = z.uuid().parse(formData.get("quote_id")); const enquiryId = z.uuid().parse(formData.get("enquiry_id")); const paymentStatus = z.enum(PAYMENT_STATUSES).exclude(["unpaid", "refunded"]).parse(formData.get("payment_status"));
  const supabase = await adminClient(); const { error } = await supabase.from("retreat_quotes").update({ payment_status: paymentStatus, payment_received_at: new Date().toISOString(), status: "accepted" }).eq("id", quoteId);
  if (error) throw new Error(error.message); revalidatePath(`/admin/enquiries/${enquiryId}`);
}
export async function verifyPayment(formData: FormData) { const quoteId = z.uuid().parse(formData.get("quote_id")); const enquiryId = z.uuid().parse(formData.get("enquiry_id")); const supabase = await adminClient(); const { error } = await supabase.rpc("verify_quote_payment", { p_quote_id: quoteId, p_tx_hash: String(formData.get("tx_hash") ?? "") || null }); if (error) throw new Error("Payment verification could not be recorded."); revalidatePath(`/admin/enquiries/${enquiryId}`); }
export async function reissuePaymentLink(formData: FormData) { const quoteId=z.uuid().parse(formData.get("quote_id")); const enquiryId=z.uuid().parse(formData.get("enquiry_id")); const token=randomBytes(32).toString("base64url"); const hash=createHash("sha256").update(token).digest("hex"); const supabase=await adminClient(); const {error}=await supabase.from("retreat_quotes").update({payment_token_hash:hash}).eq("id",quoteId); if(error) throw new Error("Payment link could not be reissued."); const siteUrl=(process.env.NEXT_PUBLIC_SITE_URL||"http://localhost:3000").replace(/\/$/,""); revalidatePath(`/admin/enquiries/${enquiryId}`); redirect(`/admin/enquiries/${enquiryId}?payment_url=${encodeURIComponent(`${siteUrl}/retreat/payment/${token}`)}`); }

export async function confirmBooking(formData: FormData) {
  const quoteId = z.uuid().parse(formData.get("quote_id")); const enquiryId = z.uuid().parse(formData.get("enquiry_id")); const supabase = await adminClient();
  const { error } = await supabase.rpc("confirm_retreat_booking", { target_quote_id: quoteId });
  if (error) {
    if (error.message.includes("already occupied")) throw new Error("These dates are already occupied by another confirmed retreat.");
    if (error.message.includes("no longer available")) throw new Error("The configured availability no longer permits these private retreat dates.");
    throw new Error("The booking could not be confirmed. Review the quote, payment, and availability details.");
  }
  revalidatePath(`/admin/enquiries/${enquiryId}`); revalidatePath("/admin/bookings"); revalidatePath("/admin/availability"); redirect("/admin/bookings");
}

export async function updateBooking(formData: FormData) {
  const bookingId = z.uuid().parse(formData.get("booking_id"));
  const bookingStatus = z.enum(BOOKING_STATUSES).parse(formData.get("booking_status"));
  const paymentStatus = z.enum(PAYMENT_STATUSES).parse(formData.get("payment_status"));
  const supabase = await adminClient();
  const { error } = await supabase.rpc("update_retreat_booking", {
    target_booking_id: bookingId,
    target_booking_status: bookingStatus,
    target_payment_status: paymentStatus,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/bookings"); revalidatePath("/admin/availability");
}

export async function createManualBooking(formData: FormData) {
  const parsed = z.object({
    productId: z.uuid(),
    format: z.enum(RETREAT_FORMATS),
    start: z.iso.date(),
    end: z.union([z.iso.date(), z.literal("")]),
    guestCount: z.coerce.number().int().min(1).max(50),
    bookingStatus: z.enum(BOOKING_STATUSES),
    paymentStatus: z.enum(PAYMENT_STATUSES),
    eventId: z.union([z.uuid(), z.literal("")]),
  }).parse({
    productId: formData.get("product_id"), format: formData.get("retreat_format"), start: formData.get("start_date"), end: String(formData.get("end_date") ?? ""), guestCount: formData.get("guest_count"), bookingStatus: formData.get("booking_status"), paymentStatus: formData.get("payment_status"), eventId: String(formData.get("event_id") ?? ""),
  });
  const durationValue = String(formData.get("duration_nights") ?? ""); const checkoutValue = String(formData.get("checkout_date") ?? "");
  if (durationValue && durationValue !== "custom") parsed.end = calculateRetreatDates(parsed.start, Number(durationValue)).occupiedEndDate;
  else if (checkoutValue) parsed.end = inclusiveEndFromCheckout(parsed.start, checkoutValue).occupiedEndDate;
  if (parsed.end && parsed.end < parsed.start) throw new Error("End date must be on or after start date");
  const supabase = await adminClient();
  const { error } = await supabase.rpc("create_manual_retreat_booking", {
    p_retreat_product_id: parsed.productId,
    p_retreat_format: parsed.format,
    p_start_date: parsed.start,
    p_end_date: parsed.end || null,
    p_guest_count: parsed.guestCount,
    p_booking_status: parsed.bookingStatus,
    p_payment_status: parsed.paymentStatus,
    p_event_id: parsed.eventId || null,
  });
  if (error) {
    if (error.message.includes("already occupied")) throw new Error("These dates are already occupied by another confirmed retreat.");
    if (error.message.includes("no longer permits")) throw new Error("The configured availability no longer permits these private retreat dates.");
    if (error.message.includes("Group event")) throw new Error("The selected group event no longer has enough places or does not match this booking.");
    throw new Error("The manual booking could not be created. Review the booking details and try again.");
  }
  revalidatePath("/admin/bookings"); revalidatePath("/admin/availability");
  redirect("/admin/bookings");
}
