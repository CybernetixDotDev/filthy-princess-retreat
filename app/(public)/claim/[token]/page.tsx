import type { Metadata } from "next";
import Link from "next/link";
import { StoreClaimForm } from "@/components/store-claim-form";
import { getAuthState } from "@/lib/auth";
import { CLAIMED_KEY_EXIT, resolveStoreClaimView, type StoreClaimState } from "@/lib/store-claim-state";
import { STORE_CLAIM_TOKEN_PATTERN, storeClaimPath } from "@/lib/store-claims";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const auth = await getAuthState();
  let claimState: StoreClaimState = "invalid";
  let productName: string | null = null;
  if (STORE_CLAIM_TOKEN_PATTERN.test(token)) {
    const { data } = await auth.supabase.rpc("get_store_claim_state", { p_token: token });
    const result = data?.[0];
    if (result && ["invalid", "revoked", "claimed", "available"].includes(result.claim_state)) {
      claimState = result.claim_state as StoreClaimState;
      productName = result.product_name;
    }
  }
  const view = resolveStoreClaimView(claimState, Boolean(auth.user));

  return <main className="claim-page"><section className="claim-card">
    {view === "invalid" && <><p className="eyebrow">Inner Sanctum</p><h1>This key doesn&apos;t open anything.</h1></>}
    {view === "revoked" && <><p className="eyebrow">Inner Sanctum</p><h1>This key is no longer available.</h1></>}
    {view === "claimed" && <><p className="eyebrow">Inner Sanctum</p><h1>This key has already been claimed.</h1><p>{CLAIMED_KEY_EXIT.supportingCopy}</p><Link className="primary-link" href={CLAIMED_KEY_EXIT.href}>{CLAIMED_KEY_EXIT.label}</Link></>}
    {view === "waiting" && <><p className="eyebrow">Inner Sanctum</p><h1>Your key is waiting.</h1><p>Sign in or create your account to claim your Lifetime Inner Sanctum Membership.</p><Link className="primary-link" href={`/signin?next=${encodeURIComponent(storeClaimPath(token))}`}>Continue to your account</Link></>}
    {view === "confirm" && <><p className="eyebrow">Your key</p><h1>This one belongs to a {productName ?? "Lifetime Inner Sanctum Membership"}.</h1><p>Claim it to this account and the door opens.</p><StoreClaimForm token={token} /></>}
  </section></main>;
}
