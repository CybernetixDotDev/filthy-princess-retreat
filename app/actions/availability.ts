"use server";

import { z } from "zod";
import { RETREAT_FORMATS } from "@/lib/domain";
import type { AvailabilityState, CalendarArrivalAvailability, StayAvailabilityInput, StayAvailabilityResult } from "@/lib/retreat-availability";
import { createClient } from "@/lib/supabase/server";

const staySchema = z.object({
  productId: z.uuid(),
  format: z.enum(RETREAT_FORMATS),
  arrival: z.iso.date(),
  nights: z.number().int().min(1).max(31),
  guestCount: z.number().int().min(1).max(50).optional(),
});

const calendarSchema = z.object({
  productId: z.uuid(),
  format: z.enum(RETREAT_FORMATS),
  nights: z.number().int().min(1).max(31),
  guestCount: z.number().int().min(1).max(50).optional(),
  rangeStart: z.iso.date(),
  rangeEnd: z.iso.date(),
});

type StayRow = {
  available: boolean;
  state: AvailabilityState;
  arrival_date: string;
  nights: number;
  checkout_date: string;
  occupied_start: string;
  occupied_end: string;
};

function mapStay(row: StayRow): StayAvailabilityResult {
  return { available: row.available, state: row.state, arrival: row.arrival_date, nights: row.nights, checkout: row.checkout_date, occupiedStart: row.occupied_start, occupiedEnd: row.occupied_end };
}

export async function checkStayAvailability(input: StayAvailabilityInput): Promise<StayAvailabilityResult> {
  const parsed = staySchema.parse(input);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("check_stay_availability", {
    p_product_id: parsed.productId,
    p_format: parsed.format,
    p_arrival: parsed.arrival,
    p_nights: parsed.nights,
    p_guest_count: parsed.guestCount ?? 1,
  });
  if (error || !data?.[0]) throw new Error("Availability could not be checked.");
  return mapStay(data[0] as StayRow);
}

export async function getCalendarArrivalAvailability(input: {
  productId: string;
  format: StayAvailabilityInput["format"];
  nights: number;
  guestCount?: number;
  rangeStart: string;
  rangeEnd: string;
}): Promise<{ dates: CalendarArrivalAvailability[]; error?: string }> {
  const parsed = calendarSchema.safeParse(input);
  if (!parsed.success || parsed.data.rangeEnd < parsed.data.rangeStart) return { dates: [], error: "Choose a valid calendar range." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_arrival_availability", {
    p_product_id: parsed.data.productId,
    p_format: parsed.data.format,
    p_nights: parsed.data.nights,
    p_guest_count: parsed.data.guestCount ?? 1,
    p_range_start: parsed.data.rangeStart,
    p_range_end: parsed.data.rangeEnd,
  });
  if (error) return { dates: [], error: "Availability could not be checked." };
  return { dates: ((data ?? []) as StayRow[]).map(mapStay) };
}
