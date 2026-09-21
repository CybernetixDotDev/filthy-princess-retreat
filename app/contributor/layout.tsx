import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import { hasInnerSanctumAccess } from "@/lib/inner-sanctum";
import { requireContributorAuth } from "@/lib/contributor-auth";
import "./contributor.css";
export const metadata: Metadata = { title: "Contributor", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ContributorLayout({ children }: { children: React.ReactNode }) {
 await requireContributorAuth("/contribute");
 const hasAccess = await hasInnerSanctumAccess();
 return <div className="contributor-shell"><header className="hub-nav"><Link href="/contribute" className="hub-brand">Filthy Princess<span>Contribution Hub</span></Link><nav aria-label="Contribution navigation"><Link href="/contribute">Contribute</Link>{hasAccess && <Link href="/inner-sanctum">Inner Sanctum</Link>}<Link href="/contributor/submit">Submit contribution</Link><form action={signOut}><button type="submit">Sign out</button></form></nav></header><main className="hub-main">{children}</main><footer className="hub-footer">Commission tells you what you’ve earned. Filth remembers what you’ve contributed.</footer></div>;
}
