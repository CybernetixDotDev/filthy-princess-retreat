import { randomUUID } from "node:crypto";
import Image from "next/image";
import { StorePurchaseForm } from "@/components/store-purchase-form";
import { getAuthState } from "@/lib/auth";
import { formatStoreMoney } from "@/lib/store";

export default async function StorePage() {
  const { user, supabase } = await getAuthState();
  const { data: products, error } = await supabase
    .from("store_products")
    .select("id,slug,name,short_description,description,price_amount,currency,image_path")
    .eq("status", "active")
    .order("sort_order")
    .order("created_at");

  return <div className="store-page">
    <header className="store-opening">
      <p className="eyebrow">The Store</p>
      <h1>A few things you probably weren&apos;t looking for.</h1>
      <p className="store-opening-line">Until you saw them.</p>
    </header>
    {error ? <p className="store-message">The Store is being difficult. Try again shortly.</p> : null}
    {!error && !products?.length ? <p className="store-message">Nothing is on the counter just yet.</p> : null}
    {products?.map((product) => {
      const price = formatStoreMoney(Number(product.price_amount), product.currency);
      return <article className="store-feature" key={product.id}>
        <div className="store-product-art">
          {product.image_path ? <Image src={product.image_path} alt="" fill sizes="(max-width: 800px) 100vw, 46vw" className="store-product-image" /> : <span aria-hidden="true">FP</span>}
        </div>
        <div className="store-product-copy">
          <p className="eyebrow">Lifetime membership</p>
          <h2>{product.name}</h2>
          <p className="store-product-promise">{product.short_description}</p>
          <div className="store-product-description">
            {product.description.split("\n").map((line, index) => line ? <p key={index}>{line}</p> : null)}
          </div>
          <p className="store-product-clarification">Inner Sanctum benefits vary over time and are offered on a best-effort basis at Cally&apos;s discretion. Membership does not guarantee any specific retreat, event, gift, personal interaction or invitation.</p>
          <p className="store-price">{price}</p>
          <StorePurchaseForm productId={product.id} requestKey={randomUUID()} defaultEmail={user?.email ?? ""} buttonLabel={`Buy Lifetime Access — ${price}`} />
        </div>
      </article>;
    })}
  </div>;
}
