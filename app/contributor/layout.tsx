import type { Metadata } from "next";
import Link from "next/link";
import { signOut } from "@/app/actions/auth";
import "./contributor.css";
export const metadata: Metadata = { title: "Contributor", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function ContributorLayout({ children }: { children: React.ReactNode }) {
 return <div className="contributor-shell"><header className="hub-nav"><Link href="/contributor" className="hub-brand">Filthy Princess<span>Contribution Hub</span></Link><nav aria-label="Contribution navigation"><Link href="/contributor">Your Hub</Link><Link href="/contributor/submit">Contribute</Link><form action={signOut}><button type="submit">Sign out</button></form></nav></header><main className="hub-main">{children}</main><footer className="hub-footer">Commission tells you what you’ve earned. Filth remembers what you’ve contributed.</footer></div>;
}
