import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const entrance = readFileSync("app/page.tsx", "utf8");
const signin = readFileSync("app/signin/page.tsx", "utf8");
const forgot = readFileSync("app/forgot-password/page.tsx", "utf8");
const update = readFileSync("app/update-password/page.tsx", "utf8");
const account = readFileSync("app/you/page.tsx", "utf8");
const sanctumYou = readFileSync("app/inner-sanctum/you/page.tsx", "utf8");

test("the entrance remains special and does not adopt the customer world nav", () => {
  assert.match(entrance, /acknowledgeAdult/);
  assert.match(entrance, /authenticatedDestination/);
  assert.match(entrance, /isAdmin \? "\/admin"/);
  assert.match(entrance, /entrance-page/);
  assert.doesNotMatch(entrance, /FilthyShell|FilthyNav/);
});

test("sign-in, signup, and password surfaces remain focused utility screens", () => {
  assert.match(signin, /mode === "signup" \? "signup" : "signin"/);
  assert.match(signin, /href="\/signin\?mode=signup"|initialMode/);
  assert.match(signin, /authReturnPath/);
  for (const source of [signin, forgot, update]) {
    assert.match(source, /auth-page|auth-card/);
    assert.doesNotMatch(source, /FilthyShell|FilthyNav|filthy-nav-world/);
  }
  assert.match(forgot, /PasswordResetRequestForm/);
  assert.match(update, /PasswordChangeForm|hasEmailIdentity/);
});

test("You is an authenticated Account & Settings room inside the customer world", () => {
  assert.match(account, /FilthyShell/);
  assert.match(account, /supabase\.auth\.getUser\(\)/);
  assert.match(account, /redirect\("\/signin\?returnTo=\/you"\)/);
  assert.match(account, /Account &amp; settings/);
  assert.match(account, /Email/);
  assert.match(account, /Linked sign-in providers/);
  assert.match(account, /signOut/);
  assert.doesNotMatch(account, /href="\/contribute"|<main className="auth-page"/);
  assert.match(account, /<div className="account-page">/);
  assert.doesNotMatch(sanctumYou, /FilthyShell|from "@\/app\/you"/);
});
