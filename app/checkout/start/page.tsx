import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { StoreCartCheckout } from "@/components/store-cart-checkout";
import { StoreCheckoutStartControls } from "@/components/store-checkout-start-controls";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function CheckoutStartPage({ searchParams }: {
  searchParams: Promise<{ product?: string | string[]; method?: string | string[] }>;
}) {
  const params = await searchParams;
  const method = z.enum(["money", "filth"]).catch("money").parse(params.method);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (method === "filth") {
    const parsedProduct = z.uuid().safeParse(params.product);
    if (!user) redirect(`/signin?next=${encodeURIComponent(`/checkout/start?product=${parsedProduct.success ? parsedProduct.data : ""}&method=filth`)}`);
    if (!parsedProduct.success) notFound();
    const { data: product, error: productError } = await supabase.from("store_products")
      .select("name, price_amount, currency, money_enabled, filth_enabled, filth_price, filth_audience")
      .eq("id", parsedProduct.data).eq("status", "active").maybeSingle();
    if (productError) throw new Error("Unable to load checkout product.");
    if (!product?.filth_enabled) notFound();
    return <main className="store-order-page store-checkout-start"><section className="store-order-summary">
      <p className="eyebrow">Checkout</p><h1>{product.name}</h1>
      <p>{product.filth_price?.toLocaleString("en-ZA")} Filth</p>
      <p>Signed in as {user.email}. Continue to create this Filth order with your account.</p>
      <StoreCheckoutStartControls key={`${user.id}:${parsedProduct.data}:filth`} product={parsedProduct.data} request={randomUUID()} method="filth" />
    </section></main>;
  }
  const { data: products, error } = await supabase.from("store_products")
    .select("id, name, price_amount, currency, money_enabled, inventory_unlimited, inventory_quantity")
    .eq("status", "active").order("sort_order").order("created_at");
  if (error) throw new Error("Unable to load checkout product.");
  return <main className="store-order-page store-checkout-start"><section className="store-order-summary">
    <p className="eyebrow">Checkout</p><h1>Review your cart</h1>
    <p>{user ? `Signed in as ${user.email}.` : "Enter your email so we can identify this order."}</p>
    <StoreCartCheckout products={products ?? []} defaultEmail={user?.email ?? ""} />
  </section></main>;
}
