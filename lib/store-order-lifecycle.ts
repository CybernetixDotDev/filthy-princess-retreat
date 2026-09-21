import type {
  InnerSanctumMembershipStatus,
  StoreClaimStatus,
  StoreOrderStatus,
} from "./database.types";

export type StoreOrderLifecycle = {
  commercial: string;
  fulfillment: "Fulfilled" | "Authorized" | "Not authorized";
  key: "No key issued" | "Not required" | "Available" | "Claimed" | "Revoked";
  membership: "Not claimed" | "Status unavailable" | "Active" | "Suspended" | "Cancelled";
};

export function commercialStoreOrderLabel(status: StoreOrderStatus) {
  const labels: Record<StoreOrderStatus, string> = {
    pending: "Pending payment",
    paid: "Paid",
    cancelled: "Cancelled",
    failed: "Failed",
  };

  return labels[status];
}

export function deriveStoreOrderLifecycle({
  commercialStatus,
  isAuthorized,
  claimStatus,
  membershipStatus,
  automaticallyFulfilled = false,
}: {
  commercialStatus: StoreOrderStatus;
  isAuthorized: boolean;
  claimStatus: StoreClaimStatus | null;
  membershipStatus: InnerSanctumMembershipStatus | null;
  automaticallyFulfilled?: boolean;
}): StoreOrderLifecycle {
  const claimLabels: Record<StoreClaimStatus, StoreOrderLifecycle["key"]> = {
    available: "Available",
    claimed: "Claimed",
    revoked: "Revoked",
  };
  const membershipLabels: Record<InnerSanctumMembershipStatus, StoreOrderLifecycle["membership"]> = {
    active: "Active",
    suspended: "Suspended",
    cancelled: "Cancelled",
  };

  return {
    commercial: commercialStoreOrderLabel(commercialStatus),
    fulfillment: automaticallyFulfilled ? "Fulfilled" : isAuthorized ? "Authorized" : "Not authorized",
    key: claimStatus ? claimLabels[claimStatus] : automaticallyFulfilled ? "Not required" : "No key issued",
    membership: (automaticallyFulfilled || claimStatus === "claimed") && membershipStatus
      ? membershipLabels[membershipStatus]
      : automaticallyFulfilled ? "Status unavailable" : "Not claimed",
  };
}
