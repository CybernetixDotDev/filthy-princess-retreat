export type StoreCartItem = { productId: string; quantity: number };
export type StoreOrderRpcItem = { product_id: string; quantity: number };

export type StoreCartProduct = {
  id: string;
  name: string;
  price_amount: number;
  currency: string;
  money_enabled: boolean;
  inventory_unlimited: boolean;
  inventory_quantity: number | null;
};

export const STORE_CART_STORAGE_KEY = "filthy-princess-store-cart";

export function normalizeStoreCart(value: unknown): StoreCartItem[] {
  if (!Array.isArray(value)) return [];
  const quantities = new Map<string, number>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const productId = "productId" in item && typeof item.productId === "string" ? item.productId : null;
    const quantity = "quantity" in item && typeof item.quantity === "number" && Number.isInteger(item.quantity) ? item.quantity : 0;
    if (!productId || quantity <= 0) continue;
    quantities.set(productId, Math.min(100, (quantities.get(productId) ?? 0) + Math.min(100, quantity)));
  }
  return [...quantities.entries()].map(([productId, quantity]) => ({ productId, quantity }));
}

export function storeCartTotal(items: StoreCartItem[], products: StoreCartProduct[]) {
  const productById = new Map(products.map((product) => [product.id, product]));
  return items.reduce((total, item) => {
    const product = productById.get(item.productId);
    return product?.money_enabled ? total + Number(product.price_amount) * item.quantity : total;
  }, 0);
}

export function storeCartCount(items: StoreCartItem[]) {
  return items.reduce((count, item) => count + item.quantity, 0);
}

export function toStoreOrderRpcItems(items: StoreCartItem[]): StoreOrderRpcItem[] {
  return items.map(({ productId, quantity }) => ({ product_id: productId, quantity }));
}

export function parseStoreCartSnapshot(snapshot: string) {
  try {
    return normalizeStoreCart(JSON.parse(snapshot));
  } catch {
    return [];
  }
}

export function storeCartCurrency(items: StoreCartItem[], products: StoreCartProduct[]) {
  const currencies = new Set(items.map((item) => products.find((product) => product.id === item.productId)?.currency).filter(Boolean));
  return currencies.size === 1 ? [...currencies][0] : null;
}