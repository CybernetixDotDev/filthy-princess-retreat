import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const action = readFileSync(new URL("../app/admin/collections/actions.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/admin/collections/[id]/page.tsx", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260911133048_inner_sanctum_collections_foundation.sql", import.meta.url), "utf8");

test("collectible grants preserve the active-only database rule and explain invalid Admin attempts", () => {
  assert.match(migration, /status = 'active'/);
  assert.match(action, /active_collectible_required/);
  assert.match(action, /Admin collectible grant failed/);
  assert.match(page, /collectible\.status === "active"/);
});
