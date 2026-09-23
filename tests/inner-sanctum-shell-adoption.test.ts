import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const layout = readFileSync("app/inner-sanctum/layout.tsx", "utf8");
const home = readFileSync("app/inner-sanctum/page.tsx", "utf8");
const you = readFileSync("app/inner-sanctum/you/page.tsx", "utf8");
const localNav = readFileSync("components/inner-sanctum-local-nav.tsx", "utf8");

test("Inner Sanctum uses one shared shell and retains a subordinate local nav", () => {
  assert.match(layout, /FilthyShell/);
  assert.match(layout, /InnerSanctumLocalNav/);
  assert.match(layout, /resolveInnerSanctumRouteState\(Boolean\(user\), false\)/);
  assert.doesNotMatch(layout, /signOut|sanctum-header-actions|href="\/filth"|href="\/store"|href="\/contribute"/);
  assert.match(layout, /<div className="inner-sanctum-main">/);
  assert.doesNotMatch(layout, /<main/);
  assert.match(localNav, /\/inner-sanctum\/tasks/);
  assert.match(localNav, /\/inner-sanctum\/collection/);
  assert.match(localNav, /\/inner-sanctum\/benefits/);
  assert.match(localNav, /\/inner-sanctum\/you/);
  assert.match(localNav, /aria-current/);
  assert.match(localNav, /link\.href !== "\/inner-sanctum"/);
});

test("Inner Sanctum content retains member boundary checks and removes duplicate sign-out controls", () => {
  assert.match(home, /hasInnerSanctumAccess\(\)/);
  assert.match(home, /resolveInnerSanctumRouteState\(true, hasAccess\)/);
  assert.match(home, /InnerSanctumPostRenderer/);
  assert.match(home, /inner-sanctum\/collection/);
  assert.doesNotMatch(home, /signOut|Leave quietly|sanctum-account/);
  assert.match(you, /hasInnerSanctumAccess\(\)/);
  assert.match(you, /getInnerSanctumYouState\(\)/);
  assert.match(you, /inner-sanctum\/collection/);
  assert.doesNotMatch(you, /signOut|>Sign out<\/button>/);
});
