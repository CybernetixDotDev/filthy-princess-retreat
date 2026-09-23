"use client";

import { useActionState } from "react";
import { bindStoreOrder, redeemFilthStoreOrder, submitStorePayment } from "@/app/actions/store-checkout";
import { SubmitButton } from "@/components/submit-button";

export function StoreCheckoutControls({ reference, bind }: { reference: string; bind: boolean }) {
  const [state, action] = useActionState(bind ? bindStoreOrder : submitStorePayment, {});
  return <form action={action} className="stack-form">
    <input type="hidden" name="order_reference" value={reference} />
    {bind ? <p>Continue to link this order to your signed-in account.</p> : <>
      <label>Payment method<select name="payment_method" required><option value="manual_transfer">Manual bank transfer</option><option value="manual_crypto">Wallet-to-wallet crypto</option><option value="manual_other">Other agreed manual method</option></select></label>
      <label>Payment reference or transaction hash (optional)<input name="payment_reference" maxLength={300} /></label>
    </>}
    {state.error && <p role="alert">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
    <SubmitButton>{bind ? "Continue with this account" : "I've made payment"}</SubmitButton>
  </form>;
}

export function FilthCheckoutControls({ reference, price, available }: { reference: string; price: number; available: number }) {
  const [state, action] = useActionState(redeemFilthStoreOrder, {});
  const canAfford = available >= price;
  return <form action={action} className="stack-form">
    <input type="hidden" name="order_reference" value={reference} />
    <p>Review this carefully before committing your Filth.</p>
    <dl><dt>Filth price</dt><dd>{price.toLocaleString("en-ZA")} Filth</dd><dt>Available now</dt><dd>{available.toLocaleString("en-ZA")} Filth</dd><dt>Afterwards</dt><dd>{Math.max(0, available - price).toLocaleString("en-ZA")} Filth</dd></dl>
    {!canAfford ? <p role="alert">You need {(price - available).toLocaleString("en-ZA")} more Filth. <a href="/contribute">Get Filthier →</a></p> : null}
    {state.error && <p role="alert">{state.error}</p>}
    {state.message && <p role="status">{state.message}</p>}
    <SubmitButton disabled={!canAfford}>Redeem {price.toLocaleString("en-ZA")} Filth →</SubmitButton>
  </form>;
}
