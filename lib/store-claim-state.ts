export type StoreClaimState = "invalid" | "revoked" | "claimed" | "available";
export type StoreClaimView = "invalid" | "revoked" | "claimed" | "waiting" | "confirm";

export const CLAIMED_KEY_EXIT = {
  supportingCopy: "If this key belongs to your account, you can continue into the Inner Sanctum.",
  label: "Take me to the Inner Sanctum",
  href: "/inner-sanctum",
} as const;

export function resolveStoreClaimView(claimState: StoreClaimState, isAuthenticated: boolean): StoreClaimView {
  if (claimState !== "available") return claimState;
  return isAuthenticated ? "confirm" : "waiting";
}
