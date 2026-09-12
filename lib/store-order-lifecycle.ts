import type {
  InnerSanctumMembershipStatus,
  StoreClaimStatus,
  StoreOrderStatus,
} from "./database.types";

export type StoreOrderLifecycle = {
  commercial: string;
  fulfillment: "Authorized" | "Not authorized";
  key: "No key issued" | "Available" | "Claimed" | "Revoked";
  membership: "Not claimed" | "Active" | "Suspended" | "Cancelled";
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
}: {
  commercialStatus: StoreOrderStatus;
  isAuthorized: boolean;
  claimStatus: StoreClaimStatus | null;
  membershipStatus: InnerSanctumMembershipStatus | null;
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
    fulfillment: isAuthorized ? "Authorized" : "Not authorized",
    key: claimStatus ? claimLabels[claimStatus] : "No key issued",
    membership: claimStatus === "claimed" && membershipStatus
      ? membershipLabels[membershipStatus]
      : "Not claimed",
  };
}
