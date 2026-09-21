import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/signin-form";
import { getAuthState } from "@/lib/auth";
import { authenticatedDestination } from "@/lib/auth-destination";
import { authReturnPath } from "@/lib/auth-return";
export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" as const };
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ mode?: string; next?: string; returnTo?: string; authError?: string }> }) {
  const { user } = await getAuthState();
  const query = await searchParams;
  const next = authReturnPath(query.next, query.returnTo);
  if (user) redirect(await authenticatedDestination(next));
  const initialMode = query.mode === "signup" ? "signup" : "signin";
  return <main className="auth-page"><div className="auth-card"><Link href="/"><Image src="/assets/lipstickKiss.png" alt="Filthy Princess" width={90} height={64} /></Link><p className="eyebrow">Your account</p><h1>Welcome</h1>{query.authError === "callback" && <p className="form-error" role="alert">Sign-in could not be completed. It may have been cancelled or the link expired. Please try again or use your email and password.</p>}<SignInForm next={next} initialMode={initialMode} /><Link className="text-link" href="/">Return to the entrance</Link></div></main>;
}
