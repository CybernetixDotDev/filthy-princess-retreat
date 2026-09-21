import assert from "node:assert/strict";
import test from "node:test";
import { safeNextPath } from "../lib/domain.ts";
import { readFileSync } from "node:fs";

test("checkout preserves the exact safe local path across signin and email confirmation", () => {
  const path = "/checkout/FP-12345678-ABCDEF12-34567890";
  assert.equal(safeNextPath(new URLSearchParams(`next=${encodeURIComponent(path)}`).get("next")), path);
  assert.equal(safeNextPath("https://attacker.example/checkout", path), path);
  assert.equal(safeNextPath("//attacker.example/checkout", path), path);
  assert.equal(safeNextPath("/\t/attacker.example/checkout", path), path);
  const checkout = readFileSync("app/checkout/[reference]/page.tsx", "utf8");
  assert.match(checkout, /if \(!user\) redirect\(`/);
  assert.match(checkout, /signin\?next=/);
  assert.match(checkout, /referrer: "no-referrer"/);
  const signin = readFileSync("app/signin/page.tsx", "utf8");
  assert.match(signin, /authenticatedDestination\(next\)/);
  const auth = readFileSync("app/actions/auth.ts", "utf8");
  assert.match(auth, /emailRedirectTo:.*auth\/callback\?returnTo=/);
  assert.match(auth, /if \(data\.session\) redirect\(await authenticatedDestination\(next\)\)/);
  const callback = readFileSync("app/auth/callback/route.ts", "utf8");
  assert.match(callback, /authReturnPath/);
  assert.match(callback, /exchangeCodeForSession/);
  assert.match(callback, /new URL\(next, request.url\)/);
});

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
