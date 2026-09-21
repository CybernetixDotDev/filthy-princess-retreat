import Link from "next/link";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { getAuthState } from "@/lib/auth";
import { resolveInnerSanctumRouteState } from "@/lib/inner-sanctum-route";

export default async function InnerSanctumLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthState();
  if (resolveInnerSanctumRouteState(Boolean(user), false) === "sign_in") redirect("/signin?next=/inner-sanctum");

  return <div className="sanctum-shell">
    <header className="sanctum-header"><nav aria-label="Inner Sanctum navigation">
      <Link className="sanctum-wordmark" href="/inner-sanctum">Inner Sanctum</Link>
      <div className="sanctum-header-actions"><Link href="/inner-sanctum">Inside</Link><Link href="/contribute">Contribute</Link><Link href="/inner-sanctum/tasks">Tasks</Link><Link href="/inner-sanctum/collection">Collection</Link><Link href="/inner-sanctum/benefits">Benefits</Link><Link href="/inner-sanctum/you">You</Link><form action={signOut}><button type="submit">Sign out</button></form></div>
    </nav></header>
    <main className="inner-sanctum-main">{children}</main>
  </div>;
}
