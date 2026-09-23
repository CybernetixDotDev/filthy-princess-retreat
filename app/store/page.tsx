import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FilthyShell } from "@/components/filthy-shell";
import { createClient } from "@/lib/supabase/server";
import { formatStoreMoney, storeLabel, storeProductImageUrl } from "@/lib/store";

export const metadata: Metadata = { title: "Store", robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function StorePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/signin?next=/store");

  const [{ data: products, error }, { data: progression, error: progressionError }] = await Promise.all([
    supabase
    .from("store_products")
    .select("id, name, short_description, description, product_type, price_amount, currency, money_enabled, filth_enabled, filth_price, filth_audience, inventory_unlimited, inventory_quantity, show_remaining_quantity, image_path, sort_order")
    .eq("status", "active")
    .order("sort_order")
    .order("created_at"),
    supabase.rpc("get_my_filth_progression"),
  ]);
  if (error || progressionError || !progression?.[0]) throw new Error("The Store could not be opened.");
  const filth = progression[0];

  return <FilthyShell><div className="store-page private-store-page">
    <header className="store-opening">
      <p className="sanctum-eyebrow">The Store</p>
      <h1>Things to keep.</h1>
      <p className="store-opening-line">A few things from inside Filthy Princess.</p>
    </header>
    <section className="private-store-catalogue" aria-label="Store products">
      {products?.map((product) => {
        const soldOut = !product.inventory_unlimited && product.inventory_quantity === 0;
        const filthEligible = product.filth_enabled && (product.filth_audience === "authenticated" || filth.can_spend_filth);
        const canBuyWithMoney = product.money_enabled && !soldOut;
        const filthRemaining = product.filth_enabled && product.filth_price ? Math.max(0, product.filth_price - filth.available_filth) : null;
        return <article className="private-store-card" key={product.id}>
        <div className="private-store-card-image">
          {storeProductImageUrl(supabase, product.image_path) ? <img /* eslint-disable-line @next/next/no-img-element */ src={storeProductImageUrl(supabase, product.image_path)!} alt="" /> : <span aria-hidden="true">{product.name.charAt(0)}</span>}
        </div>
        <div className="private-store-card-copy">
          <p className="sanctum-eyebrow">{storeLabel(product.product_type)}</p>
          <h2>{product.name}</h2>
          <p>{product.short_description}</p>
          <div className="private-store-acquisition">
            {product.money_enabled ? <strong>{formatStoreMoney(Number(product.price_amount), product.currency)}</strong> : null}
            {product.filth_enabled && product.filth_price ? <strong>{product.filth_price.toLocaleString("en-ZA")} Filth</strong> : null}
            {product.money_enabled && product.filth_enabled ? <span>or</span> : null}
          </div>
          {product.filth_enabled ? <p className="private-store-filth-note">{!filthEligible ? "Inner Sanctum unlocks Filth redemption." : filthRemaining ? `${filthRemaining.toLocaleString("en-ZA")} more and it's yours.` : "You have enough Filth."} Redemption is coming soon.</p> : null}
          {!product.inventory_unlimited ? <p className="private-store-stock">{soldOut ? "Sold out" : product.show_remaining_quantity ? product.inventory_quantity === 1 ? "Only one." : `Only ${product.inventory_quantity} left` : "Limited availability"}</p> : null}
          <div className="private-store-card-footer">
            {canBuyWithMoney ? <Link className="sanctum-link" href={`/checkout/start?product=${product.id}`}>Buy with money</Link> : <span className="private-store-unavailable">{soldOut ? "Unavailable" : "Not available with money"}</span>}
            {product.filth_enabled && !soldOut && filthEligible && filthRemaining === 0 ? <Link className="sanctum-link" href={`/checkout/start?product=${product.id}&method=filth`}>Get with Filth</Link> : null}
            {product.filth_enabled && !soldOut && filthEligible && filthRemaining && filthRemaining > 0 ? <Link className="sanctum-link" href="/contribute">Get Filthier →</Link> : null}
          </div>
        </div>
        </article>;
      })}
      {!products?.length ? <div className="private-store-empty"><h2>Nothing is waiting here yet.</h2><p>Come back another time.</p></div> : null}
    </section>
  </div></FilthyShell>;
}