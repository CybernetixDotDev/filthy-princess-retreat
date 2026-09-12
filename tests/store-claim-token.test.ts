import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { buildStoreClaimUrl, generateStoreClaimToken } from "../lib/store-claim-token.ts";

test("claim tokens contain 32 random bytes and are Base64url encoded", () => {
  const first = generateStoreClaimToken();
  const second = generateStoreClaimToken();
  assert.match(first.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(first.token, "base64url").byteLength, 32);
  assert.notEqual(first.token, second.token);
});

test("claim tokens persist a SHA-256 digest rather than the raw token", () => {
  const result = generateStoreClaimToken();
  assert.match(result.tokenHash, /^[a-f0-9]{64}$/);
  assert.equal(result.tokenHash, createHash("sha256").update(result.token).digest("hex"));
  assert.notEqual(result.tokenHash, result.token);
});

test("the one-time action result can expose a complete customer claim URL", () => {
  const { token } = generateStoreClaimToken();
  assert.equal(buildStoreClaimUrl("https://filthy-princess.example/", token), `https://filthy-princess.example/claim/${token}`);
});
