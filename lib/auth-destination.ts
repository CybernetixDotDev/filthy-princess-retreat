import "server-only";
import { safeNextPath } from "@/lib/domain";
import { hasInnerSanctumAccess } from "@/lib/inner-sanctum";

export async function authenticatedDestination(next?: string | null) {
  const explicit = safeNextPath(next, "");
  if (explicit) return explicit;
  return await hasInnerSanctumAccess() ? "/inner-sanctum" : "/contribute";
}
