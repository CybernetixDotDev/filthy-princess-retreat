"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { checkStayAvailability } from "@/app/actions/availability";
import { createClient } from "@/lib/supabase/server";
import { RETREAT_FORMATS } from "@/lib/domain";
import { PRIVATE_RETREAT_FORMATS, type PrivateRetreatFormat } from "@/lib/retreat-availability";
import { calculateRetreatDates } from "@/lib/retreat-dates";

export type EnquiryState = {
  success?: boolean;
  availabilityChanged?: boolean;
  error?: string;
  submitted?: { productId: string; format: PrivateRetreatFormat; guestCount: number; arrival: string; nights: number; checkout: string };
};
export type GeneralEnquiryState = {
  success?: boolean;
  error?: string;
};
export async function getPrivateArrivalDates(input: { productId: string; format: (typeof RETREAT_FORMATS)[number]; guestCount: number; nights: number; monthStart: string; monthEnd: string }) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_private_arrival_availability", { p_product_id: input.productId, p_format: input.format, p_guest_count: input.guestCount, p_nights: input.nights, p_month_start: input.monthStart, p_month_end: input.monthEnd });
  if (error) return { dates: [], error: "Availability could not be checked." };
  return { dates: (data ?? []).map((row) => row.arrival_date) };
}
const enquirySchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  email: z.email().trim(),
  phone: z.string().trim().min(3).max(100),
  country: z.string().trim().min(2).max(100),
  productId: z.uuid(),
  format: z.enum(PRIVATE_RETREAT_FORMATS),
  guestCount: z.coerce.number().int().min(1).max(50),
  arrival: z.iso.date(),
  nights: z.coerce.number().int().refine((value) => [1, 2, 3, 5].includes(value)),
  checkout: z.iso.date(),
  occupiedEnd: z.iso.date(),
  message: z.string().trim().max(2000).optional(),
});

export async function submitEnquiry(_: EnquiryState, formData: FormData): Promise<EnquiryState> {
  const parsed = enquirySchema.safeParse({
    fullName: formData.get("full_name"), email: formData.get("email"), phone: formData.get("phone"),
    country: formData.get("country"), productId: formData.get("product_id"), format: formData.get("retreat_format"),
    guestCount: formData.get("guest_count"), arrival: formData.get("arrival_date"), nights: formData.get("nights"),
    checkout: formData.get("checkout_date"), occupiedEnd: formData.get("occupied_end_date"), message: formData.get("message"),
  });
  if (!parsed.success) return { error: "Please complete the required fields and check your contact details." };
  if ((parsed.data.format === "solo" && parsed.data.guestCount !== 1) || (parsed.data.format === "couples" && parsed.data.guestCount !== 2)) return { error: "The guest count does not match the selected package." };

  const dates = calculateRetreatDates(parsed.data.arrival, parsed.data.nights);
  if (dates.checkoutDate !== parsed.data.checkout || dates.occupiedEndDate !== parsed.data.occupiedEnd) return { error: "The selected stay details have changed. Please choose the stay again." };

  let availability;
  try {
    availability = await checkStayAvailability({ productId: parsed.data.productId, format: parsed.data.format, arrival: parsed.data.arrival, nights: parsed.data.nights, guestCount: parsed.data.guestCount });
  } catch {
    return { error: "We couldn't verify availability. Please try again." };
  }
  if (!availability.available || availability.checkout !== parsed.data.checkout || availability.occupiedEnd !== parsed.data.occupiedEnd) return { availabilityChanged: true, error: "That stay is no longer available. Please choose another date." };

  const cookieStore = await cookies();
  const referralCode = cookieStore.get("retreat_referral")?.value?.slice(0, 100) || null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_retreat_enquiry_with_dates", {
    p_full_name: parsed.data.fullName,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone,
    p_country: parsed.data.country,
    p_retreat_product_id: parsed.data.productId,
    p_retreat_format: parsed.data.format,
    p_guest_count: parsed.data.guestCount,
    p_selected_date: parsed.data.arrival,
    p_selected_end_date: parsed.data.occupiedEnd,
    p_alternative_date: null,
    p_event_id: null,
    p_message: parsed.data.message || null,
    p_referral_code: referralCode,
    p_referral_source: referralCode ? "url" : null,
  });
  if (error) {
    if (/unavailable|reserved|occupied|availability/i.test(error.message)) return { availabilityChanged: true, error: "That stay is no longer available. Please choose another date." };
    return { error: "We couldn't send your enquiry. Please try again." };
  }
  return { success: true, submitted: { productId: parsed.data.productId, format: parsed.data.format, guestCount: parsed.data.guestCount, arrival: parsed.data.arrival, nights: parsed.data.nights, checkout: parsed.data.checkout } };
}

const generalEnquirySchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  email: z.email().trim(),
  phone: z.string().trim().min(3).max(100),
  country: z.string().trim().min(2).max(100),
  message: z.string().trim().max(2000).optional(),
});

export async function submitGeneralEnquiry(_: GeneralEnquiryState, formData: FormData): Promise<GeneralEnquiryState> {
  const parsed = generalEnquirySchema.safeParse({
    fullName: formData.get("full_name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    country: formData.get("country"),
    message: formData.get("message"),
  });
  if (!parsed.success) return { error: "Please complete the required fields and check your contact details." };

  const cookieStore = await cookies();
  const referralCode = cookieStore.get("retreat_referral")?.value?.slice(0, 100) || null;
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_general_retreat_enquiry", {
    p_full_name: parsed.data.fullName,
    p_email: parsed.data.email,
    p_phone: parsed.data.phone,
    p_country: parsed.data.country,
    p_message: parsed.data.message || null,
    p_referral_code: referralCode,
    p_referral_source: referralCode ? "url" : null,
  });
  if (error) return { error: "We couldn't send your enquiry. Please try again." };
  return { success: true };
}

export async function submitEventEnquiry(_: EnquiryState, formData: FormData): Promise<EnquiryState> {
  const parsed = z.object({ eventId: z.uuid(), fullName: z.string().trim().min(2).max(200), email: z.email().trim(), phone: z.string().trim().min(3).max(100), country: z.string().trim().min(2).max(100), guestCount: z.coerce.number().int().min(1).max(50), message: z.string().trim().max(2000).optional() }).safeParse({ eventId: formData.get("event_id"), fullName: formData.get("full_name"), email: formData.get("email"), phone: formData.get("phone"), country: formData.get("country"), guestCount: formData.get("guest_count"), message: formData.get("message") });
  if (!parsed.success) return { error: "Please complete the required fields." };
  const cookieStore = await cookies(); const referralCode = cookieStore.get("retreat_referral")?.value?.slice(0, 100) || null; const supabase = await createClient();
  const { data: event } = await supabase.from("retreat_events").select("id,retreat_product_id").eq("id", parsed.data.eventId).eq("status", "published").maybeSingle();
  if (!event) return { error: "This event is no longer available." };
  const { error } = await supabase.rpc("submit_retreat_enquiry", { p_full_name: parsed.data.fullName, p_email: parsed.data.email, p_phone: parsed.data.phone, p_country: parsed.data.country, p_retreat_product_id: event.retreat_product_id, p_retreat_format: "join_a_group", p_guest_count: parsed.data.guestCount, p_selected_date: null, p_alternative_date: null, p_event_id: event.id, p_message: parsed.data.message || null, p_referral_code: referralCode, p_referral_source: referralCode ? "url" : null });
  if (error) return { error: error.message.includes("unavailable") ? "Those places are no longer available." : "We couldn't submit your event enquiry. Please try again." };
  return { success: true };
}
