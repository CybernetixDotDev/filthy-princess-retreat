"use client";

import Link from "next/link";
import { useActionState, useState, useSyncExternalStore } from "react";
import { createStoreCartOrder, type StoreOrderActionState } from "@/app/actions/store";
import {
  parseStoreCartSnapshot,
  STORE_CART_STORAGE_KEY,
  storeCartTotal,
  storeCartCurrency,
  type StoreCartProduct,
} from "@/lib/store-cart";
import { SubmitButton } from "@/components/submit-button";

export function StoreCartCheckout({ products, defaultEmail }: { products: StoreCartProduct[]; defaultEmail: string }) {
  const [requestKey] = useState(() => crypto.randomUUID());
  const [checkoutReady, setCheckoutReady] = useState(false);
  const [state, action] = useActionState<StoreOrderActionState, FormData>(createStoreCartOrder, {});
  const snapshot = useSyncExternalStore(
    (onChange) => {
      window.addEventListener("store-cart-updated", onChange);
      window.addEventListener("storage", onChange);
      return () => {
        window.removeEventListener("store-cart-updated", onChange);
        window.removeEventListener("storage", onChange);
      };
    },
    () => window.localStorage.getItem(STORE_CART_STORAGE_KEY) ?? "[]",
    () => "[]",
  );
  const items = parseStoreCartSnapshot(snapshot);
  const productById = new Map(products.map((product) => [product.id, product]));

  function updateQuantity(productId: string, quantity: number) {
    const product = productById.get(productId);
    const maxQuantity = product?.inventory_unlimited ? 100 : product?.inventory_quantity ?? 0;
    const next = items.map((item) => item.productId === productId ? { ...item, quantity: Math.min(maxQuantity, quantity) } : item).filter((item) => item.quantity > 0);
    window.localStorage.setItem(STORE_CART_STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("store-cart-updated"));
  }

  function clearCart() {
    window.localStorage.removeItem(STORE_CART_STORAGE_KEY);
    window.dispatchEvent(new Event("store-cart-updated"));
    setCheckoutReady(false);
  }

  const visibleItems = items.filter((item) => productById.has(item.productId));
  const currency = storeCartCurrency(visibleItems, products);
  const total = currency ? new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(storeCartTotal(visibleItems, products)) : null;
  const lines = <>
    {visibleItems.map((item) => {
      const product = productById.get(item.productId)!;
      return <div key={item.productId} className="store-cart-checkout-line">
        <span>{product.name}</span>
        <label>Quantity<input type="number" min="1" max={product.inventory_unlimited ? 100 : product.inventory_quantity ?? 0} value={item.quantity} onChange={(event) => updateQuantity(item.productId, Number(event.target.value))} /></label>
        <button type="button" onClick={() => updateQuantity(item.productId, 0)}>Remove</button>
        <strong>{new Intl.NumberFormat("en-ZA", { style: "currency", currency: product.currency }).format(Number(product.price_amount) * item.quantity)}</strong>
      </div>;
    })}
  </>;
  if (!visibleItems.length) return <div className="stack-form"><p>Your cart is empty.</p><Link className="primary-link" href="/store">Continue shopping</Link></div>;
  if (!checkoutReady) return <div className="stack-form">
    {lines}
    {total ? <p><strong>Estimated grand total:</strong> {total}</p> : <p className="form-error" role="alert">Items with different currencies must be ordered separately.</p>}
    <div className="store-cart-checkout-actions">
      <button type="button" onClick={clearCart}>Clear cart</button>
      <Link className="text-link" href="/store">Continue shopping</Link>
      <button type="button" disabled={!currency} onClick={() => setCheckoutReady(true)}>Proceed to checkout</button>
    </div>
  </div>;
  return <form action={action} className="stack-form">
    <p><button type="button" className="text-link" onClick={() => setCheckoutReady(false)}>Back to edit cart</button></p>
    {lines}
    {total ? <p><strong>Estimated grand total:</strong> {total}</p> : <p className="form-error" role="alert">Items with different currencies must be ordered separately.</p>}
    <input type="hidden" name="items" value={JSON.stringify(visibleItems)} />
    <input type="hidden" name="request_key" value={requestKey} />
    <label>Email for this order<input name="buyer_email" type="email" defaultValue={defaultEmail} autoComplete="email" required /></label>
    <p>Payment is not available yet. Confirming creates a pending order for the payment workflow.</p>
    {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
    <SubmitButton disabled={!currency}>Confirm and Pay</SubmitButton>
  </form>;
}