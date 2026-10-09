"use client";

import { useActionState, useEffect, useState } from "react";
import { submitPublicRetreatInterest, type PublicRetreatInterestState } from "@/app/actions/enquiries";
import { getPublicRetreatPrice } from "@/app/actions/pricing";
import { SubmitButton } from "@/components/submit-button";
import type { RetreatFormat } from "@/lib/domain";

type Product = { id: string; name: string; positioning: string; allowed_formats: RetreatFormat[] };
type PrivateFormat = "solo" | "couples" | "private_group";
type PriceState =
  | { key: string; status: "error" }
  | { key: string; status: "ready"; totalUsd: string; nights: number; guestCount: number };

const formatLabels: Record<PrivateFormat, string> = { solo: "Solo", couples: "Couple", private_group: "Private Group" };
const privateFormats: ReadonlySet<string> = new Set(["solo", "couples", "private_group"]);

function isPrivateFormat(format: RetreatFormat): format is PrivateFormat {
  return privateFormats.has(format);
}

function guestCountFor(format: PrivateFormat, groupGuests: number) {
  return format === "solo" ? 1 : format === "couples" ? 2 : groupGuests;
}

function displayUsd(value: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(value));
}

function InterestForm({
  product,
  format,
  guestCount,
  onBack,
}: {
  product: Product;
  format: PrivateFormat;
  guestCount: number;
  onBack: () => void;
}) {
  const [state, action] = useActionState<PublicRetreatInterestState, FormData>(submitPublicRetreatInterest, {});

  if (state.success) {
    return (
      <div className="retreat-creative-success" aria-live="polite">
        <p className="retreat-hand retreat-red">Cally knows.</p>
        <h4>Your interest has been sent.</h4>
        <p>Nothing has been booked or charged yet. I&apos;ll be in touch.</p>
      </div>
    );
  }

  return (
    <form action={action} className="retreat-creative-form">
      <input type="hidden" name="product_id" value={product.id} />
      <input type="hidden" name="retreat_format" value={format} />
      <input type="hidden" name="guest_count" value={guestCount} />
      <label>
        Your name
        <input name="full_name" autoComplete="name" minLength={2} maxLength={200} required />
      </label>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" maxLength={320} required />
      </label>
      <label className="retreat-form-wide">
        Anything you&apos;d like Cally to know? <span>(optional)</span>
        <textarea name="message" rows={4} maxLength={2000} />
      </label>
      {state.error ? <p className="retreat-creative-error" role="alert">{state.error}</p> : null}
      <div className="retreat-form-actions">
        <SubmitButton className="retreat-creative-primary">I&apos;M INTERESTED</SubmitButton>
        <button className="retreat-creative-text" type="button" onClick={onBack}>Change my choice</button>
      </div>
      <p className="retreat-offer-reassurance">Enquiring doesn&apos;t commit you to anything. I&apos;ll reply personally and we&apos;ll take it from there.</p>
    </form>
  );
}

export function RetreatOffer({ products }: { products: Product[] }) {
  const [productId, setProductId] = useState("");
  const [format, setFormat] = useState<PrivateFormat | "">("");
  const [groupGuests, setGroupGuests] = useState(3);
  const [price, setPrice] = useState<PriceState | null>(null);
  const [priceAttempt, setPriceAttempt] = useState(0);
  const product = products.find((item) => item.id === productId);
  const formats = product?.allowed_formats.filter(isPrivateFormat) ?? [];
  const guestCount = format ? guestCountFor(format, groupGuests) : 0;
  const priceKey = productId && format ? `${productId}:${format}:${guestCount}` : "";
  const currentPrice = price?.key === priceKey ? price : null;
  const readyPrice = currentPrice?.status === "ready" ? currentPrice : null;

  useEffect(() => {
    if (!productId || !format || !guestCount) return;
    let current = true;
    void getPublicRetreatPrice({ productId, format, guestCount })
      .then((result) => {
        if (!current) return;
        setPrice(
          result.price
            ? {
                key: priceKey,
                status: "ready",
                totalUsd: result.price.totalUsd,
                nights: result.price.nights,
                guestCount: result.price.guestCount,
              }
            : { key: priceKey, status: "error" },
        );
      })
      .catch(() => {
        if (current) setPrice({ key: priceKey, status: "error" });
      });
    return () => {
      current = false;
    };
  }, [format, guestCount, priceAttempt, priceKey, productId]);

  function chooseProduct(next: string) {
    setProductId(next);
    setFormat("");
    setPrice(null);
  }

  function chooseFormat(next: PrivateFormat) {
    setFormat(next);
    setPrice(null);
  }

  function retryPrice() {
    setPrice(null);
    setPriceAttempt((attempt) => attempt + 1);
  }

  return (
    <div className="retreat-offer-flow">
      <fieldset className="retreat-offer-products">
        <legend>Choose experience.</legend>
        <div className="retreat-creative-products">
          {products.map((item) => (
            <button
              type="button"
              key={item.id}
              className={productId === item.id ? "selected" : ""}
              aria-pressed={productId === item.id}
              onClick={() => chooseProduct(item.id)}
            >
              <span>{item.name}</span>
              <small>{item.positioning}</small>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="retreat-offer-format-selection" disabled={!product}>
        <legend>Choose format / who&apos;s coming.</legend>
        <div className="retreat-creative-formats">
          {formats.map((item) => (
            <button
              type="button"
              key={item}
              className={format === item ? "selected" : ""}
              aria-pressed={format === item}
              onClick={() => chooseFormat(item)}
            >
              {formatLabels[item]}
            </button>
          ))}
        </div>
        {format === "private_group" ? (
          <label className="retreat-creative-guests">
            Guest count
            <input
              type="number"
              name="retreat_guest_count"
              min={1}
              max={50}
              value={groupGuests}
              onChange={(event) => {
                setGroupGuests(Math.min(50, Math.max(1, Number(event.target.value) || 1)));
                setPrice(null);
              }}
            />
          </label>
        ) : null}
      </fieldset>

      <div className="retreat-offer-price" aria-live="polite">
        {!product || !format ? (
          <h3>Three nights.</h3>
        ) : !currentPrice ? (
          <>
            <h3>Finding your current price...</h3>
            <p role="status">Checking the latest three-night estimate.</p>
          </>
        ) : currentPrice.status === "error" ? (
          <>
            <h3>The number is shy.</h3>
            <p role="alert">The current price could not be loaded.</p>
            <button className="retreat-price-retry" type="button" onClick={retryPrice}>Try again</button>
          </>
        ) : (
          <>
            <p className="retreat-offer-price-label">Your three-night price</p>
            <p className="retreat-offer-total">{displayUsd(currentPrice.totalUsd)}</p>
            <p>Calculated for {currentPrice.nights} nights and {currentPrice.guestCount} guest{currentPrice.guestCount === 1 ? "" : "s"}. Nothing is booked or charged yet.</p>
          </>
        )}
      </div>

      {readyPrice && product && format ? (
        <div className="retreat-offer-enquiry" aria-labelledby="retreat-enquiry-title">
          <div className="retreat-enquiry-heading">
            <h3 id="retreat-enquiry-title">TELL CALLY YOU WANT TO COME.</h3>
          </div>
          <InterestForm
            product={product}
            format={format}
            guestCount={guestCount}
            onBack={() => {
              setFormat("");
              setPrice(null);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
