import { redirect } from "next/navigation";
import { FilthyShell } from "@/components/filthy-shell";
import { InnerSanctumLocalNav } from "@/components/inner-sanctum-local-nav";
import { getAuthState } from "@/lib/auth";
import { resolveInnerSanctumRouteState } from "@/lib/inner-sanctum-route";

export default async function InnerSanctumLayout({ children }: { children: React.ReactNode }) {
  const { user } = await getAuthState();
  if (resolveInnerSanctumRouteState(Boolean(user), false) === "sign_in") redirect("/signin?returnTo=/inner-sanctum");

  return <FilthyShell><div className="sanctum-shell">
    <header className="sanctum-local-header"><InnerSanctumLocalNav /></header>
    <div className="inner-sanctum-main">{children}</div>
  </div></FilthyShell>;
}
