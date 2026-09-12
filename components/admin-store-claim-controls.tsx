"use client";

import { useActionState, useState } from "react";
import {
  authorizeStoreFulfillment,
  reissueStoreClaim,
  revokeStoreClaim,
  type AdminClaimActionState,
} from "@/app/admin/store/claim-actions";
import { selectOneTimeClaimResult } from "@/lib/admin-store-claim-result";
import { SubmitButton } from "./submit-button";

type ClaimSummary = { claim_status: "available" | "claimed" | "revoked" } | null;

function OneTimeKey({ state }: { state: AdminClaimActionState }) {
  const [copied, setCopied] = useState(false);
  if (!state.claimUrl) return state.message ? <p role="status">{state.message}</p> : null;
  return <div className="admin-one-time-key" role="status">
    <p className="eyebrow">Key created</p>
    <p>{state.message ?? "Copy this link now. It cannot be retrieved again."}</p>
    <label>Claim link<input value={state.claimUrl} readOnly onFocus={(event) => event.currentTarget.select()} /></label>
    <button type="button" className="secondary-button" onClick={async () => {
      await navigator.clipboard.writeText(state.claimUrl ?? "");
      setCopied(true);
    }}>{copied ? "Copied" : "Copy key link"}</button>
  </div>;
}

export function AdminStoreClaimControls({ orderId, authorizationExists, latestClaim }: {
  orderId: string;
  authorizationExists: boolean;
  latestClaim: ClaimSummary;
}) {
  const [authorizeState, authorizeAction] = useActionState(authorizeStoreFulfillment, {});
  const [reissueState, reissueAction] = useActionState(reissueStoreClaim, {});
  const [revokeState, revokeAction] = useActionState(revokeStoreClaim, {});
  const isClaimed = latestClaim?.claim_status === "claimed";
  const isAvailable = latestClaim?.claim_status === "available";
  const oneTimeResult = selectOneTimeClaimResult(authorizeState, reissueState);

  return <div className="admin-claim-controls">
    <p className="admin-caution">Development/admin action. This allows the order to issue a membership claim. It does not represent payment-provider verification.</p>
    {!authorizationExists && <form action={authorizeAction}>
      <input type="hidden" name="order_id" value={orderId} />
      <SubmitButton>Authorize fulfillment</SubmitButton>
      {authorizeState.error && <p className="form-error" role="alert">{authorizeState.error}</p>}
    </form>}
    {authorizationExists && !isClaimed && <div className="admin-claim-actions">
      {isAvailable && <form action={revokeAction}>
        <input type="hidden" name="order_id" value={orderId} />
        <SubmitButton>Revoke key</SubmitButton>
        {revokeState.error && <p className="form-error" role="alert">{revokeState.error}</p>}
        {revokeState.message && <p role="status">{revokeState.message}</p>}
      </form>}
      <form action={reissueAction}>
        <input type="hidden" name="order_id" value={orderId} />
        <SubmitButton>Reissue key</SubmitButton>
        {reissueState.error && <p className="form-error" role="alert">{reissueState.error}</p>}
      </form>
    </div>}
    {oneTimeResult && <OneTimeKey state={oneTimeResult} />}
  </div>;
}
