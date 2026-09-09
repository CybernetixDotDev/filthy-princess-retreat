import type { PrivateRetreatFormat } from "./retreat-availability";

export type UsdAmount = string;

export type RetreatPriceInput = {
  productId: string;
  format: PrivateRetreatFormat;
  guests: number;
  nights: number;
};

export type RetreatPriceResult = RetreatPriceInput & {
  rateUsdPerPersonPerNight: UsdAmount;
  totalUsd: UsdAmount;
};

export type EventPriceInput = { eventId: string; guests: number };
export type EventPriceResult = EventPriceInput & { rateUsdPerPerson: UsdAmount; totalUsd: UsdAmount };
export type CurrentEthConversion = { available: true; usdTotal: UsdAmount; ethAmount: string; ethPriceUsd: string } | { available: false; usdTotal: UsdAmount };

const usdPattern = /^\d{1,10}(?:\.\d{1,2})?$/;

export function normalizeUsd(value: string | number): UsdAmount {
  const text = String(value).trim();
  if (!usdPattern.test(text)) throw new Error("Enter a valid USD amount with no more than two decimal places.");
  const [whole, fraction = ""] = text.split(".");
  return `${BigInt(whole)}.${fraction.padEnd(2, "0")}`;
}

function usdToCents(value: string | number) {
  const [whole, fraction] = normalizeUsd(value).split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction);
}

function centsToUsd(value: bigint): UsdAmount {
  const whole = value / BigInt(100);
  const fraction = (value % BigInt(100)).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

export function calculateRetreatUsd(input: RetreatPriceInput, rateUsdPerPersonPerNight: string | number): RetreatPriceResult {
  if (!Number.isInteger(input.guests) || input.guests < 1 || input.guests > 50) throw new Error("Guests must be between 1 and 50.");
  if (!Number.isInteger(input.nights) || input.nights < 1 || input.nights > 31) throw new Error("Nights must be between 1 and 31.");
  const rate = normalizeUsd(rateUsdPerPersonPerNight);
  return { ...input, rateUsdPerPersonPerNight: rate, totalUsd: centsToUsd(usdToCents(rate) * BigInt(input.guests) * BigInt(input.nights)) };
}

export function calculateEventUsd(input: EventPriceInput, rateUsdPerPerson: string | number): EventPriceResult {
  if (!Number.isInteger(input.guests) || input.guests < 1 || input.guests > 50) throw new Error("Guests must be between 1 and 50.");
  const rate = normalizeUsd(rateUsdPerPerson);
  return { ...input, rateUsdPerPerson: rate, totalUsd: centsToUsd(usdToCents(rate) * BigInt(input.guests)) };
}

export function formatUsd(value: UsdAmount) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value));
}
