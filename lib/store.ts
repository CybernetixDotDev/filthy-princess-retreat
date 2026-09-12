import type { StoreFulfillmentType, StoreProductStatus, StoreProductType } from "@/lib/database.types";

export const STORE_PRODUCT_TYPES = ["membership", "digital", "experience", "session", "physical"] as const satisfies readonly StoreProductType[];
export const STORE_PRODUCT_STATUSES = ["draft", "active", "archived"] as const satisfies readonly StoreProductStatus[];
export const STORE_FULFILLMENT_TYPES = ["inner_sanctum_membership", "manual"] as const satisfies readonly StoreFulfillmentType[];

export function formatStoreMoney(amount: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 }).format(amount);
}

export function storeLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
