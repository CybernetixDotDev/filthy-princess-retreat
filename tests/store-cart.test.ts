import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeStoreCart,
  storeCartCount,
  storeCartCurrency,
  storeCartTotal,
  toStoreOrderRpcItems,
} from "../lib/store-cart.ts";

const products = [
  { id: "product-a", name: "A", price_amount: 12.5, currency: "USD", money_enabled: true, inventory_unlimited: true, inventory_quantity: null },
  { id: "product-b", name: "B", price_amount: 7, currency: "USD", money_enabled: true, inventory_unlimited: false, inventory_quantity: 4 },
  { id: "product-z", name: "Z", price_amount: 10, currency: "ZAR", money_enabled: true, inventory_unlimited: true, inventory_quantity: null },
];

test("cart normalizes duplicate products and caps quantities", () => {
  const cart = normalizeStoreCart([
    { productId: "product-a", quantity: 2 },
    { productId: "product-a", quantity: 3 },
    { productId: "product-b", quantity: 101 },
    { productId: "bad", quantity: 0 },
  ]);
  assert.deepEqual(cart, [
    { productId: "product-a", quantity: 5 },
    { productId: "product-b", quantity: 100 },
  ]);
});

test("cart totals are estimates from catalog prices and quantities", () => {
  const cart = [{ productId: "product-a", quantity: 2 }, { productId: "product-b", quantity: 3 }];
  assert.equal(storeCartCount(cart), 5);
  assert.equal(storeCartTotal(cart, products), 46);
  assert.equal(storeCartCurrency(cart, products), "USD");
});

test("mixed currencies are detected before checkout", () => {
  const cart = [{ productId: "product-a", quantity: 1 }, { productId: "product-z", quantity: 1 }];
  assert.equal(storeCartCurrency(cart, products), null);
});

test("checkout RPC payload uses database line-item keys", () => {
  assert.deepEqual(toStoreOrderRpcItems([{ productId: "product-a", quantity: 2 }]), [
    { product_id: "product-a", quantity: 2 },
  ]);
});