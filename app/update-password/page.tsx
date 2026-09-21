import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { hasEmailIdentity } from "@/lib/account-identity";
import { PasswordChangeForm } from "@/components/password-change-form";

export const metadata = { title: "Update password", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function UpdatePasswordPage() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  return <main className="auth-page"><div className="auth-card stack-form"><p className="eyebrow">Your account</p><h1 style={{ fontSize: "clamp(2rem, 7vw, 3rem)" }}>Choose a new password</h1>
    {error || !user ? <><p>Open the recovery link from your email in the browser where you requested it. If it has expired, request another.</p><Link className="text-link" href="/forgot-password">Request a recovery email</Link></> : hasEmailIdentity(user) ? <PasswordChangeForm /> : <p>This account uses a linked sign-in provider. Password changes are not available here.</p>}
    <Link className="text-link" href="/signin">Back to Sign In</Link>
  </div></main>;
}
