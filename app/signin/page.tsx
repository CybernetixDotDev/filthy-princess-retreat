import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignInForm } from "@/components/signin-form";
import { getAuthState } from "@/lib/auth";
import { safeNextPath } from "@/lib/domain";
export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) { const { isAdmin } = await getAuthState(); const query = await searchParams; const next = safeNextPath(query.next, "/home"); if (isAdmin) redirect(next); return <main className="auth-page"><div className="auth-card"><Link href="/home"><Image src="/assets/lipstickKiss.png" alt="Filthy Princess" width={90} height={64} /></Link><p className="eyebrow">Your account</p><h1>Welcome</h1><SignInForm next={next} /><Link className="text-link" href="/home">Return home</Link></div></main>; }
