import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canChangeAccountPassword, hasEmailIdentity, linkedProviders } from "@/lib/account-identity";
import { PasswordChangeForm } from "@/components/password-change-form";
import { signOut } from "@/app/actions/auth";
import { FilthyShell } from "@/components/filthy-shell";

export const metadata = { title: "You", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function YouPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/signin?returnTo=/you");
  const providers = linkedProviders(user);
  const claims = hasEmailIdentity(user) ? await supabase.auth.getClaims() : null;
  const canChangePassword = canChangeAccountPassword(user, claims?.error ? undefined : claims?.data?.claims.amr);
  return <FilthyShell><div className="account-page"><section className="account-panel stack-form">
    <p className="eyebrow">Account &amp; settings</p><h1>You</h1>
    <dl><dt>Email</dt><dd style={{ overflowWrap: "anywhere" }}>{user.email ?? "No email available"}</dd><dt>Linked sign-in providers</dt><dd>{providers.map((provider) => provider === "google" ? "Google" : provider === "email" ? "Email" : provider).join(", ") || "Not available"}</dd></dl>
    {canChangePassword ? <section><h2>Change password</h2><PasswordChangeForm /></section> : providers.length === 1 && providers[0] === "google" ? <p>You sign in with Google. Continue using Google to access your account.</p> : null}
    <form action={signOut}><button className="button" type="submit">Sign out</button></form>
  </section></div></FilthyShell>;
}
