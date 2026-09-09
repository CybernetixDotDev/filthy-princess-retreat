"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { quoteEthForUsd } from "@/lib/alchemy-pricing";
import { requireAdmin } from "@/lib/auth";
import { calculateEventUsd, calculateRetreatUsd, normalizeUsd, type CurrentEthConversion, type EventPriceInput, type EventPriceResult, type RetreatPriceInput, type RetreatPriceResult } from "@/lib/pricing";
import { PRIVATE_RETREAT_FORMATS } from "@/lib/retreat-availability";

const usdSchema = z.string().trim().regex(/^\d{1,10}(?:\.\d{1,2})?$/);
const retreatInputSchema = z.object({ productId: z.uuid(), format: z.enum(PRIVATE_RETREAT_FORMATS), guests: z.number().int().min(1).max(50), nights: z.number().int().min(1).max(31) });
const eventInputSchema = z.object({ eventId: z.uuid(), guests: z.number().int().min(1).max(50) });

async function pricingClient() {
  const state = await requireAdmin();
  if (!state) throw new Error("Not authorized");
  return state.supabase;
}

export async function getStandardRate(input: { productId: string; format: RetreatPriceInput["format"] }): Promise<string | null> {
  const parsed = retreatInputSchema.pick({ productId: true, format: true }).parse(input);
  const supabase = await pricingClient();
  const { data, error } = await supabase.from("retreat_pricing").select("price_usd_per_person_per_night").eq("retreat_product_id", parsed.productId).eq("retreat_format", parsed.format).maybeSingle();
  if (error) throw new Error("Pricing could not be loaded.");
  return data ? normalizeUsd(data.price_usd_per_person_per_night) : null;
}

export async function calculateRetreatPrice(input: RetreatPriceInput): Promise<{ price?: RetreatPriceResult; error?: string }> {
  const parsed = retreatInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a valid retreat, package, guest count, and number of nights." };
  try {
    const rate = await getStandardRate({ productId: parsed.data.productId, format: parsed.data.format });
    if (rate === null) return { error: "No price is configured for this retreat and package." };
    return { price: calculateRetreatUsd(parsed.data, rate) };
  } catch { return { error: "Pricing could not be loaded." }; }
}

export async function getEventPrice(input: { eventId: string }): Promise<string | null> {
  const eventId = z.uuid().parse(input.eventId);
  const supabase = await pricingClient();
  const { data, error } = await supabase.from("retreat_events").select("price_usd_per_person").eq("id", eventId).maybeSingle();
  if (error) throw new Error("Event pricing could not be loaded.");
  return data ? normalizeUsd(data.price_usd_per_person) : null;
}

export async function calculateEventPrice(input: EventPriceInput): Promise<{ price?: EventPriceResult; error?: string }> {
  const parsed = eventInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Choose a valid event and guest count." };
  try {
    const rate = await getEventPrice({ eventId: parsed.data.eventId });
    if (rate === null) return { error: "No price is configured for this event." };
    return { price: calculateEventUsd(parsed.data, rate) };
  } catch { return { error: "Event pricing could not be loaded." }; }
}

export async function convertUsdToCurrentEth(input: { usdTotal: string }): Promise<CurrentEthConversion> {
  const usdTotal = normalizeUsd(usdSchema.parse(input.usdTotal));
  try {
    const conversion = await quoteEthForUsd(Number(usdTotal));
    return { available: true, usdTotal, ethAmount: conversion.ethAmount, ethPriceUsd: conversion.ethPriceUsd };
  } catch { return { available: false, usdTotal }; }
}

export async function updateStandardRate(formData: FormData) {
  const parsed = z.object({ productId: z.uuid(), format: z.enum(PRIVATE_RETREAT_FORMATS), rate: usdSchema }).parse({ productId: formData.get("product_id"), format: formData.get("retreat_format"), rate: formData.get("rate_usd") });
  const supabase = await pricingClient();
  const { data: product } = await supabase.from("retreat_products").select("allowed_formats").eq("id", parsed.productId).maybeSingle();
  if (!product?.allowed_formats.includes(parsed.format)) throw new Error("This package is not available for the selected retreat.");
  const { error } = await supabase.from("retreat_pricing").upsert({ retreat_product_id: parsed.productId, retreat_format: parsed.format, price_usd_per_person_per_night: Number(normalizeUsd(parsed.rate)) }, { onConflict: "retreat_product_id,retreat_format" });
  if (error) throw new Error("The retreat price could not be saved.");
  revalidatePath("/admin/pricing");
}

export async function updateEventPrice(formData: FormData) {
  const parsed = z.object({ eventId: z.uuid(), rate: usdSchema }).parse({ eventId: formData.get("event_id"), rate: formData.get("rate_usd") });
  const supabase = await pricingClient();
  const { error } = await supabase.from("retreat_events").update({ price_usd_per_person: Number(normalizeUsd(parsed.rate)) }).eq("id", parsed.eventId);
  if (error) throw new Error("The event price could not be saved.");
  revalidatePath("/admin/pricing");
}
