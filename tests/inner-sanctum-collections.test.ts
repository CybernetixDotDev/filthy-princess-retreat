import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { COLLECTIBLE_STATUSES, INNER_SANCTUM_MEDIA_BUCKET, INNER_SANCTUM_MEDIA_MAX_BYTES, INNER_SANCTUM_MEDIA_TYPES, safeMediaFilename } from "../lib/inner-sanctum-collections.ts";

test("FP-6 keeps the collection and protected-media vocabulary narrow", () => {
  assert.deepEqual(COLLECTIBLE_STATUSES, ["draft", "active", "archived"]);
  assert.equal(INNER_SANCTUM_MEDIA_BUCKET, "inner-sanctum-media");
  assert.equal(INNER_SANCTUM_MEDIA_MAX_BYTES, 20 * 1024 * 1024);
  assert.deepEqual(INNER_SANCTUM_MEDIA_TYPES, ["image/jpeg", "image/png", "image/webp", "video/mp4"]);
  assert.equal(safeMediaFilename("My Private Photo (1).PNG"), "my-private-photo-1-.png");
});

test("collection media signing is limited to paths returned by the owned collection RPC", () => {
  const source = readFileSync(new URL("../lib/inner-sanctum-collection.ts", import.meta.url), "utf8");
  assert.match(source, /rpc\("get_my_inner_sanctum_collection"\)/);
  assert.match(source, /createSignedUrl\(collectible\.media_path, 300\)/);
  assert.doesNotMatch(source, /service.?role/i);
});

test("the member collection route preserves the canonical membership boundary", () => {
  const source = readFileSync(new URL("../app/inner-sanctum/collection/page.tsx", import.meta.url), "utf8");
  assert.match(source, /hasInnerSanctumAccess\(\)/);
  assert.match(source, /getMyInnerSanctumCollection\(\)/);
});
