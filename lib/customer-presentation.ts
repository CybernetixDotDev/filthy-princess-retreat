import "server-only";
import { getAuthState } from "@/lib/auth";
import { hasInnerSanctumAccess } from "@/lib/inner-sanctum";
import type { FilthProgression } from "@/lib/database.types";

export type CustomerPresentationState = {
  authenticated: boolean;
  user: { id: string; email: string | null; displayName: string | null } | null;
  isAdmin: boolean;
  hasInnerSanctumAccess: boolean;
  filth: FilthProgression | null;
};

// Presentation only: routes and actions must keep their authoritative guards.
// No persistent cache: the result belongs to the current request's account.
export async function getCustomerPresentationState(): Promise<CustomerPresentationState> {
  const { user, isAdmin, supabase } = await getAuthState();
  if (!user) return { authenticated: false, user: null, isAdmin: false, hasInnerSanctumAccess: false, filth: null };

  const [membership, progression] = await Promise.allSettled([
    hasInnerSanctumAccess(),
    supabase.rpc("get_my_filth_progression"),
  ]);
  // User-editable metadata is only a display label, never an authorization input.
  const displayName = [user.user_metadata?.full_name, user.user_metadata?.name]
    .find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim() ?? null;

  return {
    authenticated: true,
    user: { id: user.id, email: user.email ?? null, displayName },
    isAdmin,
    hasInnerSanctumAccess: membership.status === "fulfilled" && membership.value === true,
    // Keep the RPC's balances, levels and percentage unchanged; unavailable is not zero.
    filth: progression.status === "fulfilled" && !progression.value.error
      ? progression.value.data?.[0] ?? null
      : null,
  };
}
