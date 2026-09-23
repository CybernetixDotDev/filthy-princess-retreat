import type { Metadata } from "next";
import { FilthyShell } from "@/components/filthy-shell";
import { requireContributorAuth } from "@/lib/contributor-auth";
import "./contributor.css";
export const metadata: Metadata = { title: "Contributor", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default async function ContributorLayout({ children }: { children: React.ReactNode }) {
 await requireContributorAuth("/contribute");
 return <FilthyShell><div className="contributor-shell"><div className="hub-main">{children}</div><footer className="hub-footer">Commission tells you what you’ve earned. Filth remembers what you’ve contributed.</footer></div></FilthyShell>;
}
