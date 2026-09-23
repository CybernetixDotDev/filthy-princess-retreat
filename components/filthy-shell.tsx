import type { ReactNode } from "react";
import { getCustomerPresentationState } from "@/lib/customer-presentation";
import { FilthyNav } from "@/components/filthy-nav";

// Shared footer/overlays can follow main in a later pass.
// Children supply content, not another main landmark. No route adopts this yet.
export async function FilthyShell({ children }: { children: ReactNode }) {
  const state = await getCustomerPresentationState();
  return <div className="filthy-shell"><FilthyNav state={state} /><main className="filthy-shell-main">{children}</main></div>;
}
