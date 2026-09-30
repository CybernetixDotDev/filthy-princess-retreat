import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { StoreClaimForm } from "@/components/store-claim-form";
import { getAuthState } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STORE_CLAIM_TOKEN_PATTERN } from "@/lib/store-claims";

export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function ClaimPage() {
  const token = (await cookies()).get("store_claim_token")?.value ?? "";
  if (!STORE_CLAIM_TOKEN_PATTERN.test(token)) return <main className="auth-page"><section className="auth-card"><p className="eyebrow">Inner Sanctum</p><h1>Claim unavailable.</h1><p>This membership handoff is missing or has expired.</p></section></main>;
  const { user } = await getAuthState();
  if (!user) redirect("/signin?returnTo=/claim");
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_store_claim_state", { p_token: token });
  const state = data?.[0]?.claim_state;
  if (state !== "available") return <main className="auth-page"><section className="auth-card"><p className="eyebrow">Inner Sanctum</p><h1>{state === "claimed" ? "Already claimed." : state === "revoked" ? "Claim revoked." : "Claim unavailable."}</h1></section></main>;
  return <main className="auth-page"><section className="auth-card"><p className="eyebrow">Inner Sanctum</p><h1>Claim your membership.</h1><p>Your verified payment is ready to attach to this signed-in account.</p><StoreClaimForm token={token} /></section></main>;
}