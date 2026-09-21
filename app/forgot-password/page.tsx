import Link from "next/link";
import { PasswordResetRequestForm } from "@/components/password-reset-request-form";

export const metadata = { title: "Forgot password", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default function ForgotPasswordPage() {
  return <main className="auth-page"><div className="auth-card stack-form"><p className="eyebrow">Your account</p><h1 style={{ fontSize: "clamp(2rem, 7vw, 3rem)" }}>Forgot password?</h1><p>We&apos;ll email you a link to choose a new password.</p><PasswordResetRequestForm /><Link className="text-link" href="/signin">Back to Sign In</Link></div></main>;
}
