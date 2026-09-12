export type InnerSanctumRouteState = "sign_in" | "access_boundary" | "member";

export function resolveInnerSanctumRouteState(
  authenticated: boolean,
  hasAccess: boolean,
): InnerSanctumRouteState {
  if (!authenticated) return "sign_in";
  return hasAccess ? "member" : "access_boundary";
}
