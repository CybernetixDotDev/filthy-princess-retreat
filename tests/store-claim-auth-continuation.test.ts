import assert from "node:assert/strict";
import test from "node:test";
import { safeNextPath } from "../lib/domain.ts";
import { readFileSync } from "node:fs";

test("anonymous checkout exposes only the public order summary", () => {
  const checkout = readFileSync("app/checkout/[reference]/page.tsx", "utf8");
  assert.match(checkout, /get_public_store_order/);
  assert.match(checkout, /user \? await supabase\.rpc\("get_my_store_checkout"/);
  assert.match(checkout, /!user \? <>[\s\S]*Order status:/);
  assert.doesNotMatch(checkout, /!user\) redirect\(`/);
  assert.match(checkout, /referrer: "no-referrer"/);
  const store = readFileSync("app/store/page.tsx", "utf8");
  assert.doesNotMatch(store, /redirect\("\/signin\?next=\/store"\)/);
  assert.match(store, /const \{ data: progression, error: progressionError \} = user/);
  assert.match(store, /get_my_filth_progression/);
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
