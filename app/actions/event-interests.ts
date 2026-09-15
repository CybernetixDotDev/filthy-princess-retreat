"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { hasInnerSanctumAccess } from "@/lib/inner-sanctum";
import { RETREAT_EVENT_INTEREST_STATUSES, type RetreatEventInterestStatus } from "@/lib/domain";

export async function expressInterestInEvent(eventId: string, message?: string) {
  const id = z.uuid().parse(eventId);
  if (!await hasInnerSanctumAccess()) throw new Error("Event interest is unavailable.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("express_interest_in_retreat_event", { p_event_id: id, p_message: message?.trim() || null });
  if (error || !data?.[0]) throw new Error("Event interest is unavailable.");
  revalidatePath("/inner-sanctum");
  return { status: data[0].interest_status as RetreatEventInterestStatus };
}

export type EventInterestState = { success?: boolean; status?: RetreatEventInterestStatus; error?: string };

export async function submitEventInterest(_: EventInterestState, formData: FormData): Promise<EventInterestState> {
  try {
    const result = await expressInterestInEvent(String(formData.get("event_id")), String(formData.get("message") ?? ""));
    return { success: true, status: result.status };
  } catch {
    return { error: "I couldn't save that just now. Please try again." };
  }
}

async function adminAction(interestId: string, status: RetreatEventInterestStatus, adminNotes?: string) {
  const id = z.uuid().parse(interestId);
  const parsedStatus = z.enum(RETREAT_EVENT_INTEREST_STATUSES).parse(status);
  const state = await requireAdmin();
  if (!state) throw new Error("Not authorized");
  const { error } = await state.supabase.rpc("admin_set_retreat_event_interest_status", { p_interest_id: id, p_status: parsedStatus, p_admin_notes: adminNotes?.trim() || null });
  if (error) throw new Error("The event interest could not be updated.");
  revalidatePath("/admin/events");
}

export async function setEventInterestStatus(formData: FormData) {
  return adminAction(String(formData.get("interest_id")), z.enum(RETREAT_EVENT_INTEREST_STATUSES).parse(formData.get("status")), String(formData.get("admin_notes") ?? ""));
}

export async function createEventInvitation(formData: FormData) {
  const id = z.uuid().parse(formData.get("interest_id"));
  const personalNote = z.string().trim().max(2000).parse(String(formData.get("personal_note") ?? ""));
  const state = await requireAdmin();
  if (!state) throw new Error("Not authorized");
  const { error } = await state.supabase.rpc("admin_create_retreat_event_invitation", { p_interest_id: id, p_personal_note: personalNote || null });
  if (error) throw new Error("The invitation could not be created.");
  revalidatePath("/admin/events");
  revalidatePath("/admin/benefits");
  revalidatePath("/inner-sanctum");
  revalidatePath("/inner-sanctum/benefits");
}

export async function confirmAcceptedEventBooking(formData: FormData) {
  const id = z.uuid().parse(formData.get("interest_id"));
  const state = await requireAdmin();
  if (!state) throw new Error("Not authorized");
  const { error } = await state.supabase.rpc("confirm_retreat_event_interest_booking", { p_interest_id: id });
  if (error) throw new Error("The accepted invitation could not be confirmed. Check the event capacity and invitation response.");
  revalidatePath("/admin/events");
  revalidatePath("/admin/bookings");
  revalidatePath("/inner-sanctum");
  revalidatePath("/inner-sanctum/benefits");
}