import type { Metadata } from "next";
import { FilthyShell } from "@/components/filthy-shell";
import "../contributor/contributor.css";

export const metadata: Metadata = { title: "Contribute", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function ContributeLayout({ children }: { children: React.ReactNode }) {
  return <FilthyShell><div className="contributor-shell"><div className="hub-main">{children}</div><footer className="hub-footer">Commission tells you what you&apos;ve earned. Filth remembers what you&apos;ve contributed.</footer></div></FilthyShell>;
}
