import assert from "node:assert/strict";
import test from "node:test";
import { CLAIMED_KEY_EXIT, resolveStoreClaimView } from "../lib/store-claim-state.ts";

test("invalid, revoked, and claimed keys retain their safe public state", () => {
  assert.equal(resolveStoreClaimView("invalid", false), "invalid");
  assert.equal(resolveStoreClaimView("revoked", true), "revoked");
  assert.equal(resolveStoreClaimView("claimed", true), "claimed");
});

test("an available key waits for logged-out visitors and confirms for authenticated users", () => {
  assert.equal(resolveStoreClaimView("available", false), "waiting");
  assert.equal(resolveStoreClaimView("available", true), "confirm");
});

test("the claimed route state offers only the canonical Inner Sanctum exit", () => {
  assert.deepEqual(CLAIMED_KEY_EXIT, {
    supportingCopy: "If this key belongs to your account, you can continue into the Inner Sanctum.",
    label: "Take me to the Inner Sanctum",
    href: "/inner-sanctum",
  });
});
