import assert from "node:assert/strict";
import test from "node:test";
import {
  INNER_SANCTUM_POST_STATUSES,
  INNER_SANCTUM_POST_TYPES,
  isSafeSanctumCta,
} from "../lib/inner-sanctum-posts.ts";

test("FP-5 keeps the publishing vocabulary deliberately small", () => {
  assert.deepEqual(INNER_SANCTUM_POST_TYPES, ["message", "feature", "drop", "task", "benefit"]);
  assert.deepEqual(INNER_SANCTUM_POST_STATUSES, ["draft", "published", "archived"]);
});

test("Inner Sanctum CTAs accept local paths and reject unsafe destinations", () => {
  assert.equal(isSafeSanctumCta("/inner-sanctum/experiences/the_gate"), true);
  assert.equal(isSafeSanctumCta("/inner-sanctum?room=gate"), true);
  assert.equal(isSafeSanctumCta("https://example.com"), false);
  assert.equal(isSafeSanctumCta("//example.com"), false);
  assert.equal(isSafeSanctumCta("/safe\\redirect"), false);
  assert.equal(isSafeSanctumCta("/safe\nredirect"), false);
});
