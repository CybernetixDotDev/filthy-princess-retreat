"use client";

import { normalizeStoreCart, STORE_CART_STORAGE_KEY, type StoreCartItem } from "@/lib/store-cart";

function readCart(): StoreCartItem[] {
  try {
    return normalizeStoreCart(JSON.parse(window.localStorage.getItem(STORE_CART_STORAGE_KEY) ?? "[]"));
  } catch {
    return [];
  }
}

function writeCart(items: StoreCartItem[]) {
  window.localStorage.setItem(STORE_CART_STORAGE_KEY, JSON.stringify(normalizeStoreCart(items)));
  window.dispatchEvent(new Event("store-cart-updated"));
}

export function StoreCartButton({ productId, maxQuantity = 100 }: { productId: string; maxQuantity?: number }) {
  function addToCart() {
    const items = readCart();
    const existing = items.find((item) => item.productId === productId);
    writeCart(existing
      ? items.map((item) => item.productId === productId ? { ...item, quantity: Math.min(maxQuantity, item.quantity + 1) } : item)
      : [...items, { productId, quantity: 1 }]);
  }

  return <button type="button" className="sanctum-link" onClick={addToCart}>Add to cart</button>;
}
