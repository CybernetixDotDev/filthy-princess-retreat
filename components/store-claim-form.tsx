"use client";

import Link from "next/link";
import { useActionState } from "react";
import { redeemStoreClaim, type StoreClaimActionState } from "@/app/actions/store-claims";
import { SubmitButton } from "./submit-button";

export function StoreClaimForm({ token }: { token: string }) {
  const [state, action] = useActionState<StoreClaimActionState, FormData>(redeemStoreClaim, {});
  if (state.state === "success") return <div className="claim-result" role="status">
    <p className="eyebrow">Inner Sanctum</p><h1>There.</h1><p>Told you I&apos;d let you in.</p>
    <Link className="primary-link" href="/inner-sanctum">Enter the Inner Sanctum</Link>
  </div>;
  if (state.state === "already_member") return <div className="claim-result" role="status">
    <p className="eyebrow">Inner Sanctum</p><h1>You&apos;re already inside.</h1>
    <p>This account already has Lifetime Inner Sanctum Membership, so this key hasn&apos;t been used.</p>
    <Link className="text-link" href="/inner-sanctum">Enter the Inner Sanctum</Link>
  </div>;
  if (state.state === "revoked") return <ClaimMessage headline="This key is no longer available." />;
  if (state.state === "claimed") return <ClaimMessage headline="This key has already been claimed." />;
  if (state.state === "invalid") return <ClaimMessage headline="This key doesn't open anything." />;

  return <form action={action} className="claim-confirmation">
    <input type="hidden" name="token" value={token} />
    <SubmitButton>Claim my key</SubmitButton>
    {state.error && <p className="form-error" role="alert">{state.error}</p>}
  </form>;
}

function ClaimMessage({ headline }: { headline: string }) {
  return <div className="claim-result" role="status"><p className="eyebrow">Inner Sanctum</p><h1>{headline}</h1></div>;
}
