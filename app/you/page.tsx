import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canChangeAccountPassword, hasEmailIdentity, linkedProviders } from "@/lib/account-identity";
import { PasswordChangeForm } from "@/components/password-change-form";
import { SecureAccountEmailForm, SecureAccountPasswordForm } from "@/components/secure-account-forms";
import { signOut } from "@/app/actions/auth";
import { FilthyShell } from "@/components/filthy-shell";

export const metadata = { title: "You", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function YouPage({ searchParams }: { searchParams: Promise<{ secure?: string }> }) {
  const query = await searchParams;
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/signin?returnTo=/you");
  const providers = linkedProviders(user);
  const claims = hasEmailIdentity(user) ? await supabase.auth.getClaims() : null;
  const canChangePassword = canChangeAccountPassword(user, claims?.error ? undefined : claims?.data?.claims.amr);
  if (user.is_anonymous === true) {
    const { data: hasMembership } = await supabase.rpc("has_inner_sanctum_access");
    return <FilthyShell><div className="account-page"><section className="account-panel stack-form">
      <p className="eyebrow">Your account</p><h1>Secure your account</h1>
      {hasMembership === true ? <p>Your membership is already yours.</p> : null}
      <SecureAccountEmailForm defaultEmail={user.email ?? ""} />
      <form action={signOut}><button className="button" type="submit">Sign out</button></form>
    </section></div></FilthyShell>;
  }
  if (query.secure === "password" && user.email_confirmed_at && hasEmailIdentity(user)) {
    return <FilthyShell><div className="account-page"><section className="account-panel stack-form">
      <p className="eyebrow">Your account</p><h1>Almost there</h1>
      <p>Create a password for your Inner Sanctum account.</p>
      <SecureAccountPasswordForm />
    </section></div></FilthyShell>;
  }
  return <FilthyShell><div className="account-page"><section className="account-panel stack-form">
    <p className="eyebrow">Account &amp; settings</p><h1>You</h1>
    <dl><dt>Email</dt><dd style={{ overflowWrap: "anywhere" }}>{user.email ?? "No email available"}</dd><dt>Linked sign-in providers</dt><dd>{providers.map((provider) => provider === "google" ? "Google" : provider === "email" ? "Email" : provider).join(", ") || "Not available"}</dd></dl>
    {canChangePassword ? <section><h2>Change password</h2><PasswordChangeForm /></section> : providers.length === 1 && providers[0] === "google" ? <p>You sign in with Google. Continue using Google to access your account.</p> : null}
    <form action={signOut}><button className="button" type="submit">Sign out</button></form>
  </section></div></FilthyShell>;
}
