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
  searchParams: Promise<{ product?: string | string[] }>;
}) {
  const parsed = z.uuid().safeParse((await searchParams).product);
  if (!parsed.success) notFound();
  const productId = parsed.data.toLowerCase();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(`/checkout/start?product=${productId}`)}`);
  const { data: product, error } = await supabase.from("store_products")
    .select("name, price_amount, currency").eq("id", productId).eq("status", "active").maybeSingle();
  if (error) throw new Error("Unable to load checkout product.");
  if (!product) notFound();

  return <main className="store-order-page"><section className="store-order-summary">
    <p className="eyebrow">Checkout</p><h1>{product.name}</h1>
    <p>{formatStoreMoney(Number(product.price_amount), product.currency)}</p>
    <p>Signed in as {user.email}. Continue to create this order with your account.</p>
    <StoreCheckoutStartControls key={`${user.id}:${productId}`} product={productId} request={randomUUID()} />
  </section></main>;
}
