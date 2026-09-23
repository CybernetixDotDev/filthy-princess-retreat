import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { formatStoreMoney } from "@/lib/store";
import { StoreCheckoutStartControls } from "@/components/store-checkout-start-controls";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function CheckoutStartPage({ searchParams }: {
  searchParams: Promise<{ product?: string | string[]; method?: string | string[] }>;
}) {
  const params = await searchParams;
  const parsed = z.uuid().safeParse(params.product);
  if (!parsed.success) notFound();
  const productId = parsed.data.toLowerCase();
  const method = z.enum(["money", "filth"]).catch("money").parse(params.method);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/checkout/start?product=${productId}`)}`);
  const { data: product, error } = await supabase.from("store_products")
    .select("name, price_amount, currency, money_enabled, filth_enabled, filth_price, filth_audience").eq("id", productId).eq("status", "active").maybeSingle();
  if (error) throw new Error("Unable to load checkout product.");
  if (!product) notFound();

  const canUseMethod = method === "money" ? product.money_enabled : product.filth_enabled;
  if (!canUseMethod) notFound();
  return <main className="store-order-page"><section className="store-order-summary">
    <p className="eyebrow">Checkout</p><h1>{product.name}</h1>
    <p>{method === "filth" ? `${product.filth_price?.toLocaleString("en-ZA")} Filth` : formatStoreMoney(Number(product.price_amount), product.currency)}</p>
    <p>Signed in as {user.email}. Continue to create this order with your account.</p>
    <StoreCheckoutStartControls key={`${user.id}:${productId}:${method}`} product={productId} request={randomUUID()} method={method} />
  </section></main>;
}
