import assert from "node:assert/strict";
import test from "node:test";
import { safeNextPath } from "../lib/domain.ts";

const claimPath = "/claim/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

test("claim paths survive sign-in and confirmation-required signup continuation", () => {
  assert.equal(safeNextPath(claimPath, "/home"), claimPath);
  assert.equal(safeNextPath(new URLSearchParams(`next=${encodeURIComponent(claimPath)}`).get("next"), "/home"), claimPath);
});

test("claim continuation rejects external and protocol-relative redirects", () => {
  assert.equal(safeNextPath("https://example.com/claim/secret", "/home"), "/home");
  assert.equal(safeNextPath("//example.com/claim/secret", "/home"), "/home");
  assert.equal(safeNextPath("/claim/secret\nhttps://example.com", "/home"), "/home");
});
