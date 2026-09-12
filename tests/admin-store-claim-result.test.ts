import assert from "node:assert/strict";
import test from "node:test";
import { selectOneTimeClaimResult } from "../lib/admin-store-claim-result.ts";

test("the authorization result remains available to the persistent one-time result UI", () => {
  const result = selectOneTimeClaimResult(
    { claimUrl: "https://example.com/claim/new-key", message: "Copy this link now." },
    {},
  );
  assert.deepEqual(result, {
    claimUrl: "https://example.com/claim/new-key",
    message: "Copy this link now.",
  });
});

test("a newly reissued key supersedes the earlier ephemeral authorization result", () => {
  const result = selectOneTimeClaimResult(
    { claimUrl: "https://example.com/claim/old-key" },
    { claimUrl: "https://example.com/claim/new-key" },
  );
  assert.equal(result?.claimUrl, "https://example.com/claim/new-key");
});
