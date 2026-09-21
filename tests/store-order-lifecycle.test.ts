import assert from "node:assert/strict";
import test from "node:test";
import {
  commercialStoreOrderLabel,
  deriveStoreOrderLifecycle,
} from "../lib/store-order-lifecycle.ts";

test("pending commercial status is presented as pending payment", () => {
  assert.equal(commercialStoreOrderLabel("pending"), "Pending payment");
});

test("verified checkout membership is fulfilled without a claim key", () => {
  assert.deepEqual(deriveStoreOrderLifecycle({ commercialStatus: "paid", isAuthorized: false,
    claimStatus: null, membershipStatus: "active", automaticallyFulfilled: true }), {
    commercial: "Paid", fulfillment: "Fulfilled", key: "Not required", membership: "Active",
  });
});

test("automatic fulfillment preserves current membership status without implying a missing claim", () => {
  for (const [status, label] of [["suspended", "Suspended"], ["cancelled", "Cancelled"], [null, "Status unavailable"]] as const) {
    const lifecycle = deriveStoreOrderLifecycle({ commercialStatus: "paid", isAuthorized: false,
      claimStatus: null, membershipStatus: status, automaticallyFulfilled: true });
    assert.equal(lifecycle.fulfillment, "Fulfilled");
    assert.equal(lifecycle.membership, label);
  }
});

test("authorized order with an available key exposes the distinct lifecycle states", () => {
  assert.deepEqual(deriveStoreOrderLifecycle({
    commercialStatus: "pending",
    isAuthorized: true,
    claimStatus: "available",
    membershipStatus: null,
  }), {
    commercial: "Pending payment",
    fulfillment: "Authorized",
    key: "Available",
    membership: "Not claimed",
  });
});

test("claimed Store membership renders active without changing commercial state", () => {
  assert.deepEqual(deriveStoreOrderLifecycle({
    commercialStatus: "pending",
    isAuthorized: true,
    claimStatus: "claimed",
    membershipStatus: "active",
  }), {
    commercial: "Pending payment",
    fulfillment: "Authorized",
    key: "Claimed",
    membership: "Active",
  });
});

test("future paid, claimed, and active lifecycle renders without special casing", () => {
  assert.deepEqual(deriveStoreOrderLifecycle({
    commercialStatus: "paid",
    isAuthorized: true,
    claimStatus: "claimed",
    membershipStatus: "active",
  }), {
    commercial: "Paid",
    fulfillment: "Authorized",
    key: "Claimed",
    membership: "Active",
  });
});

test("revoked and unissued keys remain neutral membership states", () => {
  assert.equal(deriveStoreOrderLifecycle({ commercialStatus: "failed", isAuthorized: false, claimStatus: null, membershipStatus: null }).key, "No key issued");
  assert.equal(deriveStoreOrderLifecycle({ commercialStatus: "cancelled", isAuthorized: true, claimStatus: "revoked", membershipStatus: null }).key, "Revoked");
});
