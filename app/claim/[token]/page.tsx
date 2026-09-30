import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StoreClaimForm } from "@/components/store-claim-form";
import { getAuthState } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STORE_CLAIM_TOKEN_PATTERN } from "@/lib/store-claims";

export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function ClaimTokenPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!STORE_CLAIM_TOKEN_PATTERN.test(token)) notFound();
  const { user } = await getAuthState();
  if (!user) redirect(`/signin?returnTo=${encodeURIComponent(`/claim/${token}`)}`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_store_claim_state", { p_token: token });
  const state = data?.[0]?.claim_state;
  if (state !== "available") return <main className="auth-page"><section className="auth-card"><p className="eyebrow">Inner Sanctum</p><h1>{state === "claimed" ? "Already claimed." : state === "revoked" ? "Claim revoked." : "Claim unavailable."}</h1><Link className="text-link" href="/signin">Return to sign in</Link></section></main>;
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">Inner Sanctum</p><h1>Claim your membership.</h1><p>This secure claim link can be used once by the signed-in account.</p><StoreClaimForm token={token} /></section></main>;
}