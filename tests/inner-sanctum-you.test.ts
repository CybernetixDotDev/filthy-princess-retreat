import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the You page preserves the canonical membership boundary", () => {
  const source = readFileSync(new URL("../app/inner-sanctum/you/page.tsx", import.meta.url), "utf8");
  assert.match(source, /hasInnerSanctumAccess\(\)/);
  assert.match(source, /getInnerSanctumYouState\(\)/);
});

test("the You composition reuses only existing member-scoped read contracts", () => {
  const source = readFileSync(new URL("../lib/inner-sanctum-you.ts", import.meta.url), "utf8");
  assert.match(source, /get_my_inner_sanctum_access/);
  assert.match(source, /getMyInnerSanctumCollection\(\{ limit: 3 \}\)/);
  assert.match(source, /getMyInnerSanctumBenefits/);
  assert.match(source, /getMyInnerSanctumTasks/);
  assert.doesNotMatch(source, /service.?role|admin_/i);
});
